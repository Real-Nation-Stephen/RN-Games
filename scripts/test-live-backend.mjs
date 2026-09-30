import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresLiveEnabled} from '../netlify/functions/lib/live-postgres.mjs';

test('Functions v2 backend selection respects runtime variables and local isolation',t=>{
 const saved={netlify:globalThis.Netlify,driver:process.env.LIVE_STORE_DRIVER,backend:process.env.LIVE_STATE_BACKEND,hooks:globalThis.__RN_LIVE_TEST__};
 t.after(()=>{globalThis.Netlify=saved.netlify;globalThis.__RN_LIVE_TEST__=saved.hooks;for(const [key,value] of [['LIVE_STORE_DRIVER',saved.driver],['LIVE_STATE_BACKEND',saved.backend]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 delete process.env.LIVE_STATE_BACKEND;delete process.env.LIVE_STORE_DRIVER;globalThis.__RN_LIVE_TEST__={};
 globalThis.Netlify={env:{get:key=>key==='LIVE_STATE_BACKEND'?'postgres':undefined}};
 assert.equal(postgresLiveEnabled(),true);
 process.env.LIVE_STORE_DRIVER='memory';assert.equal(postgresLiveEnabled(),false);
 delete process.env.LIVE_STORE_DRIVER;globalThis.__RN_LIVE_TEST__={store:{}};assert.equal(postgresLiveEnabled(),false);
 globalThis.__RN_LIVE_TEST__={};globalThis.Netlify=undefined;assert.equal(postgresLiveEnabled(),false);
 process.env.LIVE_STATE_BACKEND='postgres';assert.equal(postgresLiveEnabled(),true);
});
