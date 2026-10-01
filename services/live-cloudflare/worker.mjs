import { DurableObject } from 'cloudflare:workers';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { applyControl, applyParticipantAction, assertAttempt, joinParticipant, projectRun, tickRun, PRESENCE_MS } from '../../netlify/functions/lib/live-engine.mjs';
import { secretsEqual } from '../../netlify/functions/lib/live-identity.mjs';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const validCode = code => /^[A-Z0-9-]{6,80}$/.test(code);
const authenticated = (run, auth) => auth.role === 'public' ||
  (auth.role === 'moderator' && secretsEqual(run.hostKey, auth.hostKey)) ||
  (auth.role === 'participant' && secretsEqual(run.participants[auth.participantId]?.secret, auth.secret));
function verify(request, raw, secret) {
  const stamp = request.headers.get('x-live-timestamp') || '', nonce = request.headers.get('x-live-nonce') || '';
  const signature = request.headers.get('x-live-signature') || '';
  if (!secret || secret.length < 32 || !/^\d+$/.test(stamp) || Math.abs(Date.now() - Number(stamp)) > 60000 || !/^[a-zA-Z0-9-]{16,80}$/.test(nonce)) throw fail('Forbidden', 403);
  const expected = createHmac('sha256', secret).update(`${stamp}.${nonce}.${raw}`).digest('hex');
  if (!secretsEqual(signature, expected)) throw fail('Forbidden', 403);
  return nonce;
}
// Content is immutable for a run. Copy only mutable scores/participants when
// staging an atomic command; full-event artwork/config must not be cloned for
// every answer, timer check and recipient of a broadcast.
function cloneState(run) {
  const { snapshot, ...state } = run;
  return { ...structuredClone(state), snapshot };
}
function mediaUrls(value, origin) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => mediaUrls(item, origin));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'imagePath' && typeof item === 'string' && item.startsWith('/api/live-media?')
      ? origin + item : mediaUrls(item, origin)
  ]));
}
async function readBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw fail('Request too large', 413);
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) { await reader.cancel(); throw fail('Request too large', 413); } chunks.push(value); }
  return Buffer.concat(chunks).toString('utf8');
}
export default {
  async fetch(request, env) {
    const requestStarted = Date.now();
    const origin = request.headers.get('origin'), url = new URL(request.url);
    const allowed = new Set(String(env.LIVE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()));
    let response;
    try {
      if (origin && !allowed.has(origin)) throw fail('Origin not allowed', 403);
      if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
      else if (url.pathname === '/health') response = json({ ok: true, backend: 'cloudflare' });
      else {
        const internal = url.pathname === '/internal/runs' && request.method === 'POST';
        const raw = request.method === 'POST' ? await readBody(request, internal ? 6 * 1024 * 1024 : 500000) : '';
        if (internal) verify(request, raw, env.DEDICATED_LIVE_SECRET);
        let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { throw fail('Invalid JSON'); }
        const code = String(body.code || body.run?.code || url.searchParams.get('code') || '').trim().toUpperCase();
        if (!validCode(code)) throw fail('Valid room code required');
        if (!internal && !['/live', '/api/live-run', '/api/live-join', '/api/live-action', '/api/live-control', '/api/live-media'].includes(url.pathname)) throw fail('Not found', 404);
        const id = env.LIVE_ROOMS.idFromName(code);
        response = await env.LIVE_ROOMS.get(id).fetch(new Request(request.url, { method: request.method, headers: request.headers, body: raw || undefined }));
      }
    } catch (error) { response = json({ error: error.statusCode ? error.message : 'Live service temporarily unavailable' }, error.statusCode || 503); }
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    headers.set('server-timing', `live;dur=${Date.now() - requestStarted}`);
    headers.set('vary', 'Origin'); headers.set('cache-control', 'no-store');
    if (origin && allowed.has(origin)) headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type,x-live-secret');
    headers.set('access-control-max-age', '600');
    return new Response(response.body, { status: response.status, headers });
  }
};

