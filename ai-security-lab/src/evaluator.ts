import { get } from 'node:http';
import { PORT } from './scope.js';

export type Evaluation = {status:'verified'|'not_verified'; reason:string; challengeId:number|null; before:boolean|null; after:boolean|null};
export function evaluateTransition(id:number|null, before:boolean|null, after:boolean|null): Evaluation {
  if (id !== null && before === false && after === true) return {status:'verified',reason:'local_challenge_false_to_true',challengeId:id,before,after};
  return {status:'not_verified',reason:id===null?'objective_not_configured':before===true?'already_solved_before_action':'no_verified_transition',challengeId:id,before,after};
}

/** A single fixed local read, no redirects, no credential headers; only called after approval. */
export async function readChallenge(id: number): Promise<boolean | null> {
  return new Promise(resolve => {
    let finished=false; const done=(x:boolean|null) => { if (!finished) {finished=true;resolve(x);} };
    const req=get({hostname:'127.0.0.1',port:PORT,path:'/api/Challenges/',method:'GET',headers:{accept:'application/json'},timeout:3000}, res=>{
      if (res.statusCode !== 200) {res.resume();done(null);return;}
      let size=0; const chunks:Buffer[]=[];
      res.on('data',(c:Buffer)=>{size+=c.length;if(size>1024*1024){res.destroy();done(null);}else chunks.push(c);});
      res.on('end',()=>{try {
        const value:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const data=(value as {data?:unknown})?.data;
        if (!Array.isArray(data)) return done(null);
        const hits=data.filter((x:unknown)=>typeof x==='object'&&x!==null&&(x as {id?:unknown}).id===id);
        const solved=hits.length===1?(hits[0] as {solved?:unknown}).solved:undefined;
        done(typeof solved==='boolean'?solved:null);
      } catch {done(null);}});
      res.on('error',()=>done(null));
    });
    req.on('timeout',()=>{req.destroy();done(null);}); req.on('error',()=>done(null));
  });
}
