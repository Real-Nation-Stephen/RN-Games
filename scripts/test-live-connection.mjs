/** Separate processes prove standard and dedicated rooms do not share runtime flags/storage. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {WebSocket} from 'ws';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
process.env.RN_ISOLATED_QA='1';process.env.LIVE_STORE_DRIVER='memory';process.env.LIVE_DEV_AUTH='1';
process.env.DEDICATED_LIVE_SECRET=randomUUID()+randomUUID();
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rn-live-connection-'));
const child=fork(new URL('../services/live/server.mjs',import.meta.url),[],{env:{...process.env,LIVE_STORE_DRIVER:'file',LIVE_CAS_DIR:dir,PORT:'0',LIVE_ALLOWED_ORIGINS:'http://localhost:1234'},stdio:['ignore','pipe','pipe','ipc']});
child.stderr.on('data',d=>process.stderr.write(d));
const port=await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.port));child.once('exit',code=>reject(new Error('Service exited '+code)));});
process.env.DEDICATED_LIVE_URL=`http://127.0.0.1:${port}`;
const {handler:seed}=await import('../netlify/functions/live-demo-seed.mjs');
const {lambdaHandler:lifecycle}=await import('../netlify/functions/live-run.mjs');
const {lambdaHandler:join}=await import('../netlify/functions/live-join.mjs');
const {loadExperienceBySlug}=await import('../netlify/functions/lib/live-run.mjs');
const {setExperienceJson}=await import('../netlify/functions/lib/blobs.mjs');
const {getActiveRunCode,getLiveRun}=await import('../netlify/functions/lib/live-store.mjs');
const headers={'content-type':'application/json',authorization:'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZXYtbG9jYWwiLCJlbWFpbCI6ImRldkBsb2NhbC5wcmV2aWV3In0.dev'};
const event=(body,auth=true)=>({httpMethod:'POST',headers:auth?headers:{},body:JSON.stringify(body)});
async function create(body,auth=true){const r=await lifecycle(event({slug:'live-demo',...body},auth));assert.equal(r.statusCode,200,r.body);return JSON.parse(r.body);}
try {
 assert.equal((await seed(event({}))).statusCode,200);
 const exp=await loadExperienceBySlug('live-demo');assert.equal(exp.foundation.liveConnection,'standard');
 const standard=await create({});assert.equal(standard.connection.mode,'standard');assert.ok(!standard.code.startsWith('L'));
 exp.foundation.liveConnection='dedicated';await setExperienceJson(exp.id,exp);
 const pinnedStandard=await create({});assert.equal(pinnedStandard.code,standard.code);assert.equal(pinnedStandard.connection.mode,'standard');
 const dedicated=await create({forceNew:true,hostKey:standard.hostKey},false);
 assert.match(dedicated.code,/^L[0-9A-F]{6}$/);assert.equal(dedicated.connection.mode,'dedicated');
 assert.equal((await getLiveRun(standard.code)).status,'superseded');assert.equal(await getLiveRun(dedicated.code),null,'Dedicated run state is not duplicated in the Studio store');
 const discovery=await lifecycle({httpMethod:'GET',headers:{},queryStringParameters:{code:dedicated.code}});
 const route=JSON.parse(discovery.body);assert.ok(route.routeOnly);assert.ok(!JSON.stringify(route).includes(dedicated.hostKey));
 const joinRoute=await join(event({code:dedicated.code},false));assert.ok(JSON.parse(joinRoute.body).routeOnly);
 const res=await fetch(process.env.DEDICATED_LIVE_URL+'/api/live-join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:dedicated.code})});assert.equal(res.status,200);const person=await res.json();assert.ok(person.participantId);
 const socket=new WebSocket(process.env.DEDICATED_LIVE_URL.replace('http','ws')+'/live',{origin:'http://localhost:1234'});
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Clock response timeout')),5000);
  socket.on('error',reject);
  socket.on('open',()=>socket.send(JSON.stringify({code:dedicated.code,role:'participant',participantId:person.participantId,secret:person.secret})));
  socket.on('message',raw=>{const data=JSON.parse(raw);if(data.state)socket.send(JSON.stringify({type:'clock',sentAt:123}));if(data.type==='clock'){assert.equal(data.sentAt,123);assert.ok(data.now>0);clearTimeout(timeout);socket.close();resolve();}});
 });
 const badSocket=new WebSocket(process.env.DEDICATED_LIVE_URL.replace('http','ws')+'/live',{origin:'http://localhost:1234'});
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Unauthenticated socket was not closed')),5000);
  badSocket.on('error',reject);badSocket.on('message',()=>reject(new Error('Private state leaked')));
  badSocket.on('open',()=>badSocket.send(JSON.stringify({code:dedicated.code,role:'moderator',hostKey:'wrong'})));
  badSocket.on('close',code=>{clearTimeout(timeout);assert.equal(code,1008);resolve();});
 });
 assert.equal((await lifecycle(event({slug:'live-demo',forceNew:true},false))).statusCode,403);
 exp.foundation.liveConnection='standard';await setExperienceJson(exp.id,exp);
 const pinnedDedicated=await create({hostKey:dedicated.hostKey},false);assert.equal(pinnedDedicated.code,dedicated.code);assert.equal(pinnedDedicated.connection.mode,'dedicated');
 const standardAgain=await create({forceNew:true,hostKey:dedicated.hostKey},false);assert.equal(standardAgain.connection.mode,'standard');
 const retired=await fetch(process.env.DEDICATED_LIVE_URL+'/api/live-run?code='+dedicated.code);assert.equal((await retired.json()).state.status,'superseded');
 exp.foundation.liveConnection='dedicated';await setExperienceJson(exp.id,exp);
 delete process.env.DEDICATED_LIVE_SECRET;
 const unavailable=await lifecycle(event({slug:'live-demo',forceNew:true}));assert.equal(unavailable.statusCode,503);assert.equal(await getActiveRunCode(exp.id),standardAgain.code);
 console.log('PASS standard default, per-flow routing, pinned active sessions, authenticated reset both ways, private discovery, fail-closed configuration and preserved active run');
} finally {
 child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await fs.rm(dir,{recursive:true,force:true});
}
