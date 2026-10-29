import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, sha256, type Observation, type Plan, planHash } from './model.js';
import type { Evaluation } from './evaluator.js';

export type Report = {
  schema:'ai-security-lab-evidence/v1'; id:string; timestamp:string; mode:'passive'|'approved';
  target:string; observation:Observation|null; planHash:string|null; approval:'pending'|'consumed';
  plannedAction:Plan['action']|null; approvalGrantedAt:string|null;
  execution:'not_run'|'completed'|'failed'; evaluation:Evaluation; limitations:string[]; reproduction:string[]; contentHash:string;
};
export function makeReport(input: {mode:'passive'|'approved'; target:string; observation:Observation|null; plan:Plan|null; approval:'pending'|'consumed'; execution:'not_run'|'completed'|'failed'; evaluation:Evaluation; approvalGrantedAt?:string}): Report {
  const data={schema:'ai-security-lab-evidence/v1' as const,id:randomUUID(),timestamp:new Date().toISOString(),mode:input.mode,target:input.target,
    observation:input.observation,planHash:input.plan?planHash(input.plan):null,approval:input.approval,plannedAction:input.plan?.action??null,approvalGrantedAt:input.approvalGrantedAt??null,execution:input.execution,evaluation:input.evaluation,
    limitations:['ローカル演習専用。外部環境や実システムの安全性は示さない。','HTTP GET のみ。POST、認証、フォーム入力、WebSocket は対象外。','スクリーンショットと画面ラベルは機密を含む可能性があるため公開しない。','ハッシュは改変検出用であり、署名や人の承認の証明ではない。','ブラウザへの傍受だけでは完全な通信隔離を保証できず、OS のネットワーク隔離が必要。'],
    reproduction:['隔離された Juice Shop を起動し、127.0.0.1:3000 のみで待ち受ける。','エージェントを同じネットワーク名前空間内で起動し observe を実行する。',
      ...(input.plan?[`計画ハッシュ ${planHash(input.plan)} を確認し、対話式承認後、表示名 ${JSON.stringify(input.plan.action.name)} のボタンを一度クリックする。`]:['計画を作成して人の承認を待つ。'])]};
  return {...data,contentHash:'sha256:'+sha256(canonical(data))};
}
export function verifyReport(report: Report): boolean {
  if (!report || typeof report !== 'object' || typeof report.contentHash !== 'string') return false;
  const {contentHash,...rest}=report;
  try{return contentHash==='sha256:'+sha256(canonical(rest));}catch{return false;}
}
export async function writeReport(dir:string,report:Report):Promise<void>{
  await mkdir(dir,{recursive:true,mode:0o700});
  const json=JSON.stringify(report,null,2)+'\n';
  const escape=(s:string)=>s.replace(/[\\`*_{}\[\]<>]/g,'\\$&');
  const md=['# AI Security Lab Evidence','',`- 時刻: ${report.timestamp}`,`- モード: ${report.mode}`,`- 対象: ${report.target}`,`- 承認: ${report.approval}`,`- 操作: ${report.execution}`,`- 客観評価: ${report.evaluation.status} (${report.evaluation.reason})`,`- 内容ハッシュ: ${report.contentHash}`,`- JSON ファイル SHA-256: ${sha256(json)}`,'','## 再現手順','',...report.reproduction.map(s=>'- '+escape(s)),'','## 制限','',...report.limitations.map(s=>'- '+escape(s)),''].join('\n');
  await writeFile(join(dir,'report.json'),json,{mode:0o600});
  await writeFile(join(dir,'report.md'),md,{mode:0o600});
}
