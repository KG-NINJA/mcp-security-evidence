// Node.js loopback-only HTTP security test harness. Synthetic data and tokens only.
// The listener is bound to 127.0.0.1 with an ephemeral port; it is never public.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const actors=new Map([
 ['synthetic-analyst-alpha-token-00000000',{id:'analyst-alpha',tenant:'alpha',roles:['read']}],
 ['synthetic-editor-alpha-token-000000000',{id:'editor-alpha',tenant:'alpha',roles:['read','write']}]
]);
const data=[
 {tenant:'alpha',id:'A1',value:'fictional report A'},
 {tenant:'beta',id:'B1',value:'fictional report B'}
];
function respond(res,status,body){
 res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(body));
}
function createLabServer(){
 const records=data.map(x=>({...x}));
 const approvals=new Set(['editor-alpha:delete:A1:synthetic-approval']);
 return createServer((req,res)=>{
  const url=new URL(req.url??'/', 'http://localhost');
  const matches=/^\/record\/(A1|B1)$/.exec(url.pathname);
  if(!matches || !['GET','DELETE'].includes(req.method??''))return respond(res,404,{code:'NOT_FOUND'});
  const token=(req.headers.authorization??'').replace(/^Bearer /,'');
  const actor=actors.get(token);
  if(!actor)return respond(res,401,{code:'UNAUTHENTICATED'});
  const permission=req.method==='DELETE'?'write':'read';
  if(!actor.roles.includes(permission))return respond(res,403,{code:'SCOPE_DENIED'});
  const record=records.find(x=>x.id===matches[1]&&x.tenant===actor.tenant);
  if(!record)return respond(res,404,{code:'NOT_FOUND_OR_OUT_OF_SCOPE'});
  if(req.method==='GET')return respond(res,200,{code:'READ_OK',value:record.value});
  // A synthetic preissued one-time approval. Not a real user-consent workflow.
  const approval=actor.id+':delete:'+record.id+':'+(req.headers['x-approval']??'');
  if(!approvals.delete(approval))return respond(res,403,{code:'CONFIRMATION_REQUIRED'});
  records.splice(records.indexOf(record),1);
  return respond(res,200,{code:'DELETED'});
 });
}
export async function runWireLab(){
 const server=createLabServer();
 // No arbitrary address or port parameters; no route to external targets.
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 const address=server.address();
 assert.ok(address && typeof address==='object');
 const origin='http://127.0.0.1:'+address.port;
 const analyst='synthetic-analyst-alpha-token-00000000';
 const editor='synthetic-editor-alpha-token-000000000';
 const cases=[
  {id:'HTTP-01',method:'GET',path:'/record/A1',token:analyst,expected:200,label:'own-tenant read'},
  {id:'HTTP-02',method:'GET',path:'/record/B1',token:analyst,expected:404,label:'cross-tenant read denied'},
  {id:'HTTP-03',method:'GET',path:'/record/A1',token:null,expected:401,label:'unauthenticated read denied'},
  {id:'HTTP-04',method:'DELETE',path:'/record/A1',token:analyst,expected:403,label:'write denied to reader'},
  {id:'HTTP-05',method:'DELETE',path:'/record/A1',token:editor,expected:403,label:'missing approval'},
  {id:'HTTP-06',method:'GET',path:'/record/A1',token:analyst,expected:200,label:'spurious role hint ignored',
   headers:{'x-role':'admin','x-read-only-hint':'false'}},
  {id:'HTTP-07',method:'DELETE',path:'/record/A1',token:editor,expected:200,label:'synthetic approved write',
   headers:{'x-approval':'synthetic-approval'}},
  {id:'HTTP-08',method:'DELETE',path:'/record/A1',token:editor,expected:404,label:'replay after deletion rejected',
   headers:{'x-approval':'synthetic-approval'}}
 ];
 const results=[];
 try{
  for(const c of cases){
   const response=await fetch(origin+c.path,{
    method:c.method,headers:{...(c.token?{authorization:'Bearer '+c.token}:{}),...c.headers},
    signal:AbortSignal.timeout(3000)
   });
   const body=await response.json();
   assert.equal(response.status,c.expected, c.id+': '+JSON.stringify(body));
   results.push({id:c.id,scenario:c.label,method:c.method,expected_http_status:c.expected,
    observed_http_status:response.status,result_code:body.code,passed:true});
  }
  const report={schema_version:'loopback-http-authz/v1',transport:'http://127.0.0.1 ephemeral port only',
   tests:results,pass:results.every(x=>x.passed),real_target_requests:0,
   caveats:['Synthetic bearer strings and one-time approval are not real IAM or human consent.',
    'Pure Node HTTP reference, not a deployed MCP server and not a client penetration test.',
    'No public IP, external host, real credentials, or customer data is involved.']};
  return report;
 } finally {
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }
}
export function asMarkdown(report){
 return ['# Local HTTP authorization verification','',
 '**SYNTHETIC LOOPBACK-ONLY. NOT A PENTEST OR CUSTOMER VULNERABILITY.**','',
 '| Case | Method | Scenario | Expected | Observed | Result |',
 '|---|---|---|---:|---:|---|',
 ...report.tests.map(c=>`| ${c.id} | ${c.method} | ${c.scenario} | ${c.expected_http_status} | ${c.observed_http_status} | ${c.passed?'PASS':'FAIL'} |`),
 '', 'Run is reproducible with `npm run lab:http`.', '',
 ...report.caveats.map(x=>'- '+x),''].join('\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await runWireLab();const folder=resolve('artifacts/http-lab');
 mkdirSync(folder,{recursive:true});
 writeFileSync(resolve(folder,'report.json'),JSON.stringify(result,null,2)+'\n');
 writeFileSync(resolve(folder,'report.md'),asMarkdown(result));
 console.log(asMarkdown(result));
}
