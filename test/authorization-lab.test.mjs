import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCasebook,markdown} from '../scripts/authorization-lab.mjs';
test('synthetic cross-tenant and write authorization cases are blocked without network',()=>{
 const result=executeCasebook();
 assert.equal(result.results.length,7);
 assert.equal(result.target_requests,0);
 assert.equal(result.external_commands,0);
 assert.equal(result.results.filter(x=>x.outcome==='synthetic_abuse_blocked').length,5);
 assert.equal(result.results.filter(x=>x.outcome==='authorized_control_passed').length,2);
 assert.deepEqual(executeCasebook(),result);
 assert.match(markdown(result),/written scope/);
 assert.match(markdown(result),/Lab-only/);
});
