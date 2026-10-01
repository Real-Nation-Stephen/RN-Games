/** Routing is immutable per run. Only authenticated lifecycle calls provision a service. */
import { createHmac, randomUUID } from 'node:crypto';
import { liveCasStore, setActiveRunCode, updateLiveRun } from './live-store.mjs';
const env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name];
export const dedicatedServer = () => process.env.LIVE_DEDICATED_SERVER === '1';
const routeKey = code => `liveroute:${String(code).trim().toUpperCase()}`;
export function dedicatedConfig() {
  const secret = env('DEDICATED_LIVE_SECRET');
  let url;
  try { url = new URL(env('DEDICATED_LIVE_URL')); } catch { /* fail closed */ }
  const local = process.env.RN_ISOLATED_QA === '1' && ['127.0.0.1','localhost'].includes(url?.hostname);
  if (!url || (!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') || !secret || secret.length < 32) {
    throw Object.assign(new Error('Dedicated live service is not configured. Configure its URL and shared secret before starting a dedicated run.'), {statusCode:503});
  }
  return {apiBase:url.origin, secret};
}
export async function getLiveRoute(code) {
  // Dedicated codes use a non-hex prefix so existing rooms incur no routing reads.
  if (!/^L[0-9A-F]{6}$/.test(String(code || "").toUpperCase()) || dedicatedServer()) return null;
  return (await liveCasStore()).get(routeKey(code), {type:'json'});
}
export const publicConnection = route => route
  ? {mode:'dedicated', apiBase:route.apiBase, code:route.code, runId:route.runId, socketPresence:!!route.socketPresence}
  : {mode:'standard'};
export const routeResponse = route => ({routeOnly:true, connection:publicConnection(route)});
export async function callDedicated(apiBase, payload) {
  const {secret} = dedicatedConfig();
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = createHmac('sha256',secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
  const response = await fetch(`${apiBase}/internal/runs`, {method:'POST',
    headers:{'content-type':'application/json','x-live-timestamp':timestamp,'x-live-nonce':nonce,'x-live-signature':signature},
    body, signal:AbortSignal.timeout(15000)});
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Dedicated service unavailable'),{statusCode:response.status});
  return data;
}
export async function retireLiveRun(code) {
  if (!code) return;
  const route = await getLiveRoute(code);
  if (route) await callDedicated(route.apiBase,{operation:'supersede',code,runId:route.runId});
  else await updateLiveRun(code, run => { run.status='superseded'; return run; });
}
export async function createDedicatedRun(run, experienceId, previousCode) {
  const {apiBase} = dedicatedConfig();
  const route = {apiBase,code:run.code,runId:run.runId,hostKey:run.hostKey,status:run.status};
  const provisioned = await callDedicated(apiBase,{operation:'create',run});
  route.socketPresence = !!provisioned.socketPresence;
  try {
    const stored = await (await liveCasStore()).setJSON(routeKey(run.code),route,{onlyIfNew:true});
    if (!stored?.modified) throw new Error('Live run code already exists');
    await setActiveRunCode(experienceId,run.code,{expectedCode:previousCode || ''});
  } catch (error) {
    await callDedicated(apiBase,{operation:'supersede',code:run.code,runId:run.runId}).catch(()=>{});
    throw error;
  }
  await retireLiveRun(previousCode).catch(()=>{});
  return route;
}
