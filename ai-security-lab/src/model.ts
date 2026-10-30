import { createHash, randomUUID } from 'node:crypto';
import { ORIGIN } from './scope.js';

export type UiElement = { role: 'button' | 'link' | 'textbox'; name: string };
export type Observation = {
  schema: 'ai-security-lab-observation/v1'; observedAt: string; target: string;
  ui: UiElement[]; responses: {status: number; type: string; resource: string}[];
  blockedRequests: number; screenshotSha256: string;
};
export type Plan = {
  schema: 'ai-security-lab-plan/v1'; id: string; createdAt: string; expiresAt: string;
  target: string; hypothesis: string; action: {kind: 'click_button'; name: string};
  objective: {kind: 'juice_challenge'; id: number} | {kind: 'none'};
};
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
    const o = value as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  throw new Error('NON_JSON_VALUE');
}
export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export const planHash = (plan: Plan): string => sha256(canonical(plan));
const hasKeys = (x: object, keys: string[]) => Object.keys(x).sort().join('|') === keys.sort().join('|');
const cleanLabel = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').trim();

export function validatePlan(x: unknown, now = Date.now()): asserts x is Plan {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('INVALID_PLAN');
  const p = x as Plan;
  if (!hasKeys(p, ['schema','id','createdAt','expiresAt','target','hypothesis','action','objective']) ||
    p.schema !== 'ai-security-lab-plan/v1' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.id) ||
    p.target !== ORIGIN || typeof p.hypothesis !== 'string' || p.hypothesis.length < 1 || p.hypothesis.length > 240 ||
    !p.action || !hasKeys(p.action, ['kind','name']) || p.action.kind !== 'click_button' ||
    typeof p.action.name !== 'string' || p.action.name.length < 1 || p.action.name.length > 80 || cleanLabel(p.action.name) !== p.action.name ||
    !p.objective || typeof p.objective !== 'object' ||
    !((p.objective.kind === 'none' && hasKeys(p.objective,['kind'])) ||
      (p.objective.kind === 'juice_challenge' && hasKeys(p.objective,['kind','id']) && Number.isSafeInteger(p.objective.id) && p.objective.id > 0 && p.objective.id <= 10000))) throw new Error('INVALID_PLAN');
  const start = Date.parse(p.createdAt); const end = Date.parse(p.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString() !== p.createdAt || new Date(end).toISOString() !== p.expiresAt || start > now || end <= now || end <= start || end - start > 30 * 60_000) throw new Error('PLAN_EXPIRED_OR_INVALID_TIME');
}

/** Fixed rules use only observed roles/names. No exercise solutions or remote AI are loaded. */
export function makePlan(observation: Observation, challengeId?: number, now = Date.now(), suggestion?: unknown): Plan {
  if (!observation || observation.schema !== 'ai-security-lab-observation/v1' || observation.target !== ORIGIN || !Array.isArray(observation.ui)) throw new Error('INVALID_OBSERVATION');
  const button = observation.ui.find(x => x.role === 'button' && typeof x.name === 'string' && x.name.length > 0 && x.name.length <= 80 && cleanLabel(x.name) === x.name);
  if (!button) throw new Error('NO_NAMED_BUTTON');
  let hypothesis='観察したボタンの操作で画面状態が変わる可能性がある。セキュリティ上の問題かどうかは未検証。';
  if (suggestion !== undefined) {
    if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion) || !hasKeys(suggestion,['hypothesis']) ||
        typeof (suggestion as {hypothesis?:unknown}).hypothesis !== 'string') throw new Error('INVALID_AI_SUGGESTION');
    hypothesis=(suggestion as {hypothesis:string}).hypothesis;
    if (!hypothesis || hypothesis.length > 240 || cleanLabel(hypothesis) !== hypothesis) throw new Error('INVALID_AI_SUGGESTION');
  }
  const plan: Plan = {schema:'ai-security-lab-plan/v1', id:randomUUID(), createdAt:new Date(now).toISOString(), expiresAt:new Date(now + 15*60_000).toISOString(), target:ORIGIN,
    hypothesis,
    action:{kind:'click_button',name:button.name}, objective:challengeId === undefined ? {kind:'none'} : {kind:'juice_challenge',id:challengeId}};
  validatePlan(plan, now); return plan;
}
