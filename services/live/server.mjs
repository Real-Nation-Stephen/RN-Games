import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { lambdaHandler as read } from '../../netlify/functions/live-run.mjs';
import { lambdaHandler as join } from '../../netlify/functions/live-join.mjs';
import { lambdaHandler as action } from '../../netlify/functions/live-action.mjs';
import { lambdaHandler as control } from '../../netlify/functions/live-control.mjs';
import { lambdaHandler as media } from '../../netlify/functions/live-media.mjs';
import { createLiveRunRecord, getLiveRun, hydrateLiveRun, updateLiveRun, secretsEqual } from '../../netlify/functions/lib/live-store.mjs';
import { projectRun } from '../../netlify/functions/lib/live-run.mjs';
import { getDb } from '../../netlify/functions/lib/db.mjs';

const handlers = {'live-run':read,'live-join':join,'live-action':action,'live-control':control,'live-media':media};
const fail = (message,statusCode=400) => Object.assign(new Error(message),{statusCode});
function authorized(run, auth) {
  if (auth.role==='moderator') return secretsEqual(run.hostKey,auth.hostKey);
  if (auth.role==='participant') return secretsEqual(run.participants?.[auth.participantId]?.secret,auth.secret);
  return auth.role==='public';
}
function projection(run,auth,origin) {
  const state=projectRun(run,auth.role,auth.participantId || null);
  return mediaUrls(state,origin);
}
function mediaUrls(value,origin) {
  if (!value || typeof value!=='object') return value;
  for (const [key,item] of Object.entries(value)) {
    if (key==='imagePath' && typeof item==='string' && item.startsWith('/api/live-media?')) value[key]=origin+item;
    else if (item && typeof item==='object') mediaUrls(item,origin);
  }
  return value;
}
async function bodyOf(req,limit=6*1024*1024) {
  let size=0;const chunks=[];
  for await (const chunk of req) {size+=chunk.length;if(size>limit)throw fail('Request too large',413);chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
export async function startDedicatedServer({port=Number(process.env.PORT || 8080),host='0.0.0.0',test=false}={}) {
  if (test && process.env.RN_ISOLATED_QA!=='1') throw new Error('Test mode requires isolated QA');
  process.env.LIVE_DEDICATED_SERVER='1';
  if (!test) {
    if (process.env.LIVE_STORE_DRIVER || !process.env.DATABASE_URL) throw new Error('Dedicated service requires PostgreSQL; local storage is disabled');
    process.env.LIVE_STATE_BACKEND='postgres';
    await (await getDb()).pool.query('SELECT code FROM rn_live_runs_v1 LIMIT 0');
    await (await getDb()).pool.query('SELECT media_id FROM rn_live_media_v1 LIMIT 0');
  }
  const secret=process.env.DEDICATED_LIVE_SECRET || '';
  if(secret.length<32)throw new Error('DEDICATED_LIVE_SECRET must contain at least 32 characters');
  const allowed=new Set((process.env.LIVE_ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean));
  if(!allowed.size)throw new Error('LIVE_ALLOWED_ORIGINS is required');
  let origin=process.env.PUBLIC_LIVE_URL || '';
  if(!test && (!origin.startsWith('https://') || new URL(origin).origin!==origin))throw new Error('PUBLIC_LIVE_URL must be an HTTPS origin');
  const rooms=new Map(),nonces=new Map();
  function send(res,status,data,requestOrigin,extra={}) {
    res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','vary':'Origin',
      ...(requestOrigin && allowed.has(requestOrigin)?{'access-control-allow-origin':requestOrigin}:{}),...extra});
    res.end(typeof data==='string' || Buffer.isBuffer(data)?data:JSON.stringify(data));
  }
  async function internal(raw,req) {
    const stamp=String(req.headers['x-live-timestamp'] || ''),nonce=String(req.headers['x-live-nonce'] || ''),sig=String(req.headers['x-live-signature'] || '');
    if(!/^\d+$/.test(stamp) || Math.abs(Date.now()-Number(stamp))>60000 || !/^[a-zA-Z0-9-]{16,80}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig))throw fail('Forbidden',403);
    const expected=createHmac('sha256',secret).update(`${stamp}.${nonce}.${raw}`).digest();
    if(!timingSafeEqual(expected,Buffer.from(sig,'hex')) || nonces.has(nonce))throw fail('Forbidden',403);
    nonces.set(nonce,Date.now());
    const payload=JSON.parse(raw),code=String(payload.code || payload.run?.code || '').toUpperCase();
    if(!/^[A-Z0-9-]{6,80}$/.test(code))throw fail('Invalid code');
    if(payload.operation==='create') {
      const run=payload.run;
      if(!run?.runId || !run.hostKey || !run.snapshot?.steps || run.code!==code)throw fail('Invalid run');
      const existing=await getLiveRun(code);
      if(existing && existing.runId!==run.runId)throw fail('Live run code already exists',409);
      if(!existing)await createLiveRunRecord(code,run);
      return {code,runId:run.runId};
    }
    const run=await getLiveRun(code);
    if(!run || run.runId!==payload.runId)throw fail('Run not found',404);
    if(payload.operation==='resume')return {state:projection(await hydrateLiveRun(code),{role:'moderator'},origin)};
    if(payload.operation==='supersede') {
      await updateLiveRun(code,r=>{r.status='superseded';return r;});schedule(code);return {ok:true};
    }
    throw fail('Unknown operation');
  }
  const server=http.createServer(async(req,res)=>{
    const requestOrigin=req.headers.origin;
    try {
      const url=new URL(req.url,'http://local');
      if(url.pathname==='/health' && req.method==='GET')return send(res,200,{ok:true},requestOrigin);
      if(url.pathname==='/internal/runs' && req.method==='POST')return send(res,200,await internal(await bodyOf(req),req));
      if(requestOrigin && !allowed.has(requestOrigin))throw fail('Origin not allowed',403);
      if(req.method==='OPTIONS')return send(res,204,'',requestOrigin,{'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type,x-live-secret','access-control-max-age':'600'});
      const name=url.pathname.match(/^\/api\/(live-[a-z]+)$/)?.[1];
      if(!handlers[name] || (name==='live-run' && req.method!=='GET'))throw fail('Not found',404);
      // The service never loads Studio content or Netlify active pointers.
      if(name==='live-run' && !url.searchParams.get('code'))throw fail('code required');
      const body=req.method==='POST'?await bodyOf(req):'';
      if(name==='live-join' && !JSON.parse(body || '{}').code)throw fail('code required');
      const response=await handlers[name]({httpMethod:req.method,path:url.pathname,headers:req.headers,queryStringParameters:Object.fromEntries(url.searchParams),body});
      let responseBody=response.body || '';
      if(!response.isBase64Encoded && response.headers?.['Content-Type']==='application/json')responseBody=JSON.stringify(mediaUrls(JSON.parse(responseBody || '{}'),origin));
      const extra={...response.headers};
      for(const key of Object.keys(extra))if(key.toLowerCase().startsWith('access-control-'))delete extra[key];
      send(res,response.statusCode,response.isBase64Encoded?Buffer.from(responseBody,'base64'):responseBody,requestOrigin,extra);
      if(req.method==='POST' && response.statusCode<300)schedule(JSON.parse(body).code);
    } catch(error) {
      const status=error.statusCode || 500;
      send(res,status,{error:status===500?'Live service temporarily unavailable':error.message},requestOrigin);
    }
  });
  server.requestTimeout=20000;server.headersTimeout=15000;
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(new URL(req.url,'http://local').pathname!=='/live' || !allowed.has(req.headers.origin) || wss.clients.size>=1000) {socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function write(ws,data) {
    if(ws.readyState!==WebSocket.OPEN)return;
    if(ws.bufferedAmount>1024*1024){ws.close(1013,'Connection too slow');return;}
    ws.send(JSON.stringify(data));
  }
  async function refresh(code) {
    const room=rooms.get(code);if(!room || room.busy)return;
    room.busy=true;
    try {
      const run=await hydrateLiveRun(code);
      const publicState=run ? projection(run,{role:"public"},origin) : null;
      const unchanged=publicState && room.token===publicState.viewToken;
      room.token=publicState?.viewToken;
      for(const ws of room.clients) {
        if(!run || !authorized(run,ws.auth)){ws.close(1008,'Session unavailable');continue;}
        if(unchanged && ws.rev){write(ws,{changed:false,now:Date.now()});continue;}
        const state=ws.auth.role==="public" ? publicState : projection(run,ws.auth,origin);
        if(ws.rev!==state.viewToken){ws.rev=state.viewToken;write(ws,{changed:true,state});}
        else write(ws,{changed:false,now:Date.now()});
      }
    } catch {for(const ws of room.clients)ws.close(1011,'Reconnect to live service');}
    finally {room.busy=false;}
  }
  function schedule(rawCode) {
    const code=String(rawCode || '').toUpperCase(),room=rooms.get(code);
    if(room && !room.timer)room.timer=setTimeout(()=>{room.timer=null;void refresh(code);},75);
  }
  wss.on('connection',ws=>{
    ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
    const authTimer=setTimeout(()=>ws.close(1008,'Authentication required'),5000);
    ws.on('message',async raw=>{
      if(ws.auth && raw.toString()==='ping'){ws.send('pong');return;}
      if(ws.auth) {
        try {
          const message=JSON.parse(raw.toString());
          if(message.type==='clock' && Number.isFinite(message.sentAt) && Date.now()-(ws.lastClock || 0)>1000) {
            ws.lastClock=Date.now();write(ws,{type:'clock',sentAt:message.sentAt,now:Date.now()});return;
          }
        } catch { /* handled by subscription guard */ }
      }
      // One authenticated subscription per socket; credentials never enter URLs/logs.
      if(ws.authenticating || ws.auth){ws.close(1008,'Already subscribed');return;}
      ws.authenticating=true;
      try {
        const auth=JSON.parse(raw.toString());auth.code=String(auth.code || '').toUpperCase();
        const run=await hydrateLiveRun(auth.code);
        if(!run || !authorized(run,auth))throw new Error('Forbidden');
        if(ws.readyState!==WebSocket.OPEN)return;
        ws.auth=auth;clearTimeout(authTimer);
        let room=rooms.get(auth.code);if(!room){room={clients:new Set(),busy:false,timer:null};rooms.set(auth.code,room);}
        room.clients.add(ws);
        const state=projection(run,auth,origin);ws.rev=state.viewToken;write(ws,{changed:true,state});
      } catch {ws.close(1008,'Forbidden');}
    });
    ws.on('error',()=>{});
    ws.on('close',()=>{clearTimeout(authTimer);const room=rooms.get(ws.auth?.code);if(room){room.clients.delete(ws);if(!room.clients.size){clearTimeout(room.timer);rooms.delete(ws.auth.code);}}});
  });
  const updateTimer=setInterval(()=>{for(const code of rooms.keys())void refresh(code);for(const [nonce,at] of nonces)if(Date.now()-at>60000)nonces.delete(nonce);},1000);
  const pingTimer=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
  await new Promise(resolve=>server.listen(port,host,resolve));
  if(test && !origin)origin=`http://127.0.0.1:${server.address().port}`;
  return {server,origin,async close(){clearInterval(updateTimer);clearInterval(pingTimer);for(const room of rooms.values())clearTimeout(room.timer);for(const ws of wss.clients)ws.terminate();wss.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const live=await startDedicatedServer({test:process.env.RN_ISOLATED_QA==='1'});
  console.log(`Dedicated live service listening on port ${live.server.address().port}`);
  process.send?.({port:live.server.address().port});
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await live.close();process.exit(0);});
}
