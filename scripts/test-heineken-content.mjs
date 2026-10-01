import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeinekenPack } from './prepare-heineken-live.mjs';
import { buildSnapshot, createRunDocument, applyControl, joinParticipant, projectRun } from '../netlify/functions/lib/live-run.mjs';
import { normalizeFillGameRecord, toPublicFillGame } from '../netlify/functions/lib/live-modules.mjs';
import { setLiveTestHooks } from '../netlify/functions/lib/live-store.mjs';
import { createMemoryCasStore } from '../netlify/functions/lib/cas-store.mjs';

test('full event uses supplied content and keeps uncertain items out of answer keys', () => {
  const pack = buildHeinekenPack({experience:{foundation:{}},poll:{},fill:{teams:[{},{}]},pinboard:{gameType:'pinboard'},equipment:{bluebird:'/a.png',standard:'/b.png',switch:'/c.png'}});
  assert.equal(pack.experience.status,'draft');
  assert.equal(pack.modules.length,17);
  assert.equal(pack.experience.linearSteps.length,16);
  assert.ok(pack.modules.every(m=>['mini-poll','fill-game','pinboard'].includes(m.gameType)));
  const polls=pack.modules.filter(m=>m.gameType==='mini-poll');
  assert.ok(!pack.experience.linearSteps.some(s=>s.moduleInstanceId===polls[5].id));
  assert.equal(polls[2].correctOptionId,polls[2].options[0].id);
  assert.equal(polls[4].correctOptionId,polls[4].options[0].id);
  for(const i of [0,1,3,5,6,7]) assert.equal(polls[i].correctOptionId,'');
  assert.equal(polls[3].options.length,3);
  const fill=pack.modules.find(m=>m.gameType==='fill-game');
  assert.equal(fill.questions.length,12);
  assert.deepEqual(fill.questions.map(q=>q.choices.findIndex(c=>c.id===q.correctChoiceId)),[2,2,1,3,2,3,2,0,1,1,0,0]);
  assert.ok(fill.questions.every(q=>q.enabled));
  assert.equal(pack.modules.filter(m=>m.gameType==='pinboard').filter(m=>/In three words/.test(m.board.header)).length,1);
});

test('inactive questions stay editable but never enter a live snapshot or phone preload', async t => {
  const store=createMemoryCasStore();setLiveTestHooks({store});t.after(()=>setLiveTestHooks({}));
  const fill=normalizeFillGameRecord({id:'fill',slug:'fill',questions:[
    {id:'draft',enabled:false,prompt:'Unconfirmed',choices:[{id:'a',label:'A'},{id:'b',label:'B'}],correctChoiceId:'a'},
    {id:'ready',prompt:'Confirmed',choices:[{id:'a',label:'A'},{id:'b',label:'B'}],correctChoiceId:'b'},
  ]});
  assert.equal(fill.questions.length,2);
  assert.deepEqual(toPublicFillGame(fill).questions.map(q=>q.id),['ready']);
  await store.setJSON('wheels-index',{list:[fill]});await store.setJSON('wheel:fill',fill);
  const experience={id:'e',slug:'qa',linearSteps:[{id:'s',moduleInstanceId:'fill',moduleType:'fill-game'}]};
  const snapshot=await buildSnapshot(experience);
  assert.deepEqual(snapshot.secrets.s.questions.map(q=>q.id),['ready']);
  const run=createRunDocument({experience,snapshot,code:'TEST',hostKey:'test'});
  const p=joinParticipant(run);applyControl(run,'next');applyControl(run,'start-race');
  const view=projectRun(run,'participant',p.id);
  assert.equal(view.me.question.id,'ready');
  assert.ok(!JSON.stringify(view).includes('correctChoiceId'));
});
