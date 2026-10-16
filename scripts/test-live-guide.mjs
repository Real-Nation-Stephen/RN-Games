import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunDocument,applyControl,applyParticipantAction,joinParticipant,projectRun,tickRun} from '../netlify/functions/lib/live-engine.mjs';
import {liveStageKey,nextLiveAction} from '../packages/shared/src/live-guide.mjs';
function fixture(){
 return createRunDocument({experience:{id:'guide',slug:'guide'},code:'GUIDE',hostKey:'host',snapshot:{steps:[
 {id:'p',moduleType:'mini-poll',liveCapable:true},{id:'f',moduleType:'fill-game',liveCapable:true},{id:'b',moduleType:'pinboard',liveCapable:true}],
 configs:{p:{options:[{id:'a',label:'A'},{id:'b',label:'B'}],correctOptionId:'a',revealDurationMs:1200},f:{teams:[{id:'a',target:10},{id:'b',target:10}],questions:[{id:'q',prompt:'Q',choices:[{id:'a',label:'A'}],correctChoiceId:'a'}]},b:{}},secrets:{},joinScreen:{}}});
}
function advance(run, extra={}){return applyControl(run,'advance',{expectedStage:liveStageKey(projectRun(run,'moderator')), ...extra});}
test('guided poll counts privately, waits for explicit reveal and never skips a phase',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const r=fixture(),p=joinParticipant(r);advance(r);assert.equal(r.currentStepIndex,0);assert.equal(r.node.phase,'open');
 applyParticipantAction(r,p.id,'vote',{nodeId:'p',roundAttemptId:r.roundAttemptId,optionId:'a'});
 advance(r);assert.equal(r.node.phase,'tallied');
 now+=60000;tickRun(r);
 for(const role of ['public','participant']){const state=projectRun(r,role,p.id);assert.equal(state.activity.tally,null);assert.equal(state.activity.correctOptionId,null);}
 assert.equal(r.node.phase,'tallied');
 advance(r);assert.equal(r.node.phase,'tallying');assert.equal(nextLiveAction(projectRun(r,'moderator')).disabled,true);
 assert.throws(()=>advance(r),/reveal/);now+=1200;tickRun(r);assert.equal(r.node.phase,'revealed');assert.equal(projectRun(r,'public').activity.tally.counts.a,1);
 advance(r);assert.equal(r.currentStepIndex,1);
});
test('legacy advanced tally still automatically reveals',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);const r=fixture();applyControl(r,'next');applyControl(r,'open');applyControl(r,'tally');now+=1200;tickRun(r);assert.equal(r.node.phase,'revealed');
});
test('duplicate, stale and competing console Next commands cannot skip a stage',()=>{
 const r=fixture();const payload={expectedStage:liveStageKey(projectRun(r,'moderator')),controllerId:'one',commandId:'same'};
 applyControl(r,'advance',payload);assert.equal(applyControl(r,'advance',payload).duplicate,true);
 assert.throws(()=>applyControl(r,'advance',{...payload,commandId:'other'}),/changed/);
 assert.throws(()=>advance(r,{controllerId:'two'}),/Another console/);assert.equal(r.node.phase,'open');
});
test('votes arriving after a button was rendered do not invalidate the next action',()=>{
 const r=fixture(),p=joinParticipant(r);advance(r);const expectedStage=liveStageKey(projectRun(r,'moderator'));
 applyParticipantAction(r,p.id,'vote',{nodeId:'p',roundAttemptId:r.roundAttemptId,optionId:'a'});r.revision++;
 applyControl(r,'advance',{expectedStage});assert.equal(r.node.tally.total,1);
});
test('scale persists through step changes and is projected to both consoles and presenters',()=>{
 const r=fixture();applyControl(r,'set-presenter-scale',{scale:135});advance(r);applyControl(r,'replay');
 for(const role of ['public','moderator'])assert.equal(projectRun(r,role).presenterScale,135);
 for(const scale of [0,74,151,100.1,NaN,Infinity])assert.throws(()=>applyControl(r,'set-presenter-scale',{scale}),/Screen size/);
 assert.equal(projectRun(fixture(),'public').presenterScale,100);
});
test('race Next waits for readiness and completion; hold/resume remains available',t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);const r=fixture();applyControl(r,'next');applyControl(r,'next');r.readinessRequired=true;
 assert.equal(nextLiveAction(projectRun(r,'moderator')).disabled,true);assert.throws(()=>advance(r),/phones/);
 const p=joinParticipant(r);p.readyAttempt=r.roundAttemptId;advance(r);assert.equal(r.node.phase,'countdown');assert.throws(()=>advance(r),/countdown/);
 now=r.node.startsAt;tickRun(r);assert.throws(()=>advance(r),/race ends/);
 applyControl(r,'hold');advance(r);assert.equal(r.node.phase,'countdown');now=r.node.endsAt;tickRun(r);advance(r);assert.equal(r.node.kind,'pinboard');
});
test('quiz, pinboard, wheel, scratcher and closing have explicit safe next actions',()=>{
 const state=(kind,phase,extra={})=>({activity:{kind,phase,...extra},eligibleCount:2});
 assert.equal(nextLiveAction(state('mini-quiz','idle')).action,'open');
 assert.equal(nextLiveAction(state('mini-quiz','open')).action,'reveal');
 assert.equal(nextLiveAction(state('mini-quiz','revealed',{questionIndex:0,questionCount:2})).action,'next-question');
 assert.equal(nextLiveAction(state('mini-quiz','revealed',{questionIndex:1,questionCount:2})).action,'next');
 assert.match(nextLiveAction(state('pinboard','open',{submissions:[{status:'pending'}]})).tip,/1 responses/);
 assert.equal(nextLiveAction(state('spinning-wheel','spinning')).disabled,true);
 assert.equal(nextLiveAction(state('scratcher','idle')).action,'release');
 assert.equal(nextLiveAction(state('closing','ended')).disabled,true);
});

test('polls open by default; opt-out persists, preserves votes, and applies on entry/reset',()=>{
 const r=fixture(),p=joinParticipant(r);
 assert.equal(projectRun(r,'moderator').autoOpenPolls,true);
 advance(r);assert.equal(r.node.phase,'open');
 applyParticipantAction(r,p.id,'vote',{nodeId:'p',roundAttemptId:r.roundAttemptId,optionId:'a'});
 applyControl(r,'set-auto-open-polls',{enabled:false});
 assert.equal(r.node.phase,'open');assert.equal(Object.keys(r.node.votes).length,1);
 assert.equal(projectRun(r,'moderator').autoOpenPolls,false);
 applyControl(r,'replay');assert.equal(r.node.phase,'idle');assert.equal(Object.keys(r.node.votes).length,0);
 advance(r);assert.equal(r.node.phase,'open');
 applyControl(r,'next');applyControl(r,'prev');assert.equal(r.node.phase,'idle');
 applyControl(r,'set-auto-open-polls',{enabled:true});assert.equal(r.node.phase,'idle');
 applyControl(r,'replay');assert.equal(r.node.phase,'open');
 for(const enabled of [null,'false',0,undefined])assert.throws(()=>applyControl(r,'set-auto-open-polls',{enabled}),/on or off/);
});
