import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {consumeApproval} from '../dist/approval.js';
import {makePlan,planHash,validatePlan} from '../dist/model.js';
import {ORIGIN} from '../dist/scope.js';
import {assertActionDeadline} from '../dist/browser.js';
const obs={schema:'ai-security-lab-observation/v1',target:ORIGIN,ui:[{role:'button',name:'Synthetic button'}]};
await test('approval and plan remain valid immediately before the click',()=>{
 const now=Date.now(); const plan=makePlan(obs,undefined,now);
 const expiry=new Date(now+5000).toISOString();
 assert.doesNotThrow(()=>assertActionDeadline(plan,expiry,now+4999));
 assert.throws(()=>assertActionDeadline(plan,expiry,now+5000),/APPROVAL_EXPIRED/);
 assert.throws(()=>assertActionDeadline(plan,new Date(now+20*60_000).toISOString(),now+15*60_000),/PLAN_EXPIRED/);
});
async function directory(){return mkdtemp(join(tmpdir(),'lab-approval-'));}
async function syntheticApproval(plan,dir,now){
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,plan.id+'.json'),JSON.stringify({schema:'ai-security-lab-approval/v1',planHash:planHash(plan),nonce:randomUUID(),grantedAt:new Date(now).toISOString(),expiresAt:new Date(now+5*60_000).toISOString()}));
}
await test('only an exact decision for an unchanged unexpired plan is accepted',async()=>{
 const dir=await directory();const now=Date.now();const plan=makePlan(obs,7,now);
 try {
   await syntheticApproval(plan,dir,now);
   const altered=structuredClone(plan);altered.action.name='Other button';
   await assert.rejects(consumeApproval(altered,dir,now+1),/INVALID_APPROVAL/);
   assert.throws(()=>validatePlan({...plan,target:'http://localhost:3000'},now),/INVALID_PLAN/);
   assert.throws(()=>validatePlan(plan,now+16*60_000),/PLAN_EXPIRED/);
   await assert.rejects(consumeApproval(plan,dir,now+5*60_000),/APPROVAL_EXPIRED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
await test('one-time receipt resists parallel replay and fails closed on corruption',async()=>{
 const dir=await directory();const now=Date.now();const plan=makePlan(obs,undefined,now);
 try {
  await syntheticApproval(plan,dir,now);
  const results=await Promise.allSettled(Array.from({length:12},()=>consumeApproval(plan,dir,now+1)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected' && /APPROVAL_REPLAY/.test(String(x.reason))).length,11);
  const file=join(dir,plan.id+'.json');const data=JSON.parse(await readFile(file,'utf8'));data.planHash='0'.repeat(64);await writeFile(file,JSON.stringify(data));
  await assert.rejects(consumeApproval(plan,dir,now+2),/INVALID_APPROVAL/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
await test('operator approval cannot be issued by piped stdin',()=>{
 const result=spawnSync(process.execPath,['dist/cli.js','approve'],{input:'APPROVE anything\n',encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/INTERACTIVE_TTY_REQUIRED/);
});
await test('AI input is restricted to inert hypothesis and cannot choose an action',()=>{
 const plan=makePlan(obs,undefined,Date.now(),{hypothesis:'入力欄の権限検証が必要かもしれない'});
 assert.equal(plan.action.name,'Synthetic button');
 assert.throws(()=>makePlan(obs,undefined,Date.now(),{hypothesis:'x',action:'execute'}),/INVALID_AI_SUGGESTION/);
 assert.throws(()=>makePlan(obs,undefined,Date.now(),{hypothesis:'one\ntwo'}),/INVALID_AI_SUGGESTION/);
});
