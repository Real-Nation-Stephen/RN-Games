/** Real Worker/Durable Object runtime, HTTP commands and authenticated WebSockets. */
import assert from 'node:assert/strict';
import {randomUUID, createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {WebSocket} from 'ws';
import http2 from 'node:http2';
import {createRunDocument} from '../netlify/functions/lib/live-engine.mjs';
const hosted = !!process.env.CF_LIVE_TEST_URL;
const secret = process.env.CF_LIVE_TEST_SECRET || randomUUID()+randomUUID();
if (hosted && !process.env.CF_LIVE_TEST_SECRET) throw new Error('Hosted test requires its provisioning secret');
const origin=process.env.CF_LIVE_TEST_ORIGIN || 'https://deploy-preview-1--rn-games.netlify.app';
const base=process.env.CF_LIVE_TEST_URL || 'http://127.0.0.1:8899';
const N=Number(process.env.LIVE_N || 100), code='TEST-'+randomUUID().toUpperCase();
const dir=await mkdtemp(join(tmpdir(),'rn-cloudflare-qa-'));
const config={name:'rn-games-local-test',main:resolve('services/live-cloudflare/worker.mjs'),compatibility_date:'2026-10-01',compatibility_flags:['nodejs_compat'],durable_objects:{bindings:[{name:'LIVE_ROOMS',class_name:'LiveRoom'}]},migrations:[{tag:'v1',new_sqlite_classes:['LiveRoom']}],vars:{DEDICATED_LIVE_SECRET:secret,LIVE_ALLOWED_ORIGINS:origin}};
let service,logs='',requests=0;const sockets=[],received=new Map(),stats={},serviceTimes=[];let socketBytes=0,compactMessages=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 await writeFile(join(dir,'wrangler.json'),JSON.stringify(config),{mode:0o600});
 service=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--ip','127.0.0.1','--port','8899','--config',join(dir,'wrangler.json'),'--persist-to',join(dir,'state')],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 service.stdout.on('data',d=>{logs+=d;});service.stderr.on('data',d=>{logs+=d;});
 const until=Date.now()+30000;for(;;){try{if((await fetch(base+'/health')).ok)return;}catch{} if(Date.now()>until)throw new Error(logs);await sleep(200);}
}
async function stop(){if(!service)return;const p=service;service=null;const done=new Promise(r=>p.once('exit',r));p.kill('SIGTERM');await done;}
// Two HTTP/2 sessions provide 150 concurrent streams (Cloudflare advertises
// 100/session). Independent WebSockets still simulate one connection per phone.
// This avoids measuring hundreds of HTTP/1 TLS sockets on one load generator.
const h2=[];let h2RoundRobin=0;
async function connectHttp2(){
 if(!hosted)return;
 for(let i=0;i<2;i++)await new Promise((resolve,reject)=>{
  const client=http2.connect(base);h2.push(client);client.on('error',reject);
  client.once('remoteSettings',settings=>{assert.equal(client.alpnProtocol,'h2');assert.ok(settings.maxConcurrentStreams>=75);resolve();});
 });
}
async function request(path,body,headers={}) {
 requests++;const payload=body?JSON.stringify(body):undefined;
 let response,text;
 if(h2.length){
  ({response,text}=await new Promise((resolve,reject)=>{
   const client=h2[h2RoundRobin++%h2.length];
   const stream=client.request({':path':path,':method':body?'POST':'GET',origin,'content-type':'application/json',...headers});
   let meta,buffer='';stream.setEncoding('utf8');stream.on('response',h=>meta=h);stream.on('data',s=>buffer+=s);stream.on('error',reject);
   stream.on('end',()=>resolve({response:{status:meta[':status'],ok:meta[':status']>=200&&meta[':status']<300,headers:new Headers(Object.entries(meta).filter(([k])=>!k.startsWith(':')))},text:buffer}));
   stream.end(payload);
  }));
 }else{
  response=await fetch(base+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...headers},body:payload});text=await response.text();
 }
 const serverMs=Number(response.headers.get('server-timing')?.match(/live;dur=([0-9.]+)/)?.[1]);if(Number.isFinite(serverMs))serviceTimes.push(serverMs);
 let data;try{data=JSON.parse(text);}catch{throw new Error(`Non-JSON response ${response.status}: ${text.slice(0,100)}`);}return {response,data};
}
async function ok(path,body){const {response,data}=await request(path,body);assert.equal(response.status,200,JSON.stringify(data));return data;}
function signed(payload){const body=JSON.stringify(payload),stamp=String(Date.now()),nonce=randomUUID();return {method:'POST',headers:{'content-type':'application/json','x-live-timestamp':stamp,'x-live-nonce':nonce,'x-live-signature':createHmac('sha256',secret).update(`${stamp}.${nonce}.${body}`).digest('hex')},body};}
async function sub(key,auth) {
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/live?code='+code,{origin});sockets.push(ws);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket timeout '+key)),15000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({code,compactUpdates:true,...auth})));ws.on('message',raw=>{socketBytes+=raw.length;if(raw.toString()==='pong')return;const data=JSON.parse(raw);if(data.state){if(data.patch){assert.ok(received.get(key),'Patch requires full snapshot');assert.equal(received.get(key).roundAttemptId,data.state.roundAttemptId);compactMessages++;}received.set(key,data.patch?{...received.get(key),...data.state}:data.state);clearTimeout(timer);resolve(ws);}});});
}
async function until(fn){const deadline=Date.now()+15000;while(!fn()){assert.ok(Date.now()<deadline,'Timed out waiting for realtime state');await sleep(50);}}
async function burst(name,list,fn){const serviceStart=serviceTimes.length;const timings=[];const outcomes=await Promise.allSettled(list.map(async(p,i)=>{const at=performance.now();await fn(p,i);timings.push(performance.now()-at);}));const failed=outcomes.filter(r=>r.status==='rejected');if(failed.length)throw new Error(name+' failures: '+failed.length+'; first: '+failed[0].reason.message+' '+(failed[0].reason.cause?.code || ''));timings.sort((a,b)=>a-b);stats[name]={count:timings.length,p95Ms:Math.round(timings[Math.floor(timings.length*.95)]),maxMs:Math.round(timings.at(-1))};const service=serviceTimes.slice(serviceStart).sort((a,b)=>a-b);if(service.length)stats[name].serviceP95Ms=service[Math.floor(service.length*.95)];console.log('PASS',name,JSON.stringify(stats[name]));}
let questions=Array.from({length:12},(_,i)=>({id:'q'+i,prompt:'Question '+i,choices:[{id:'yes',label:'Yes'},{id:'no',label:'No'}],correctChoiceId:'yes'}));
const run=createRunDocument({experience:{id:code,slug:code},hostKey:randomUUID(),code,snapshot:{steps:[{id:'poll',moduleType:'mini-poll',liveCapable:true},{id:'fill',moduleType:'fill-game',liveCapable:true},{id:'pin',moduleType:'pinboard',liveCapable:true}],configs:{poll:{options:[{id:'a',label:'A'},{id:'b',label:'B'}]},fill:{questions,teams:[{id:'a',target:9999},{id:'b',target:9999}]},pin:{}},secrets:{},joinScreen:{}}});
let pollOptions=['a','b'];
if(process.env.CF_LIVE_CONTENT_FILE){
 const {snapshot}=JSON.parse(await readFile(process.env.CF_LIVE_CONTENT_FILE,'utf8'));
 const selected=Object.fromEntries(['mini-poll','fill-game','pinboard'].map(kind=>[kind,snapshot.configs[snapshot.steps.find(s=>s.moduleType===kind).id]]));
 questions=selected['fill-game'].questions;assert.ok(questions.length && questions.every(q=>q.correctChoiceId),'Rehearsal requires confirmed Fill answers');
 run.snapshot={...snapshot,steps:run.snapshot.steps,configs:{...snapshot.configs,poll:selected['mini-poll'],fill:{...selected['fill-game'],teams:selected['fill-game'].teams.map(t=>({...t,target:9999}))},pin:selected.pinboard},secrets:{...snapshot.secrets,fill:{questions}}};
 pollOptions=run.snapshot.configs.poll.options.map(o=>o.id);
 console.log('Using actual event questions, branding and full snapshot payload',JSON.stringify({questions:questions.length,bytes:JSON.stringify(run.snapshot).length}));
}
const quizQuestions=questions.slice(0,2);
run.snapshot.steps.push({id:'quiz',moduleType:'mini-quiz',liveCapable:true});
run.snapshot.configs.quiz={questions:quizQuestions};run.snapshot.secrets.quiz={questions:quizQuestions};
// Disposable rehearsal room expires in an hour, with no effect on an event's active pointer.
run.expiresAt=new Date(Date.now()+3600000).toISOString();
const control=async(action,payload={})=>(await ok('/api/live-control',{code,hostKey:run.hostKey,action,commandId:randomUUID(),...payload})).state;
const attempt=s=>({nodeId:s.steps[s.currentStepIndex]?.id,roundAttemptId:s.roundAttemptId,runId:s.runId});
const master=async()=>(await ok('/api/live-run?code='+code+'&role=moderator&hostKey='+run.hostKey)).state;
let pingTimer;
try {
 if(!hosted)await start();
 await connectHttp2();
 const provision=signed({operation:'create',run});assert.equal((await fetch(base+'/internal/runs',provision)).status,200);
 assert.equal((await fetch(base+'/internal/runs',provision)).status,403,'Signed replay refused');
 assert.equal((await request('/internal/runs',{operation:'create',run})).response.status,403);
 assert.equal((await request('/api/live-run?code='+code,null,{origin:'https://wrong.example.test'})).response.status,403);
 assert.equal((await request('/api/live-run?code='+code+'&role=moderator&hostKey=wrong')).response.status,403);
 const players=[];await burst(`${N} joins`,Array.from({length:N}),async()=>{players.push(await ok('/api/live-join',{code}));});
 assert.equal(new Set(players.map(p=>p.participantNumber)).size,N);
 await burst(`${N} socket subscriptions`,players,async p=>sub(p.participantId,{role:'participant',participantId:p.participantId,secret:p.secret}));
 await sub('presenter',{role:'public'});await sub('legacy',{role:'public',compactUpdates:false});await sub('master',{role:'moderator',hostKey:run.hostKey});
 pingTimer=setInterval(()=>{for(const ws of sockets)if(ws.readyState===WebSocket.OPEN)ws.send('ping');},15000);
 await control('next');const poll=await control('open');
 let duplicateVote;
 await burst(`${N} votes`,players,async(p,i)=>{const body={code,participantId:p.participantId,secret:p.secret,action:'vote',...attempt(poll),optionId:pollOptions[0],commandId:randomUUID()};if(!i)duplicateVote=body;await ok('/api/live-action',body);});
 assert.equal((await ok('/api/live-action',duplicateVote)).result.duplicate,true);
 assert.equal((await request('/api/live-action',{...duplicateVote,optionId:pollOptions[1]})).response.status,409);
 await until(()=>received.get('master')?.revision>=poll.revision+N);
 const pub=(await ok('/api/live-run?code='+code)).state;assert.equal(pub.activity.phase,'open');assert.equal(pub.activity.tally,null,'Tallies stay private before reveal');
 await control('tally');await until(()=>received.get('presenter')?.activity.phase==='revealed');
 const fill=await control('next');
 assert.equal((await request('/api/live-action',{...duplicateVote,commandId:randomUUID()})).response.status,409);
 await burst(`${N} preload acknowledgements`,players,p=>ok('/api/live-action',{code,participantId:p.participantId,secret:p.secret,action:'ready',...attempt(fill)}));
 await until(()=>received.get('master')?.activity?.readyCount===N);
 await control('set-duration',{durationSeconds:90});const racing=await control('start-race');
 assert.equal((await request('/api/live-action',{code,participantId:players[0].participantId,secret:players[0].secret,action:'answer',...attempt(racing),questionId:questions[0].id,choiceId:questions[0].correctChoiceId,commandId:randomUUID()})).response.status,423,'Countdown rejects early answers');
 await until(()=>received.get('presenter')?.activity.phase==='racing');
 let firstAnswer;
 for(let q=0;q<questions.length;q++)await burst(`${N} answers round ${q+1}`,players,async(p,i)=>{const body={code,participantId:p.participantId,secret:p.secret,action:'answer',...attempt(racing),questionId:questions[q].id,choiceId:questions[q].correctChoiceId,commandId:randomUUID()};if(!q&&!i)firstAnswer=body;await ok('/api/live-action',body);});
 assert.equal((await ok('/api/live-action',firstAnswer)).result.duplicate,true,'Receipt survives more than 512 commands');
 const final=await master();assert.equal(final.activity.teams.reduce((a,b)=>a+b.score,0),N*questions.length);
 await until(()=>received.get('presenter')?.revision>=final.revision);
 for(const p of players){const s=received.get(p.participantId);assert.ok(s.me);assert.ok(!JSON.stringify(s).includes('correctChoiceId'));assert.ok(!JSON.stringify(s).includes(run.hostKey));}
 const first=players[0];assert.equal((await ok('/api/live-join',{code,participantId:first.participantId,secret:first.secret})).participantNumber,first.participantNumber);
 await sub('reconnected',{role:'participant',participantId:first.participantId,secret:first.secret});
 const pin=await control('next');
 await ok('/api/live-action',{code,participantId:first.participantId,secret:first.secret,action:'submit',...attempt(pin),imageDataUrl:'data:image/png;base64,iVBORw0KGgo=',commandId:randomUUID()});
 const pinState=await master();const submission=pinState.activity.submissions.at(-1);
 const mediaUrl=new URL(submission.imagePath);mediaUrl.searchParams.delete('hostKey');const mediaPath=mediaUrl.pathname+mediaUrl.search;
 assert.equal((await fetch(base+mediaPath)).status,403);assert.equal((await fetch(base+mediaPath+'&hostKey='+run.hostKey)).status,200);
 await control('approve',{submissionId:submission.id});assert.equal((await fetch(base+mediaPath)).status,200);
 await control('reject',{submissionId:submission.id});assert.equal((await fetch(base+mediaPath)).status,403);
 await control('next');await until(()=>received.get('presenter')?.component?.currentQuestion?.id===quizQuestions[0].id);
 assert.equal(received.get('presenter').component.currentQuestion.correctChoiceId,undefined);
 await control('reveal');await until(()=>received.get('presenter')?.component?.currentQuestion?.correctChoiceId===quizQuestions[0].correctChoiceId);
 await control('next-question');await until(()=>received.get('presenter')?.component?.currentQuestion?.id===quizQuestions[1].id);
 await until(()=>received.get('legacy')?.component?.currentQuestion?.id===quizQuestions[1].id);
 assert.equal(received.get('presenter').component.currentQuestion.correctChoiceId,undefined);
 assert.ok(compactMessages>0,'Live updates must actually exercise compact payloads');
 console.log('PASS compact content stays correct across question changes, reveals and legacy clients');
 if(process.env.CF_IDLE_TEST==='1'){const before=await master();console.log('Checking 70 seconds of idle WebSocket presence without HTTP heartbeats');await sleep(70000);const after=await master();assert.equal(after.connectedCount,N);assert.equal(after.revision,before.revision,'Idle socket presence must not write room state');console.log('PASS idle sockets retain presence without state writes');}
 if(!hosted){for(const ws of sockets)ws.terminate();await stop();await start();await sub('after-restart',{role:'participant',participantId:first.participantId,secret:first.secret});assert.equal(received.get('after-restart').participantCount,N);assert.equal(received.get('after-restart').runId,run.runId);assert.equal((await ok('/api/live-action',firstAnswer)).result.duplicate,true);console.log('PASS persisted state and command receipts survive restart');}
 const expired=createRunDocument({experience:{id:'expired-qa',slug:'expired-qa'},snapshot:run.snapshot,hostKey:randomUUID(),code:'TEST-'+randomUUID().toUpperCase()});
 expired.expiresAt=new Date(Date.now()+1000).toISOString();
 assert.equal((await fetch(base+'/internal/runs',signed({operation:'create',run:expired}))).status,200);
 await sleep(1800);
 assert.equal((await fetch(base+'/internal/runs',signed({operation:'resume',code:expired.code,runId:expired.runId}))).status,410,'Expired rooms can be replaced through Flow Master after cleanup');
 console.log('PASS expired-room recovery, exact scores, countdown, timed reveal, private projections, idempotency, stale commands, reconnects, media auth, HMAC and CORS');
 const report={transport:hosted?'Cloudflare hosted HTTP/2 + independent WebSockets':'local Cloudflare runtime HTTP + WebSockets',participants:N,answers:N*questions.length,requests,socketBytes,compactMessages,stats};
 if(process.env.LIVE_REPORT_PATH)await writeFile(process.env.LIVE_REPORT_PATH,JSON.stringify(report,null,2));
 console.log(JSON.stringify({participants:N,answers:N*questions.length,requests}));
} catch(error){console.error(logs.split('\n').filter(s=>/error|warn/i.test(s)).slice(-12).join('\n'));throw error;}
finally{clearInterval(pingTimer);for(const ws of sockets)ws.terminate();for(const client of h2)client.destroy();await stop();}
