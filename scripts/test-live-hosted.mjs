// Rehearse the pack from prepare-heineken-live.mjs on a deploy preview.
// Authenticated SDK seeds only an isolated run; all participant traffic uses HTTP.
// Functional success and a provisional p95 < 3s responsiveness gate are reported separately.
import fs from 'node:fs/promises';
import https from 'node:https';
// Bound the generator to one reusable connection per simulated phone. Queue time
// remains included in latency; use IPv4 to avoid local IPv6 connection timeouts.
const transport=new https.Agent({keepAlive:true,maxSockets:150,maxFreeSockets:150,family:4});
import {createPostgresRun,readPostgresRun,deletePostgresRun} from '../netlify/functions/lib/live-postgres.mjs';
import {getDb} from '../netlify/functions/lib/db.mjs';
const postgres=process.env.LIVE_QA_BACKEND==='postgres';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {createMemoryCasStore,wrapBlobsCasFetch,wrapBlobsCasStore} from '../netlify/functions/lib/cas-store.mjs';
import {setLiveTestHooks,makeRoomCode,makeSecret} from '../netlify/functions/lib/live-store.mjs';
import {buildSnapshot,createRunDocument} from '../netlify/functions/lib/live-run.mjs';
// Explicitly target a deploy preview; never load-test the event's active run.
const base=process.env.LIVE_QA_BASE;
if(!/^https:\/\/deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/.test(base||''))throw new Error('LIVE_QA_BASE must be a Netlify deploy preview');
const folder=process.env.LIVE_QA_PACK_DIR;
if(!folder)throw new Error('LIVE_QA_PACK_DIR must contain content-pack.json');
const pack=JSON.parse(await fs.readFile(folder+'/content-pack.json','utf8'));
const token=process.env.NETLIFY_AUTH_TOKEN;
const siteID=process.env.NETLIFY_SITE_ID;
if(!token||!siteID)throw new Error('NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID required for isolated fixture and cleanup');
if(postgres){
 const branch=process.env.LIVE_QA_BRANCH;
 if(!branch||branch==='production'||branch==='main')throw new Error('LIVE_QA_BRANCH must name the preview branch');
 const response=await fetch('https://api.netlify.com/api/v1/sites/'+siteID+'/database/branch/'+encodeURIComponent(branch),{headers:{Authorization:'Bearer '+token}});
 if(!response.ok)throw new Error('Preview database lookup failed '+response.status);
 const config=await response.json();if(!config.connection_string)throw new Error('Missing preview database connection');
 process.env.NETLIFY_DB_URL=config.connection_string;
}
const live=wrapBlobsCasStore(getStore({name:'rngames-live',siteID,token,consistency:'strong',fetch:wrapBlobsCasFetch()}),'rngames-live',{readConsistency:'strong'});
const mem=createMemoryCasStore();setLiveTestHooks({store:mem});await mem.setJSON('wheels-index',{list:pack.modules});for(const m of pack.modules)await mem.setJSON('wheel:'+m.id,m);
const experience={...pack.experience,id:randomUUID(),slug:'qa-'+randomUUID(),title:'Isolated hosted capacity rehearsal'};
const snapshot=await buildSnapshot(experience);const code=(postgres?'QA-':'')+makeRoomCode(),hostKey=makeSecret();const run=createRunDocument({experience,snapshot,code,hostKey});
const created=postgres?await createPostgresRun(code,run):await live.setJSON('liverun:'+code,run,{onlyIfNew:true});
const readRun=async()=>postgres?(await readPostgresRun(code))?.data:live.get('liverun:'+code,{type:'json'});
assert.ok(created.modified,'Room code collision: rerun with a fresh code');
let joins=[];const report={date:new Date().toISOString(),base,participants:150,backend:postgres?'postgres':'blobs',databaseBranch:postgres?process.env.LIVE_QA_BRANCH:undefined,seed:'Authenticated isolated fixture, no active-flow pointer',stages:[]};
async function req(path,body){
 const start=performance.now();
 return new Promise(resolve=>{
  const payload=body?JSON.stringify(body):undefined;
  const request=https.request(base+path.replace('/api/','/.netlify/functions/'),{agent:transport,method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}},res=>{
   let raw='';res.setEncoding('utf8');res.on('data',chunk=>raw+=chunk);res.on('end',()=>{let data;try{data=JSON.parse(raw)}catch{data={error:'Non-JSON response'}}resolve({status:res.statusCode,data,ms:Math.round(performance.now()-start)});});
   res.on('error',e=>resolve({status:0,data:{error:e.code||e.message},ms:Math.round(performance.now()-start)}));
  });
  const deadline=setTimeout(()=>request.destroy(new Error('Request deadline exceeded')),65000);
  request.on('close',()=>clearTimeout(deadline));
  request.setTimeout(65000,()=>request.destroy(new Error('Request timed out')));
  request.on('error',e=>resolve({status:0,data:{error:e.code||e.message},ms:Math.round(performance.now()-start)}));
  request.end(payload);
 });
}
function must(r){assert.equal(r.status,200,JSON.stringify({status:r.status,error:r.data.error}));return r.data;}
async function burst(name,tasks){const start=Date.now();const rows=await Promise.all(tasks);const sorted=rows.map(r=>r.ms).sort((a,b)=>a-b);const stage={name,requests:rows.length,success:rows.filter(r=>r.status===200).length,totalMs:Date.now()-start,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),errors:rows.filter(r=>r.status!==200).reduce((a,r)=>{const k=r.status+' '+r.data.error;a[k]=(a[k]||0)+1;return a;},{})};report.stages.push(stage);console.log(JSON.stringify(stage));return rows;}
const control=async(action,extra={})=>must(await req('/api/live-control',{code,hostKey,action,commandId:randomUUID(),...extra}));
const attempt=s=>({runId:s.runId,nodeId:s.steps.find(s=>s.current)?.id,roundAttemptId:s.roundAttemptId});
try{
 must(await req('/api/live-run?code='+code));
 const jr=await burst('150 simultaneous joins',Array.from({length:150},()=>req('/api/live-join',{code})));joins=jr.filter(r=>r.status===200).map(r=>({participantId:r.data.participantId,secret:r.data.secret}));assert.equal(joins.length,150,'All 150 joins must succeed');assert.equal(new Set(joins.map(j=>j.participantId)).size,150);
 const reconnect=must(await req('/api/live-join',{code,...joins[0]}));assert.equal(reconnect.participantId,joins[0].participantId);
 await control('next');const open=(await control('open')).state;
 const votes=await burst('150 simultaneous poll votes',joins.map(j=>req('/api/live-action',{code,...j,action:'vote',...attempt(open),optionId:open.component.options[0].id})));votes.forEach(must);
 await control('tally');const hidden=must(await req('/api/live-run?code='+code)).state;assert.equal(hidden.activity.tally,null);await new Promise(r=>setTimeout(r,3500));const shown=must(await req('/api/live-run?code='+code)).state;assert.equal(shown.activity.tally.total,150);
 const reads=await burst('150 simultaneous phone state reads',joins.map(j=>req('/api/live-run?'+new URLSearchParams({code,role:'participant',...j}))));reads.forEach(must);
 for(let i=0;i<7;i++)await control('next');
 await control('set-target',{target:999});await control('set-duration',{durationSeconds:300});
 const prepared=must(await req('/api/live-run?code='+code)).state;
 if(postgres){const blocked=await req('/api/live-control',{code,hostKey,action:'start-race',commandId:randomUUID()});assert.equal(blocked.data.code,'phones_not_ready');
 const loaded=await burst('150 initial question loads',joins.map(j=>req('/api/live-run?'+new URLSearchParams({code,role:'participant',...j}))));loaded.forEach(must);
 const ready=await burst('150 readiness acknowledgements',joins.map(j=>req('/api/live-action',{code,...j,action:'ready',...attempt(prepared)})));ready.forEach(must);}
 const start=(await control('start-race')).state;
 const preloads=await burst('150 question preloads during countdown',joins.map(j=>req('/api/live-run?'+new URLSearchParams({code,role:'participant',...j}))));preloads.forEach(must);
 const questionCount=pack.modules.find(m=>m.gameType==='fill-game').questions.filter(q=>q.enabled!==false).length;assert.ok(preloads.every(r=>r.data.state.component.questions.length===questionCount));assert.ok(preloads.every(r=>!JSON.stringify(r.data.state.component).includes('correctChoiceId')));
 const starts=start.activity.startsAt;report.preloadsCompletedBeforeStart=Date.now()<starts;await new Promise(r=>setTimeout(r,Math.max(0,starts-Date.now()+100)));
 const question=pack.modules.find(m=>m.gameType==='fill-game').questions[0];
 const answers=await burst('150 simultaneous race answers',joins.map(j=>req('/api/live-action',{code,...j,action:'answer',...attempt(start),questionId:question.id,choiceId:question.correctChoiceId})));answers.forEach(must);
 const stored=await readRun();assert.equal(Object.keys(stored.node.answered).length,150);assert.equal(Object.values(stored.node.scores).reduce((a,b)=>a+b,0),150);
 if(postgres){
  let polling=true;const pollResults=[];
  const loops=joins.map(async j=>{while(polling){pollResults.push(await req('/api/live-run?'+new URLSearchParams({code,role:'participant',...j})));await new Promise(r=>setTimeout(r,1000));}});
  try{for(const q of pack.modules.find(m=>m.gameType==='fill-game').questions.slice(1)){const a=await burst('Race '+q.prompt.slice(0,35)+' with 150 polling phones',joins.map(j=>req('/api/live-action',{code,...j,action:'answer',...attempt(start),questionId:q.id,choiceId:q.correctChoiceId,commandId:randomUUID()})));a.forEach(must);await new Promise(r=>setTimeout(r,1000));}
  const hearts=await burst('150 heartbeats during polling',joins.map(j=>req('/api/live-action',{code,...j,action:'heartbeat'})));hearts.forEach(must);
  }finally{polling=false;await Promise.all(loops);}
  await burst('Sustained phone polling',pollResults.map(r=>Promise.resolve(r)));pollResults.forEach(must);
  const final=await readRun();assert.equal(Object.keys(final.node.answered).length,150*questionCount);assert.equal(Object.values(final.node.scores).reduce((a,b)=>a+b,0),150*questionCount);
 }
 await control('finish');await control('next');
 const pin=must(await req('/api/live-run?code='+code)).state;
 const notes=await burst('150 simultaneous moderated notes',joins.map((j,i)=>req('/api/live-action',{code,...j,action:'submit',...attempt(pin),text:'QA note '+i,kind:'text'})));notes.forEach(must);
 report.functionalPassed=true;
}catch(e){report.functionalPassed=false;report.failure=e.message;console.log('FAILED '+e.message);}finally{
 const stored=await readRun();if(postgres){await deletePostgresRun(code);await(await getDb()).pool.end();}else{await Promise.all(Object.keys(stored?.participants||{}).map(id=>live.delete('liverun-seen:'+code+':'+id)));await live.delete('liverun:'+code);}report.cleanedUp=true;
 transport.destroy();
 report.performancePassed=report.functionalPassed&&report.stages.every(s=>s.p95Ms<3000)&&report.preloadsCompletedBeforeStart;
 await fs.writeFile(folder+(postgres?'/hosted-150-postgres-report.json':'/hosted-150-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({functionalPassed:report.functionalPassed,performancePassed:report.performancePassed,cleanedUp:true}));
}
