import test from 'node:test';
import assert from 'node:assert/strict';
import {runWireLab,asMarkdown} from '../scripts/loopback-authz-lab.mjs';
test('HTTP authorization lab returns the expected status for each scoped request',async()=>{
 const result=await runWireLab();
 assert.equal(result.tests.length,8);
 assert.equal(result.pass,true);
 assert.equal(result.real_target_requests,0);
 assert.ok(result.tests.every(x=>x.passed));
 assert.equal(result.tests[1].observed_http_status,404);
 assert.equal(result.tests[2].observed_http_status,401);
 assert.equal(result.tests[3].observed_http_status,403);
 assert.match(asMarkdown(result),/SYNTHETIC LOOPBACK-ONLY/);
});
