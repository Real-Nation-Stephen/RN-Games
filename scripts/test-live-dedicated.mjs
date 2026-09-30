/** Real HTTP + 150 authenticated WebSockets. Uses disposable rooms only. */
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {WebSocket} from 'ws';
import {startDedicatedServer} from '../services/live/server.mjs';
import {createRunDocument} from '../netlify/functions/lib/live-run.mjs';
import {getDb} from '../netlify/functions/lib/db.mjs';
import {readPostgresRun,deletePostgresRun} from '../netlify/functions/lib/live-postgres.mjs';
const code='TEST-'+randomUUID().toUpperCase(), origin='https://studio.example.test';
process.env.DEDICATED_LIVE_SECRET=randomUUID()+randomUUID();
process.env.LIVE_ALLOWED_ORIGINS=origin;
process.env.PUBLIC_LIVE_URL='https://live.example.test';
let service=await startDedicatedServer({port:0,host:'127.0.0.1'});
const base=`http://127.0.0.1:${service.server.address().port}`;
const sockets=[],received=new Map(),stats={};
const questions=Array.from({length:12},(_,i)=>({id:'q'+i,prompt:'Question '+i,choices:[{id:'yes',label:'Yes'},{id:'no',label:'No'}],correctChoiceId:'yes'}));
const run=createRunDocument({experience:{id:code,slug:code},hostKey:randomUUID(),code,snapshot:{steps:[{id:'poll',moduleType:'mini-poll',liveCapable:true},{id:'fill',moduleType:'fill-game',liveCapable:true},{id:'pin',moduleType:'pinboard',liveCapable:true}],configs:{poll:{options:[{id:'a',label:'A'},{id:'b',label:'B'}]},fill:{questions,teams:[{id:'a',target:9999},{id:'b',target:9999}]},pin:{}},secrets:{},joinScreen:{}}});
async function request(path,body,headers={}) {
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 const data=await response.json();return {response,data};
}
async function ok(path,body){const {response,data}=await request(path,body);assert.equal(response.status,200,JSON.stringify(data));return data;}
function signed(payload){const body=JSON.stringify(payload),stamp=String(Date.now()),nonce=randomUUID();return {method:'POST',headers:{'content-type':'application/json','x-live-timestamp':stamp,'x-live-nonce':nonce,'x-live-signature':createHmac('sha256',process.env.DEDICATED_LIVE_SECRET).update(`${stamp}.${nonce}.${body}`).digest('hex')},body};}
async function sub(key,auth) {
 const ws=new WebSocket(base.replace('http','ws')+'/live',{origin});sockets.push(ws);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket timeout '+key)),15000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({code,...auth})));ws.on('message',raw=>{const data=JSON.parse(raw);if(data.state){received.set(key,data.state);clearTimeout(timer);resolve(ws);}});});
}
async function until(fn){const deadline=Date.now()+15000;while(!fn()){assert.ok(Date.now()<deadline,'Timed out waiting for realtime state');await new Promise(r=>setTimeout(r,50));}}
async function burst(name,list,fn){const timings=[];const outcomes=await Promise.allSettled(list.map(async(p,i)=>{await new Promise(r=>setTimeout(r,i*2));const at=performance.now();await fn(p,i);timings.push(performance.now()-at);}));const failed=outcomes.filter(r=>r.status==='rejected');if(failed.length)throw new Error(name+' failures: '+failed.length+'; first: '+failed[0].reason.message);timings.sort((a,b)=>a-b);stats[name]={count:timings.length,p95Ms:Math.round(timings[Math.floor(timings.length*.95)]),maxMs:Math.round(timings.at(-1))};console.log('PASS',name,JSON.stringify(stats[name]));}
const control=async(action,payload={})=>(await ok('/api/live-control',{code,hostKey:run.hostKey,action,commandId:randomUUID(),...payload})).state;
const attempt=state=>({nodeId:state.steps[state.currentStepIndex]?.id,roundAttemptId:state.roundAttemptId,runId:state.runId});
try {
 const provision=signed({operation:'create',run});assert.equal((await fetch(base+'/internal/runs',provision)).status,200);
 assert.equal((await fetch(base+'/internal/runs',provision)).status,403,'Signed request replay refused');
 assert.equal((await request('/internal/runs',{operation:'create',run})).response.status,403);
 assert.equal((await request('/api/live-run?code='+code,null,{origin:'https://wrong.example.test'})).response.status,403);
 assert.equal((await request('/api/live-run?code='+code+'&role=moderator&hostKey=wrong')).response.status,403);
 assert.equal((await request('/api/live-run',{slug:'anything'})).response.status,404);
 assert.equal((await request('/api/live-run?code=NONEXISTENT')).response.status,404,'Unknown rooms never fall through to Blobs');
 const players=[];await burst('150 joins',Array.from({length:150}),async()=>{players.push(await ok('/api/live-join',{code}));});
 assert.equal(new Set(players.map(p=>p.participantNumber)).size,150);
 await burst('150 socket subscriptions',players,async p=>sub(p.participantId,{role:'participant',participantId:p.participantId,secret:p.secret}));
 await sub('presenter',{role:'public'});await sub('master',{role:'moderator',hostKey:run.hostKey});
 await control('next');const poll=await control('open');
 await burst('150 poll votes',players,p=>ok('/api/live-action',{code,participantId:p.participantId,secret:p.secret,action:'vote',...attempt(poll),optionId:'a',commandId:randomUUID()}));
 await until(()=>received.get('master')?.revision>=poll.revision+150);
 const fill=await control('next');
 await burst('150 preload acknowledgements',players,p=>ok('/api/live-action',{code,participantId:p.participantId,secret:p.secret,action:'ready',...attempt(fill)}));
 await until(()=>received.get('master')?.activity?.readyCount===150);
 const racing=await control('open');
 for(let q=0;q<12;q++)await burst('150 answers round '+(q+1),players,p=>ok('/api/live-action',{code,participantId:p.participantId,secret:p.secret,action:'answer',...attempt(racing),questionId:'q'+q,choiceId:'yes',commandId:randomUUID()}));
 const final=(await readPostgresRun(code)).data;
 assert.equal(Object.values(final.node.scores).reduce((a,b)=>a+b,0),1800);
 await until(()=>received.get('presenter')?.revision>=final.revision);
 for(const p of players) {
  const state=received.get(p.participantId);assert.ok(state.me);assert.ok(!JSON.stringify(state).includes('correctChoiceId'));assert.ok(!JSON.stringify(state).includes(run.hostKey));
 }
 assert.ok(!received.get('presenter').me);
 const first=players[0];const reconnected=await ok('/api/live-join',{code,participantId:first.participantId,secret:first.secret});assert.equal(reconnected.participantNumber,first.participantNumber);
 const recovered=await sub('reconnected',{role:'participant',participantId:first.participantId,secret:first.secret});assert.ok(received.get('reconnected').revision>=final.revision);
 recovered.close();
 // Pinboard photos are served directly, with the same approval rules.
 const pin=await control('next');
 const photo=await ok('/api/live-action',{code,participantId:first.participantId,secret:first.secret,action:'submit',...attempt(pin),imageDataUrl:'data:image/png;base64,iVBORw0KGgo=',commandId:randomUUID()});
 const privateRun=(await readPostgresRun(code)).data,submission=privateRun.node.submissions.at(-1);
 const path=`/api/live-media?code=${code}&runId=${run.runId}&id=${submission.mediaId}`;
 assert.equal((await fetch(base+path)).status,403);assert.equal((await fetch(base+path+'&hostKey='+run.hostKey)).status,200);
 const restartPort=service.server.address().port;
 await service.close();
 service=await startDedicatedServer({port:restartPort,host:'127.0.0.1'});
 await sub('after-restart',{role:'participant',participantId:first.participantId,secret:first.secret});
 assert.equal(received.get('after-restart').participantCount,150);
 assert.equal(received.get('after-restart').runId,run.runId);
 assert.ok(received.get('after-restart').revision>=privateRun.revision);
 console.log('PASS service restart preserves participants, run identity and state');
 console.log('PASS 1800 exact scores, realtime delivery, role privacy, reconnect, media permissions, HMAC/replay and CORS');
 if(process.env.LIVE_REPORT_PATH)await(await import('node:fs/promises')).writeFile(process.env.LIVE_REPORT_PATH,JSON.stringify({transport:'localhost HTTP and WebSockets; remote PostgreSQL',participants:150,answers:1800,stats},null,2));
} finally {
 for(const socket of sockets)socket.terminate();await service.close();
 await deletePostgresRun(code);await(await getDb()).pool.query('DELETE FROM rn_live_media_v1 WHERE run_id=$1',[run.runId]);await(await getDb()).pool.end();
}
