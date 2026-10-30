// Offline-only association: validate the lab report and a peer v2 event separately.
// Does not relabel, import, send, sign or change either artifact.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyReport} from '../dist/evidence.js';
const peerFile=process.argv[2];
if(!peerFile || process.argv.length!==3)throw new Error('USAGE: node scripts/link-peer-evidence.mjs PEER_EVENT.json');
const verifier=await import('../../dist/evidence-json.js');
const labBytes=await readFile('artifacts/report.json'), peerBytes=await readFile(peerFile);
if(labBytes.length>128*1024 || peerBytes.length>verifier.MAX_EVIDENCE_BYTES)throw new Error('INPUT_TOO_LARGE');
const report=JSON.parse(labBytes.toString('utf8'));
if(!verifyReport(report))throw new Error('INVALID_LAB_REPORT');
const result=await verifier.verifyEvidenceJson(peerBytes);
if(!result.valid)throw new Error('INVALID_PEER_EVENT');
const sha=x=>createHash('sha256').update(x).digest('hex');
const payload={schema:'ai-security-lab-link/v1',timestamp:new Date().toISOString(),labReportSha256:sha(labBytes),peerEventSha256:sha(peerBytes),peerContract:'2.0.0',peerVerifier:'mcp-security-evidence offline verifier',labHashValid:true,peerHashValid:true,authenticityVerified:false};
await writeFile('artifacts/linked-manifest.json',JSON.stringify(payload,null,2)+'\n',{mode:0o600});
console.log('OFFLINE_LINK_CREATED; hash checks do not prove provenance or authorization.');
