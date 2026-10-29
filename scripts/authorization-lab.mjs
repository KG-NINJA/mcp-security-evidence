// Offline authorization threat lab: intentionally vulnerable synthetic reference
// and corrected reference. Not a scanner and never connects to a real target.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const fixtures=Object.freeze({
  accounts:[{tenant:'alpha',id:'record-A',value:'fictional A'}, {tenant:'beta',id:'record-B',value:'fictional B'}],
  identities:[{id:'analyst-alpha',tenant:'alpha',scopes:['read']},{id:'editor-alpha',tenant:'alpha',scopes:['read','write']}]
});
const clone=x=>structuredClone(x);
function vulnerable(request,records){
  // Intentionally insecure fixture only: ignores tenant and operation permission.
  const rec=records.find(x=>x.id===request.record_id);
  if(!rec)return {status:404,code:'NOT_FOUND'};
  if(request.operation==='read')return {status:200,code:'READ_OK',value:rec.value};
  if(request.operation==='delete'){records.splice(records.indexOf(rec),1);return {status:200,code:'DELETED'};}
  return {status:400,code:'UNKNOWN_OPERATION'};
}
function hardened(request,records){
  const actor=fixtures.identities.find(a=>a.id===request.actor_id);
  if(!actor)return {status:401,code:'UNAUTHENTICATED'};
  const scope=request.operation==='delete'?'write':'read';
  if(!actor.scopes.includes(scope))return {status:403,code:'SCOPE_DENIED'};
  const record=records.find(x=>x.id===request.record_id && x.tenant===actor.tenant);
  if(!record)return {status:404,code:'NOT_FOUND_OR_OUT_OF_SCOPE'};
  if(request.operation==='read')return {status:200,code:'READ_OK',value:record.value};
  if(request.operation==='delete'){
    // Explicit approval is verified against the selected record and actor;
    // client-supplied text/annotations are not authorization.
    if(request.confirmation?.actor_id!==actor.id || request.confirmation?.record_id!==record.id ||
       request.confirmation?.operation!=='delete' || request.confirmation?.authorized!==true)
      return {status:403,code:'CONFIRMATION_REQUIRED'};
    records.splice(records.indexOf(record),1);return {status:200,code:'DELETED'};
  }
  return {status:400,code:'UNKNOWN_OPERATION'};
}
const scenarios=[
 {id:'AUTHZ-01',name:'Cross-tenant object read',category:'Broken object-level authorization',
  request:{actor_id:'analyst-alpha',operation:'read',record_id:'record-B'},
  unsafe:200,secured:404},
 {id:'AUTHZ-02',name:'Read-only actor requesting delete',category:'Function-level authorization',
  request:{actor_id:'analyst-alpha',operation:'delete',record_id:'record-A'},
  unsafe:200,secured:403},
 {id:'AUTHZ-03',name:'Write scope without confirmation',category:'User confirmation',
  request:{actor_id:'editor-alpha',operation:'delete',record_id:'record-A'},
  unsafe:200,secured:403},
 {id:'AUTHZ-04',name:'Tool hint cannot override permission',category:'Untrusted tool annotation',
  request:{actor_id:'analyst-alpha',operation:'delete',record_id:'record-A',annotation:{readOnlyHint:true,role:'admin'}},
  unsafe:200,secured:403},
 {id:'AUTHZ-05',name:'Unrecognized identity',category:'Authentication',
  request:{actor_id:'unknown',operation:'read',record_id:'record-A'},
  unsafe:200,secured:401},
 {id:'AUTHZ-06',name:'Correctly scoped read',category:'Authorized control',
  request:{actor_id:'analyst-alpha',operation:'read',record_id:'record-A'},
  unsafe:200,secured:200},
 {id:'AUTHZ-07',name:'Approved write inside own tenant',category:'Authorized control',
  request:{actor_id:'editor-alpha',operation:'delete',record_id:'record-A',
    confirmation:{actor_id:'editor-alpha',record_id:'record-A',operation:'delete',authorized:true}},
  unsafe:200,secured:200}
];
export function executeCasebook(){
 const findings=scenarios.map(s=>{
  const insecure=clone(fixtures.accounts),secure=clone(fixtures.accounts);
  const before=vulnerable(s.request,insecure),after=hardened(s.request,secure);
  assert.equal(before.status,s.unsafe,'Unexpected baseline: '+s.id);
  assert.equal(after.status,s.secured,'Unexpected safe result: '+s.id);
  return {id:s.id,category:s.category,scenario:s.name,
    observed_before:{status:before.status,code:before.code},
    observed_after:{status:after.status,code:after.code},
    unsafe_state_changed:insecure.length!==fixtures.accounts.length,
    protected_state_changed:secure.length!==fixtures.accounts.length,
    outcome:s.secured===200?'authorized_control_passed':'synthetic_abuse_blocked'};
 });
 const data={schema_version:'offline-mcp-authorization-lab/1.0',
  methodology:'synthetic vulnerable vs hardened in-memory reference implementation',
  controls:scenarios.length,
  before_hash:'sha256:'+createHash('sha256').update(JSON.stringify(fixtures)).digest('hex'),
  results:findings,
  target_requests:0,external_commands:0,
  limitations:[
   'Synthetic local logic is not a vulnerability found in an external or production MCP server.',
   'Role, identity and approval are hard-coded fixtures; production identity and consent validation were not assessed.',
   'No network, MCP wire protocol, real credentials or persistence is involved.',
   'A real engagement requires written scope authorization, independent reproduction, severity confirmation and post-fix retest.'
  ]};
 assert.equal(data.results.filter(x=>x.outcome==='synthetic_abuse_blocked').length,5);
 assert.equal(data.results.filter(x=>x.outcome==='authorized_control_passed').length,2);
 assert.equal(data.target_requests,0);
 return data;
}
export function markdown(report){
 return ['# MCP authorization test casebook (synthetic)','',
 '**Lab-only reference. No claim of real-world exploitation or customer testing.**','',
 '## Scope and method','',report.methodology,'',
 '| ID | Security check | Insecure fixture | Hardened fixture | Result |',
 '|---|---|---|---|---|',
 ...report.results.map(r=>`| ${r.id} | ${r.category} | ${r.observed_before.status} ${r.observed_before.code} | ${r.observed_after.status} ${r.observed_after.code} | ${r.outcome} |`),
 '', '## Evidence','',
 `Scenario count: ${report.controls}; target requests: ${report.target_requests}; commands: ${report.external_commands}.`,
 `Fixture SHA-256: ${report.before_hash}.`, '',
 '## What a practitioner should verify in a real authorized project','',
 '- Confirm ownership, written scope and permission to use test accounts.',
 '- Verify access across two independent tenant contexts and read/write roles.',
 '- Confirm that MCP tool annotations never grant privileges.',
 '- Verify that destructive actions require server-side confirmation.',
 '- Review sanitized request/response evidence and confirm results after a fix.', '',
 '## Limitations','', ...report.limitations.map(s=>'- '+s),''].join('\n');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=executeCasebook();const dir=resolve('artifacts/authorization-lab');
 mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
 writeFileSync(resolve(dir,'report.md'),markdown(report));
 console.log(markdown(report));
}
