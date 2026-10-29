import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inScope,allowedRequest,assertLoopbackListener,ORIGIN} from '../dist/scope.js';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {readChallenge} from '../dist/evaluator.js';

await test('exact literal origin only, with no parser normalization bypasses',()=>{
  for(const x of [ORIGIN+'/', ORIGIN+'/assets/app.js?q=a', ORIGIN+'/#/home'])assert.equal(inScope(x),true,x);
  for(const x of ['http://localhost:3000/','http://127.1:3000/','http://2130706433:3000/','http://0177.0.0.1:3000/',
    'http://127%2e0%2e0%2e1:3000/', 'http://127.0.0.1:3001/', 'https://127.0.0.1:3000/',
    'http://user@127.0.0.1:3000/','http://127.0.0.1:3000@invalid.example/','http://[::1]:3000/',
    'file:///etc/passwd','http://127.0.0.1:3000.evil/','http://127.0.0.1:3000\\@evil/'])assert.equal(inScope(x),false,x);
  assert.equal(allowedRequest(ORIGIN+'/x','GET',false),true);
  assert.equal(allowedRequest(ORIGIN+'/x','GET',true),false);
  for(const method of ['POST','PUT','DELETE','HEAD'])assert.equal(allowedRequest(ORIGIN+'/x',method,false),false);
});
await test('listener check rejects wildcard and requires IPv4 loopback',async()=>{
  const listen=(host)=>new Promise((resolve,reject)=>{const server=createServer((_,res)=>res.end('ok'));server.once('error',reject);server.listen(3000,host,()=>resolve(server));});
  const close=(s)=>new Promise((resolve,reject)=>s.close(e=>e?reject(e):resolve()));
  const wildcard=await listen('0.0.0.0');
  try{assert.throws(()=>assertLoopbackListener(),/LISTENER_NOT_LOOPBACK/);}finally{await close(wildcard);}
  const loopback=await listen('127.0.0.1');
  try{assert.doesNotThrow(()=>assertLoopbackListener());}finally{await close(loopback);}
});
await test('Juice Shop preload binds listen(3000) to loopback',()=>{
 const snippet="const h=require('node:http').createServer();h.listen(3000,()=>{console.log(h.address().address);h.close()})";
 const result=spawnSync(process.execPath,['--require','./scripts/force-loopback.cjs','-e',snippet],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'127.0.0.1');
});
await test('objective reader uses only the fixed local endpoint, rejects redirects and duplicate IDs',async()=>{
 let mode='valid';const server=createServer((req,res)=>{
  assert.equal(req.url,'/api/Challenges/');assert.equal(req.method,'GET');
  if(mode==='redirect'){res.writeHead(302,{location:'/outside'});return res.end();}
  const data=mode==='duplicate'?[{id:7,solved:false},{id:7,solved:true}]:[{id:7,solved:false}];
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data}));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3000,'127.0.0.1',resolve);});
 try{assert.equal(await readChallenge(7),false);mode='redirect';assert.equal(await readChallenge(7),null);mode='duplicate';assert.equal(await readChallenge(7),null);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
