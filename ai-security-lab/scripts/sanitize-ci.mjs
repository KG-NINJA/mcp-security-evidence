import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyReport} from '../dist/evidence.js';
const r=JSON.parse(await readFile('artifacts/report.json','utf8'));
if(!verifyReport(r) || r.mode!=='passive' || r.approval!=='pending' || r.execution!=='not_run' || r.evaluation.status!=='not_verified')throw new Error('UNSAFE_OR_INVALID_CI_REPORT');
const safe={schema:'ai-security-lab-ci-evidence/v1',timestamp:r.timestamp,scope:'127.0.0.1:3000 only',mode:'passive',approval:'pending',execution:'not_run',evaluation:'not_verified',
 uiCount:r.observation?.ui?.length ?? 0,responseCount:r.observation?.responses?.length ?? 0,blockedRequests:r.observation?.blockedRequests ?? 0,
 screenshotCaptured:typeof r.observation?.screenshotSha256==='string',reportContentHash:r.contentHash,
 limitations:['No active security test was run.','No exercise was claimed solved.','Screenshot, UI text, URLs and headers were not uploaded.','Hashes are integrity checks, not signatures.']};
const json=JSON.stringify(safe,null,2)+'\n';const sha=createHash('sha256').update(json).digest('hex');
await mkdir('ci-artifacts',{recursive:true});
await writeFile('ci-artifacts/juice-passive-evidence.json',json);
await writeFile('ci-artifacts/juice-passive-evidence.md',`# Juice Shop passive observation\n\n- Time: ${safe.timestamp}\n- Local target: ${safe.scope}\n- Approval: pending; active test: not run\n- Evaluation: not verified\n- UI elements: ${safe.uiCount}\n- Responses: ${safe.responseCount}\n- Blocked requests: ${safe.blockedRequests}\n- JSON SHA-256: ${sha}\n\nNo screenshots, UI labels, request URLs or headers are included.\n`);
