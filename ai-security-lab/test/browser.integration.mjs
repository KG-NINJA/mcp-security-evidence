import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {GuardedBrowser} from '../dist/browser.js';
import {makePlan,planHash} from '../dist/model.js';
import {consumeApproval} from '../dist/approval.js';
import {readChallenge,evaluateTransition} from '../dist/evaluator.js';
import {makeReport,verifyReport} from '../dist/evidence.js';
import {ORIGIN} from '../dist/scope.js';

await test('synthetic browser fixture: observe, block egress and redirect, approve once, evaluate and seal',async()=>{
 let clicked=false,wrongPort=0,redirectTarget=0;
 const fixture=createServer((req,res)=>{
   if(req.url==='/'){
     res.writeHead(200,{'content-type':'text/html'});
     return res.end('<!doctype html><title>Synthetic fixture</title><button onclick="fetch(\'/clicked\')">Inspect synthetic panel</button><img src="http://127.0.0.1:3001/blocked" alt="">');
   }
   if(req.url==='/clicked'){clicked=true;res.writeHead(200);return res.end('OK');}
   if(req.url==='/api/Challenges/'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({data:[{id:7,solved:clicked}]}));}
   if(req.url==='/redirect'){res.writeHead(302,{location:'/redirect-target'});return res.end();}
   if(req.url==='/redirect-target'){redirectTarget++;res.writeHead(200);return res.end('unexpected');}
   res.writeHead(404);res.end();
 });
 const forbidden=createServer((_,res)=>{wrongPort++;res.end('unexpected');});
 const listen=(s,port)=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',resolve);});
 const close=s=>new Promise(resolve=>s.close(()=>resolve()));
 const dir=await mkdtemp(join(tmpdir(),'lab-browser-')); let browser;
 try{
   await listen(fixture,3000);await listen(forbidden,3001);
   browser=await GuardedBrowser.open();
   const observation=await browser.inspect(dir);
   assert.ok(observation.ui.some(x=>x.role==='button' && x.name==='Inspect synthetic panel'));
   assert.ok(observation.blockedRequests>=1);assert.equal(wrongPort,0);assert.equal(clicked,false);
   assert.ok((await readFile(join(dir,'screenshot.png'))).length>0);
   const plan=makePlan(observation,7);
   assert.equal(await readChallenge(7),false);
   // A synthetic decision in a test-owned, non-security toy fixture. Production CLI still requires a human TTY.
   await assert.rejects(GuardedBrowser.executeApproved(plan,join(dir,'approvals')));
   assert.equal(clicked,false);
   const approvedAt=Date.now();const approvalDir=join(dir,'approvals');await mkdir(approvalDir);
   await writeFile(join(approvalDir,plan.id+'.json'),JSON.stringify({schema:'ai-security-lab-approval/v1',planHash:planHash(plan),nonce:randomUUID(),grantedAt:new Date(approvedAt).toISOString(),expiresAt:new Date(approvedAt+5*60_000).toISOString()}));
   const outcome=await GuardedBrowser.executeApproved(plan,join(dir,'approvals'));
   assert.equal(outcome.execution,'completed');
   assert.equal(outcome.evaluation.status,'verified');
   assert.equal(await readChallenge(7),true);
   const evaluation=evaluateTransition(7,false,true);assert.equal(evaluation.status,'verified');
   await assert.rejects(consumeApproval(plan,join(dir,'approvals')),/APPROVAL_REPLAY/);
   await assert.rejects(browser.page.goto(ORIGIN+'/redirect',{timeout:5000}));assert.equal(redirectTarget,0);
   const report=makeReport({mode:'approved',target:ORIGIN,observation,plan,approval:'consumed',execution:'completed',evaluation});
   report.limitations.push('Synthetic fixture and synthetic test decision; not a human-approved Juice Shop exercise.');
   // Regenerate rather than publish a modified, invalid envelope.
   assert.equal(verifyReport(report),false);
   const summary={schema:'ai-security-lab-ci-demo/v1',timestamp:new Date().toISOString(),scenario:'synthetic-fixture-only',
     isolatedNetwork:true,observed:true,screenshotCaptured:true,wrongPortRequests:wrongPort,redirectTargetRequests:redirectTarget,
     syntheticApprovalSingleUse:true,objectiveTransition:'false_to_true',juiceShopChallengeSolved:false,realSecurityTestExecuted:false};
   await mkdir('ci-artifacts',{recursive:true});await writeFile('ci-artifacts/synthetic-demo.json',JSON.stringify(summary,null,2)+'\n');
 }finally{await browser?.close();await close(fixture);await close(forbidden);await rm(dir,{recursive:true,force:true});}
});
