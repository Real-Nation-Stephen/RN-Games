/** Integration tests against the additive live schema; only random test rooms are written. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDb} from '../netlify/functions/lib/db.mjs';
import {createPostgresRun,readPostgresRun,updatePostgresRun,postgresAction,deletePostgresRun,writePostgresPresence,postgresPresence} from '../netlify/functions/lib/live-postgres.mjs';
import {createRunDocument,applyControl,projectRun,applyParticipantAction} from '../netlify/functions/lib/live-run.mjs';
const code='TEST-'+randomUUID();
const questions=Array.from({length:12},(_,i)=>({id:'q'+i,prompt:'Question '+i,choices:[{id:'yes',label:'Yes'},{id:'no',label:'No'}],correctChoiceId:'yes'}));
const run=createRunDocument({experience:{id:code,slug:code},hostKey:'test-host',code,snapshot:{steps:[{id:'poll',moduleType:'mini-poll',liveCapable:true},{id:'fill',moduleType:'fill-game',liveCapable:true},{id:'pin',moduleType:'pinboard',liveCapable:true}],configs:{poll:{options:[{id:'a',label:'A'},{id:'b',label:'B'}]},fill:{questions,teams:[{id:'a',target:999},{id:'b',target:999}]},pin:{}},secrets:{},joinScreen:{}}});
async function read(){return(await readPostgresRun(code)).data;}
async function control(action,payload={}){const r=await read();const rev=r.revision;applyControl(r,action,payload);r.revision++;assert.ok((await updatePostgresRun(code,r,rev)).modified);return r;}
const attempt=r=>({nodeId:r.node.nodeId,roundAttemptId:r.roundAttemptId,runId:r.runId});
try{
 assert.ok((await createPostgresRun(code,run)).modified);
 const players=await Promise.all(Array.from({length:150},async()=>{const id=randomUUID(),secret=randomUUID();const r=await postgresAction(code,'join',id,secret);return {id,secret,number:r.run.participants[id].number};}));
 assert.equal(new Set(players.map(p=>p.number)).size,150);assert.equal(Object.keys((await read()).participants).length,150);console.log('PASS 150 atomic joins');
 const p=players[0];assert.equal((await postgresAction(code,'join',p.id,p.secret,{reconnect:true})).run.participants[p.id].number,p.number);
 await assert.rejects(postgresAction(code,'join',p.id,'wrong',{reconnect:true}),/Invalid participant/);
 await control('next');const poll=await control('open');
 await Promise.all(players.map(p=>postgresAction(code,'vote',p.id,p.secret,{...attempt(poll),optionId:'a',commandId:randomUUID()})));
 assert.equal(Object.keys((await read()).node.votes).length,150);
 await assert.rejects(postgresAction(code,'vote',p.id,p.secret,{...attempt(poll),optionId:'b'}),/Already voted/);
 console.log('PASS 150 atomic votes, reconnect, credentials and duplicate vote protection');
 const fill=await control('next');
 assert.throws(()=>applyControl(fill,'start-race'),/phones ready/);
 await Promise.all(players.map(p=>writePostgresPresence(code,p.id,fill.roundAttemptId)));
 const hydrated=(await readPostgresRun(code,true)).data;
 assert.equal(projectRun(hydrated,'moderator').activity.readyCount,150);
 assert.ok(Object.values(hydrated.participants).every(person=>person.readyAttempt===fill.roundAttemptId));
 const presence=await postgresPresence(code);for(const person of Object.values(fill.participants))person.readyAttempt=presence[person.id].readyAttempt;
 applyControl(fill,'open');fill.revision++;assert.ok((await updatePostgresRun(code,fill,fill.revision-1)).modified);
 const payload={...attempt(fill),questionId:'q0',choiceId:'yes',commandId:randomUUID()};
 const first=await postgresAction(code,'answer',p.id,p.secret,payload);
 const duplicate=await postgresAction(code,'answer',p.id,p.secret,payload);assert.equal(duplicate.result.duplicate,true);assert.equal(duplicate.result.eventId,first.result.eventId);
 await Promise.all(players.slice(1).map(p=>postgresAction(code,'answer',p.id,p.secret,{...payload,commandId:randomUUID()})));
 let state=await read();assert.equal(Object.keys(state.node.answered).length,150);assert.equal(Object.values(state.node.scores).reduce((a,b)=>a+b,0),150);
 assert.equal(state.node.lastFeedback[p.id].correct,true);assert.equal(state.node.cursors[p.id],1);
 await assert.rejects(postgresAction(code,'answer',p.id,p.secret,{...payload,commandId:randomUUID()}),/Stale question/);
 const staleUpdate=structuredClone(fill);staleUpdate.revision++;assert.equal((await updatePostgresRun(code,staleUpdate,fill.revision)).modified,false);
 console.log('PASS 150 race scores, idempotency, feedback, cursor and stale moderator CAS');
 // Compare the exact gameplay result/state changes against the established JS engine.
 const before=await read();const js=structuredClone(before);const input={...attempt(before),questionId:'q1',choiceId:'no'};const expected=applyParticipantAction(js,p.id,'answer',input);const actual=await postgresAction(code,'answer',p.id,p.secret,input);
 assert.equal(actual.result.correct,expected.correct);assert.equal(actual.result.delta,expected.delta);assert.deepEqual(actual.result.nextQuestion,{...expected.nextQuestion});assert.deepEqual(actual.run.node.scores,js.node.scores);assert.deepEqual(actual.run.node.cursors,js.node.cursors);
 assert.ok(!JSON.stringify(projectRun(actual.run,'participant',p.id)).includes('correctChoiceId'));
 async function freshFill(target=999,scheduled=false){
  await control('replay');const fresh=await read();
  assert.throws(()=>applyControl(fresh,'start-race'),/phones ready/);
  for(const person of Object.values(fresh.participants))person.readyAttempt=fresh.roundAttemptId;
  applyControl(fresh,'set-target',{target});applyControl(fresh,scheduled?'start-race':'open');fresh.revision++;
  assert.ok((await updatePostgresRun(code,fresh,fresh.revision-1)).modified);return fresh;
 }
 let fresh=await freshFill(1);const contenders=players.slice(0,2);
 const wins=await Promise.allSettled(contenders.map(p=>postgresAction(code,'answer',p.id,p.secret,{...attempt(fresh),questionId:'q0',choiceId:'yes'})));
 assert.equal(wins.filter(r=>r.status==='fulfilled').length,1);assert.equal((await read()).node.finishReason,'target');
 fresh=await freshFill();const wrong=await postgresAction(code,'answer',p.id,p.secret,{...attempt(fresh),questionId:'q0',choiceId:'no'});
 assert.equal(wrong.run.node.scores[wrong.run.participants[p.id].teamId],0);assert.equal(wrong.run.node.events.at(-1).clamped,true);
 await assert.rejects(postgresAction(code,'answer',p.id,p.secret,{...attempt(before),questionId:'q1',choiceId:'yes'}),/Stale round/);
 fresh=await freshFill(999,true);await assert.rejects(postgresAction(code,'answer',p.id,p.secret,{...attempt(fresh),questionId:'q0',choiceId:'yes'}),/not open/);
 fresh.node.startsAt=Date.now()-2000;fresh.node.endsAt=Date.now()-1000;fresh.revision++;assert.ok((await updatePostgresRun(code,fresh,fresh.revision-1)).modified);
 await assert.rejects(postgresAction(code,'answer',p.id,p.secret,{...attempt(fresh),questionId:'q0',choiceId:'yes'}),/not open/);
 assert.equal(projectRun(await read(),'public').activity.tied,true);
 console.log('PASS single target winner, zero floor, replay readiness, stale round and deadline guards');
 fresh=await freshFill();await control('hold');await assert.rejects(postgresAction(code,'answer',p.id,p.secret,{...attempt(fresh),questionId:'q0',choiceId:'yes'}),/hold/);
 await control('next');let pin=await read();await control('resume');
 const notes=await Promise.all(players.map(p=>postgresAction(code,'submit',p.id,p.secret,{...attempt(pin),text:'Test note',commandId:randomUUID()})));
 state=await read();assert.equal(state.node.submissions.length,150);assert.ok(state.node.submissions.every(n=>n.status==='pending'));assert.equal(projectRun(state,'public').activity.submissions.length,0);
 await control('approve',{submissionId:notes[0].result.submissionId});assert.equal(projectRun(await read(),'public').activity.submissions.length,1);
 console.log('PASS engine parity, held input, answer secrecy and 150 moderated submissions');
}finally{await deletePostgresRun(code);assert.equal(await readPostgresRun(code),null);await(await getDb()).pool.end();console.log('Cleaned up integration room');}