export class LiveRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql; this.alarmAt = 0;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nonces (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
    const saved = this.sql.exec('SELECT body FROM room WHERE id=1').toArray()[0];
    this.run = saved ? JSON.parse(saved.body) : null;
    if (this.run) this.run.snapshot = JSON.parse(this.sql.exec('SELECT body FROM snapshot WHERE id=1').one().body);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // Preserve an already scheduled broadcast/deadline across hibernation. A
    // read after waking must not replace it with a later game deadline.
    ctx.blockConcurrencyWhile(async () => { this.alarmAt = await ctx.storage.getAlarm() || 0; });
  }
  persist(candidate, extra = () => {}) {
    candidate.revision = (this.run?.revision || 0) + 1;
    candidate.updatedAt = new Date().toISOString(); candidate.commandLog = {};
    const { snapshot, ...state } = candidate;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT OR REPLACE INTO room VALUES (1, ?)', JSON.stringify(state)); extra();
    });
    this.run = candidate;
  }
  presence() {
    if (!this.run) return;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a?.auth || a.auth.role !== 'participant') continue;
      const p = this.run.participants[a.auth.participantId]; if (!p) continue;
      const at = Math.max(a.at, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0);
      if (at > Date.parse(p.lastSeen || 0)) p.lastSeen = new Date(at).toISOString();
    }
  }
  state(auth, origin) {
    const state = mediaUrls(projectRun(this.run, auth.role, auth.participantId || null, { alreadyTicked: true }), origin);
    // Answer animations belong on the room screen; each phone has its own
    // lastFeedback. Avoid broadcasting everyone else's 40-event history to it.
    if (auth.role === 'participant' && state.activity.kind === 'fill-game') state.activity.events = [];
    return state;
  }
  contentKey() {
    const node = this.run.node;
    const quiz = node.kind === 'mini-quiz' ? `:${node.questionIndex}:${node.phase}` : '';
    return `${this.run.runId}:${this.run.currentStepIndex}:${this.run.roundAttemptId}${quiz}`;
  }
  checkRun() {
    if (!this.run) throw fail('Run not found', 404);
    if (this.run.status === 'superseded' || Date.now() >= Date.parse(this.run.expiresAt)) throw fail('This session has ended. Rejoin using the current room code.', 410);
    this.presence();
  }
  // No await between reading room state and committing a mutation: each command is atomic.
  tick() {
    const node = this.run.node;
    if (!node || !(['countdown', 'racing', 'tallying', 'spinning'].includes(node.phase))) return;
    // tickRun mutates only node state, never participants or the snapshot.
    const candidate = { ...this.run, node: structuredClone(node) };
    if (tickRun(candidate)) this.persist(candidate);
  }
  async schedule(soon = false) {
    if (!this.run) return;
    const now = Date.now(), node = this.run.node, dates = [Date.parse(this.run.expiresAt)];
    if (soon) dates.push(now + 100);
    if (!this.run.held) {
      if (node.phase === 'countdown') dates.push(node.startsAt);
      if (node.phase === 'racing') dates.push(node.endsAt);
      if (node.phase === 'tallying') dates.push(Number(node.tallyStartedAt) + Number(node.revealDurationMs || 3000));
      if (node.phase === 'spinning') dates.push(Number(node.spinStartedAt) + Number(node.durationMs || 6000) + 400);
    }
    // Socket presence needs no periodic database writes. Recheck stale clients once a minute.
    if (this.ctx.getWebSockets().length) dates.push(now + PRESENCE_MS);
    for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (!a?.auth) dates.push(a.at + 5000); }
    for (const p of Object.values(this.run.participants)) { const expiry = Date.parse(p.lastSeen) + PRESENCE_MS + 5; if (expiry > now) dates.push(expiry); }
    const next = Math.max(now + 10, Math.min(...dates.filter(n => Number.isFinite(n) && n > now)));
    if (Number.isFinite(next) && (!this.alarmAt || next < this.alarmAt)) {
      this.alarmAt = next; await this.ctx.storage.setAlarm(next);
    }
  }
  async alarm() {
    this.alarmAt = 0;
    if (!this.run) return;
    if (Date.now() >= Date.parse(this.run.expiresAt)) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Session expired');
      // Sessions are temporary. Clear their participant identities, receipts and photos after expiry.
      this.ctx.storage.transactionSync(() => this.sql.exec('DELETE FROM room; DELETE FROM snapshot; DELETE FROM receipts; DELETE FROM media; DELETE FROM nonces;'));
      this.run = null; return;
    }
    this.presence(); this.tick();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a?.auth) { if (Date.now() - a.at >= 5000) ws.close(1008, 'Authentication required'); continue; }
      if (!authenticated(this.run, a.auth)) { ws.close(1008, 'Forbidden'); continue; }
      if (this.run.status === 'superseded') { ws.close(1000, 'Session replaced'); continue; }
      const state = this.state(a.auth, a.origin);
      if (state.viewToken !== a.rev) {
        const contentKey = this.contentKey();
        const patch = !!a.auth.compactUpdates && a.contentKey === contentKey;
        // New/reconnected clients and round changes always receive full content.
        // Only capable clients reuse immutable content within the same round.
        const { component, joinScreen, steps, ...updates } = state;
        ws.send(JSON.stringify({ changed: true, state: patch ? updates : state, patch }));
        ws.serializeAttachment({ ...a, rev: state.viewToken, contentKey });
      }
    }
    await this.schedule();
  }
  async fetch(request) {
    try {
      const url = new URL(request.url), path = url.pathname;
      if (path === '/internal/runs') {
        const raw = await request.text(), nonce = verify(request, raw, this.env.DEDICATED_LIVE_SECRET), body = JSON.parse(raw);
        if (this.sql.exec('SELECT id FROM nonces WHERE id=?', nonce).toArray().length) throw fail('Forbidden', 403);
        this.sql.exec('DELETE FROM nonces WHERE expires < ?', Date.now());
        this.sql.exec('INSERT INTO nonces VALUES (?, ?)', nonce, Date.now() + 60000);
        if (body.operation === 'create') {
          const run = body.run;
          if (!run?.runId || !run.hostKey || !run.snapshot?.steps || !validCode(run.code)) throw fail('Invalid run');
          if (this.run && this.run.runId !== run.runId) throw fail('Live run code already exists', 409);
          if (!this.run) { run.readinessRequired = true; this.persist(run, () => this.sql.exec('INSERT INTO snapshot VALUES (1, ?)', JSON.stringify(run.snapshot))); }
          await this.schedule(); return json({ code: run.code, runId: run.runId, socketPresence: true });
        }
        if (!this.run && body.operation === 'resume') throw fail('This session has expired. Start a fresh session.', 410);
        if (!this.run || this.run.runId !== body.runId) throw fail('Run not found', 404);
        if (body.operation === 'resume') { this.checkRun(); this.tick(); return json({ state: this.state({ role: 'moderator' }, url.origin) }); }
        if (body.operation === 'supersede') { this.persist({ ...this.run, status: 'superseded' }); await this.schedule(true); return json({ ok: true }); }
        throw fail('Unknown operation');
      }
      this.checkRun(); this.tick();
      if (path === '/live' && request.headers.get('upgrade') === 'websocket') {
        if (this.ctx.getWebSockets().length >= 350) throw fail('Room connection limit reached', 429);
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server); server.serializeAttachment({ at: Date.now(), origin: url.origin });
        await this.schedule(true);
        return new Response(null, { status: 101, webSocket: client });
      }
      if (path === '/api/live-media' && request.method === 'GET') {
        const id = url.searchParams.get('id');
        if (url.searchParams.get('runId') !== this.run.runId) throw fail('Not found', 404);
        const approved = this.run.node?.submissions?.some(s => s.mediaId === id && s.status === 'approved');
        if (!approved && !secretsEqual(this.run.hostKey, url.searchParams.get('hostKey'))) throw fail('Forbidden', 403);
        const data = this.sql.exec('SELECT data FROM media WHERE id=?', id).toArray()[0]?.data;
        const match = data?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$/);
        if (!match) throw fail('Not found', 404);
        return new Response(Buffer.from(match[2], 'base64'), { headers: { 'content-type': match[1], 'x-content-type-options': 'nosniff' } });
      }
      if (path === '/api/live-run' && request.method === 'GET') {
        const auth = Object.fromEntries(url.searchParams); auth.role ||= 'public'; auth.secret = request.headers.get('x-live-secret');
        if (!authenticated(this.run, auth)) throw fail('Forbidden', 403);
        const state = this.state(auth, url.origin); await this.schedule();
        return json(state.viewToken === auth.rev ? { changed: false, now: Date.now() } : { changed: true, state });
      }
      if (request.method !== 'POST') throw fail('Not found', 404);
      const body = await request.json();
      // Body parsing can yield; always refresh the authoritative state after it.
      this.checkRun(); this.tick();
      const candidate = cloneState(this.run);
      if (path === '/api/live-join') {
        if (!body.participantId && Object.keys(candidate.participants).length >= 150) throw fail('This room has reached its 150-player limit', 409);
        const p = joinParticipant(candidate, body.participantId || '', body.secret || '');
        this.persist(candidate); const state = this.state({ role: 'participant', participantId: p.id }, url.origin);
        await this.schedule(true);
        return json({ participantId: p.id, secret: p.secret, participantNumber: p.number, code: candidate.code, state });
      }
      const host = path === '/api/live-control';
      if (!host && path !== '/api/live-action') throw fail('Not found', 404);
      const auth = { ...body, role: host ? 'moderator' : 'participant' };
      if (!authenticated(this.run, auth)) throw fail('Forbidden', 403);
      const id = String(body.commandId || ''); if (id.length > 160) throw fail('Invalid command');
      // Receipts outlive rounds and bind retries to the original actor and exact request.
      const fingerprint = createHash('sha256').update((host ? 'host:' : 'player:') + JSON.stringify(Object.keys(body).sort().filter(k => !['secret','hostKey'].includes(k)).map(k => [k, body[k]]))).digest('hex');
      const receipt = id ? this.sql.exec('SELECT * FROM receipts WHERE id=?', id).toArray()[0] : null;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw fail('Command ID already used', 409);
        return json({ result: { ...JSON.parse(receipt.result), duplicate: true }, state: this.state(auth, url.origin) });
      }
      if (!host && !['heartbeat', 'ready'].includes(body.action)) assertAttempt(candidate, body);
      let result, media = null;
      if (!host && ['heartbeat', 'ready'].includes(body.action)) {
        if (body.action === 'ready') { assertAttempt(candidate, body); if (candidate.node.kind !== 'fill-game') throw fail('Not a Fill round'); candidate.participants[body.participantId].readyAttempt = candidate.roundAttemptId; }
        candidate.participants[body.participantId].lastSeen = new Date().toISOString(); result = { ok: true };
      } else {
        if (!host && body.imageDataUrl) {
          if (body.action !== 'submit' || body.imageDataUrl.length > 450000 || !/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(body.imageDataUrl)) throw fail('Image too large or invalid');
          body.mediaId = randomUUID(); body.kind = 'photo'; media = { id: body.mediaId, data: body.imageDataUrl };
        } else if (!host) { delete body.mediaId; }
        result = host ? applyControl(candidate, body.action, body) : applyParticipantAction(candidate, body.participantId, body.action, body);
      }
      this.persist(candidate, () => {
        if (id) this.sql.exec('INSERT INTO receipts VALUES (?, ?, ?)', id, fingerprint, JSON.stringify(result));
        if (media) this.sql.exec('INSERT INTO media VALUES (?, ?)', media.id, media.data);
      });
      const state = ['heartbeat', 'ready'].includes(body.action) ? undefined : this.state(auth, url.origin);
      await this.schedule(body.action !== 'heartbeat'); return json({ result, state });
    } catch (error) {
      return json({ error: error.statusCode ? error.message : 'Live service temporarily unavailable', code: error.code, eligibleCount: error.eligibleCount }, error.statusCode || 503);
    }
  }
  async webSocketMessage(ws, raw) {
    try {
      if (typeof raw !== 'string' || raw.length > 8192) throw fail('Invalid message');
      this.checkRun(); const a = ws.deserializeAttachment(); const message = JSON.parse(raw);
      if (a.auth) {
        if (message.type !== 'clock' || !Number.isFinite(message.sentAt)) throw fail('Already subscribed');
        if (Date.now() - (a.lastClock || 0) < 1000) return;
        ws.serializeAttachment({ ...a, at: Date.now(), lastClock: Date.now() });
        ws.send(JSON.stringify({ type: 'clock', sentAt: message.sentAt, now: Date.now() })); return;
      }
      if (message.code !== this.run.code || !authenticated(this.run, message)) throw fail('Forbidden', 403);
      const state = this.state(message, a.origin);
      ws.serializeAttachment({ ...a, auth: message, at: Date.now(), rev: state.viewToken, contentKey: this.contentKey() });
      ws.send(JSON.stringify({ changed: true, state })); await this.schedule(true);
    } catch { ws.close(1008, 'Session unavailable'); }
  }
  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    if (this.run && a?.auth?.role === 'participant') {
      this.presence(); const p = this.run.participants[a.auth.participantId];
      const at = Math.max(a.at, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0);
      if (p) { const candidate = cloneState(this.run); candidate.participants[p.id].lastSeen = new Date(Math.max(at, Date.parse(p.lastSeen))).toISOString(); this.persist(candidate); }
    }
    ws.close(code === 1005 ? 1000 : code); await this.schedule(true);
  }
  async webSocketError(ws) { ws.close(1011, 'Reconnect'); }
}
