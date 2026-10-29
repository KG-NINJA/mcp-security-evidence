import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { canonical, planHash, validatePlan, type Plan } from './model.js';

export type Approval = {schema:'ai-security-lab-approval/v1'; planHash:string; nonce:string; grantedAt:string; expiresAt:string};
async function createApproval(plan: Plan, dir: string, typed: string, now = Date.now()): Promise<Approval> {
  validatePlan(plan, now);
  const hash = planHash(plan);
  if (typed !== `APPROVE ${hash}`) throw new Error('APPROVAL_NOT_CONFIRMED');
  const a: Approval = {schema:'ai-security-lab-approval/v1', planHash:hash, nonce:randomUUID(), grantedAt:new Date(now).toISOString(), expiresAt:new Date(Math.min(now+5*60_000, Date.parse(plan.expiresAt))).toISOString()};
  await mkdir(dir, {recursive:true, mode:0o700});
  await writeFile(join(dir,`${plan.id}.json`), canonical(a)+'\n', {mode:0o600, flag:'wx'});
  return a;
}
/** Production issuance has no noninteractive, auto-yes or environment bypass. */
export async function interactiveApprove(plan:Plan,dir:string):Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('INTERACTIVE_TTY_REQUIRED');
  validatePlan(plan);
  const hash=planHash(plan);
  console.log(JSON.stringify(plan,null,2));
  console.log('This approves one exact button click plus the optional objective read for the isolated local lab. It expires within five minutes.');
  const rl=createInterface({input:stdin,output:stdout});
  let typed:string;
  try { typed=await rl.question(`Type APPROVE ${hash} to authorize: `); } finally { rl.close(); }
  await createApproval(plan,dir,typed);
}
export async function consumeApproval(plan: Plan, dir: string, now = Date.now()): Promise<Approval> {
  validatePlan(plan, now);
  const raw = await readFile(join(dir,`${plan.id}.json`), 'utf8');
  if (Buffer.byteLength(raw) > 4096) throw new Error('INVALID_APPROVAL');
  const a = JSON.parse(raw) as Approval;
  if (!a || Object.keys(a).sort().join('|') !== ['schema','planHash','nonce','grantedAt','expiresAt'].sort().join('|') ||
    a.schema !== 'ai-security-lab-approval/v1' || a.planHash !== planHash(plan) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.nonce)) throw new Error('INVALID_APPROVAL');
  const start = Date.parse(a.grantedAt), end = Date.parse(a.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString() !== a.grantedAt || new Date(end).toISOString() !== a.expiresAt || start > now || end <= now || end <= start || end-start > 5*60_000 || end > Date.parse(plan.expiresAt)) throw new Error('APPROVAL_EXPIRED');
  const used = join(dir,'used'); await mkdir(used,{recursive:true,mode:0o700});
  let handle;
  try { handle = await open(join(used,a.nonce),'wx',0o600); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('APPROVAL_REPLAY'); throw e; }
  try { await handle.writeFile(a.planHash+'\n'); } finally { await handle.close(); }
  return a;
}
