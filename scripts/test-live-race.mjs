import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunDocument, applyControl, applyParticipantAction, joinParticipant, projectRun } from '../netlify/functions/lib/live-run.mjs';
import { normalizeMiniPollRecord, toPublicMiniPoll } from '../netlify/functions/lib/live-modules.mjs';

function fixture(kind = 'fill-game') {
  const cfg = kind === 'fill-game' ? {
    id: 'fill', slug: 'fill', gameType: kind,
    teams: [{ id:'a', name:'A', target:10 },{ id:'b', name:'B', target:10 }],
    questions: Array.from({length:10}, (_,i) => ({id:`q${i}`,prompt:`Question ${i}`,choices:[{id:'yes',label:'Yes'},{id:'no',label:'No'}],correctChoiceId:'yes'})),
  } : normalizeMiniPollRecord({id:'poll',slug:'poll',options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'Both'}],correctOptionId:'c',revealDurationMs:1200});
  const run = createRunDocument({experience:{id:'exp',slug:'qa',title:'QA'},snapshot:{steps:[{id:'step',moduleType:kind,liveCapable:true}],configs:{step:cfg},secrets:{step:{questions:cfg.questions}},joinScreen:{}},hostKey:'host',code:'QATEST'});
  const players = Array.from({length:4},()=>joinParticipant(run));
  applyControl(run,'next');
  return {run,cfg,players};
}
function answer(run,p,choiceId='yes',questionId='q0') {
  return applyParticipantAction(run,p.id,'answer',{runId:run.runId,nodeId:'step',roundAttemptId:run.roundAttemptId,questionId,choiceId});
}

test('scheduled start preloads safely, rejects early/late input, and declares the timeout winner', (t) => {
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {run,players}=fixture();
  applyControl(run,'set-duration',{durationSeconds:10});
  applyControl(run,'start-race');
  assert.equal(run.node.startsAt-now,6000);
  const prepared=projectRun(run,'participant',players[0].id);
  assert.equal(prepared.me.question.id,'q0');
  assert.ok(prepared.component.questions.length===10);
  assert.ok(!JSON.stringify(prepared.component).includes('correctChoiceId'));
  assert.throws(()=>answer(run,players[0]),/Race is not open/);
  now=run.node.startsAt;
  answer(run,players[0]);
  assert.equal(run.node.phase,'racing');
  const winningTeam=players[0].teamId;
  now=run.node.endsAt;
  assert.throws(()=>answer(run,players[1]),/Race is not open/);
  const final=projectRun(run,'public');
  assert.equal(final.activity.finishedTeamId,winningTeam);
  assert.equal(final.activity.finishReason,'timeout');
  assert.equal(Object.keys(run.node.answered).length,1);
});

test('target victory ends the race immediately and rejects subsequent answers', (t)=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {run,players}=fixture();applyControl(run,'set-target',{target:1});applyControl(run,'start-race');now=run.node.startsAt;
  answer(run,players[0]);assert.equal(run.node.finishReason,'target');
  assert.equal(run.node.finishedTeamId,players[0].teamId);
  assert.throws(()=>answer(run,players[1]),/Race is not open/);
});

test('pause preserves remaining time and resume schedules a fresh shared countdown', (t)=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {run}=fixture();applyControl(run,'set-duration',{durationSeconds:30});applyControl(run,'start-race');
  now=run.node.startsAt+9000;applyControl(run,'hold');assert.equal(run.node.remainingMs,21000);
  now+=60000;assert.equal(projectRun(run,'public').activity.phase,'held');
  applyControl(run,'resume');assert.equal(run.node.phase,'countdown');assert.equal(run.node.endsAt-run.node.startsAt,21000);
  now=run.node.endsAt;const final=projectRun(run,'public');assert.equal(final.activity.phase,'finished');assert.equal(final.activity.tied,true);assert.equal(final.activity.finishedTeamId,null);
});

test('holding during countdown preserves the full duration; timer and target cannot change mid-race', (t)=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {run}=fixture();applyControl(run,'start-race');now+=1000;applyControl(run,'hold');assert.equal(run.node.remainingMs,90000);
  assert.throws(()=>applyControl(run,'set-duration',{durationSeconds:20}),/Replay/);
  assert.throws(()=>applyControl(run,'set-target',{target:1}),/Replay/);
  applyControl(run,'resume');assert.equal(run.node.endsAt-run.node.startsAt,90000);
});

test('attendance target uses the smaller connected team and can be overridden before starting',()=>{
  const {run}=fixture();applyControl(run,'attendance-target');assert.equal(run.node.target,10);
  applyControl(run,'set-target',{target:7});assert.equal(run.node.target,7);
  for(const value of [0,-1,NaN,Infinity,12.5,1000]) assert.throws(()=>applyControl(run,'set-target',{target:value}));
});

test('three-option poll tallies the third option and hides the answer key until reveal', (t)=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {run,cfg,players}=fixture('mini-poll');assert.equal(toPublicMiniPoll(cfg).correctOptionId,undefined);
  applyControl(run,'open');
  for (const p of players) applyParticipantAction(run,p.id,'vote',{nodeId:'step',roundAttemptId:run.roundAttemptId,optionId:'c'});
  applyControl(run,'tally');let view=projectRun(run,'public');assert.equal(view.activity.tally,null);assert.equal(view.activity.correctOptionId,null);
  now+=1200;view=projectRun(run,'public');assert.equal(view.activity.tally.percents.c,100);assert.deepEqual(view.activity.tally.leadingOptionIds,['c']);assert.equal(view.activity.correctOptionId,'c');
});
