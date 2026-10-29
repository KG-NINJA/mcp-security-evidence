import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeReport,verifyReport,writeReport} from '../dist/evidence.js';
import {evaluateTransition} from '../dist/evaluator.js';
import {ORIGIN} from '../dist/scope.js';
import {sha256,canonical} from '../dist/model.js';
import {withDeadline} from '../dist/browser.js';
await test('evaluation requires a fresh false-to-true objective transition',()=>{
 assert.equal(evaluateTransition(7,false,true).status,'verified');
 for(const [before,after] of [[true,true],[false,false],[null,true],[false,null],[true,false]])assert.equal(evaluateTransition(7,before,after).status,'not_verified');
 assert.equal(evaluateTransition(null,false,true).status,'not_verified');
});
await test('report records limitations, steps and an independently recomputable hash',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lab-evidence-'));
 try {
  const report=makeReport({mode:'passive',target:ORIGIN,observation:null,plan:null,approval:'pending',execution:'not_run',evaluation:evaluateTransition(null,null,null)});
  assert.equal(verifyReport(report),true);const {contentHash,...payload}=report;
  assert.equal(contentHash,'sha256:'+sha256(canonical(payload)));
  await writeReport(dir,report);const json=await readFile(join(dir,'report.json'),'utf8');const md=await readFile(join(dir,'report.md'),'utf8');
  assert.equal(verifyReport(JSON.parse(json)),true);assert.ok(md.includes(sha256(json)));assert.ok(md.includes('再現手順'));
  const changed=JSON.parse(json);changed.evaluation.status='verified';assert.equal(verifyReport(changed),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
await test('deadline closes resource and fails rather than reporting success',async()=>{
 let closed=false;
 await assert.rejects(withDeadline(()=>new Promise(()=>{}),20,async()=>{closed=true;}),/DEADLINE_EXCEEDED/);
 assert.equal(closed,true);
});
