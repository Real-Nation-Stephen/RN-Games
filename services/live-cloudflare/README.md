# Cloudflare live rooms

Optional backend for Studio flows with `foundation.liveConnection = "dedicated"`.
The website, editor, assets, content, QR links and moderator UI remain in RN Game
Studio. Only live-room commands, state and WebSockets use this Worker. Standard
flows keep their existing backend. Existing runs keep their original backend
until an operator explicitly starts a new run.

## Deployment

Preview service: `https://rn-games-live-preview.rngames-monorepo.workers.dev`.
The Wrangler configuration pins the Real Nation account and permits only the
Studio deploy-preview origin. Production rollout requires separate validation.

Use a Cloudflare Workers **Free** account. Do not enable a paid subscription.

1. `npx wrangler login --scopes account:read user:read workers_scripts:write`
2. Review `wrangler.jsonc`: preview service name, SQLite Durable Object migration,
   and exact allowed Studio origins. Do not add wildcard origins.
3. Generate a random secret of at least 32 bytes. Store it using
   `npx wrangler secret put DEDICATED_LIVE_SECRET --config services/live-cloudflare/wrangler.jsonc`.
4. `npm run deploy:live:cloudflare`
5. Set `DEDICATED_LIVE_URL` to the deployed HTTPS origin and
   `DEDICATED_LIVE_SECRET` to the same secret in Netlify's **deploy-preview**
   Functions environment. Redeploy the preview.
6. Run hosted rehearsal before adding production's origin and Netlify settings.
   Use a disposable test room; do not reset the event's active room to load-test it.

The shared secret is for signed server-to-server provisioning. It must never
appear in browser bundles, source control, QR links or reports. Phones use their
own participant secret. Moderator keys remain private.

## Verification

- `npm run test:live:cloudflare`: actual local Worker runtime; 100 concurrent HTTP
  participants and WebSockets, poll, 3–2–1 race, 1,200 answers, exact scores,
  retry receipts, stale input, timed reveal, privacy, photo permissions,
  reconnect and persisted state after a process restart.
- `LIVE_N=150 CF_IDLE_TEST=1 npm run test:live:cloudflare`: 150 participants and
  1,800 answers, plus 70 seconds without HTTP heartbeats. Confirms healthy idle
  sockets keep participants connected without writing room state.
- Hosted: supply `CF_LIVE_TEST_URL`, `CF_LIVE_TEST_SECRET` and optionally
  `CF_LIVE_TEST_ORIGIN` in the process environment. The test provisions a unique
  `TEST-…` room, expires it in one hour, and never touches an event active pointer.
  `LIVE_REPORT_PATH` saves non-secret timings. Hosted mode does not simulate a
  process restart; the local test covers persisted recovery.
- Regression: `npm run test:live`, `npm run test:live:race`,
  `npm run test:live:connection`, `npm run build`.

Do not treat local timings as hosted/event Wi-Fi measurements. Rehearse the
published UI on real phones, including a locked/unlocked phone and a Wi-Fi
reconnect, before event sign-off.

## Free-plan capacity

Cloudflare currently documents 100,000 Worker requests/day, 100,000 Durable
Object requests/day, 13,000 GB-s/day, 5 million SQLite rows read/day, 100,000 rows
written/day and 5 GB total storage on Free. Incoming WebSocket messages have a
20:1 request ratio for Durable Objects; outgoing messages are not request-billed.
Account-wide quotas are shared. Exhausting a free quota can interrupt service;
this is a sizing limit, not a paid overage or availability guarantee.

For **one room, 100 participants, four hours**, healthy sockets send roughly
96,000 automatic keepalives and 48,000 clock messages (about 7,200 equivalent DO
requests), plus joins, commands, reconnects and occasional room alarms. An
always-awake 128 MB room for four hours is approximately 1,843 GB-s. These are
estimates, not measured account usage. Alarms coalesce updates and run at real
game deadlines; there is no one-second write loop. A normal command writes the
room row and its indexed receipt (approximately three SQL row writes), while
healthy socket presence does not write to SQL. Review Cloudflare usage after
hosted rehearsal, leaving headroom for other rooms and retries.

If all 100 phones fall back to HTTP for hours, repeated reads/heartbeats can
consume the free daily allowance. The moderator's connection indicator exposes
reconnection, but it cannot establish that every phone has a healthy socket.
Check representative phones and connected/ready counts; don't run a race while
connections are unstable. No automatic switch back to Netlify happens mid-run.

References:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/

## State and recovery

One SQLite-backed Durable Object serializes each room's mutations. Scoring uses
Studio's shared engine. State and actor-bound command receipts commit together;
replaying an acknowledged command cannot double-score after another answer,
round change or process restart. Immutable content is stored separately from
mutable scores. Public and phone projections never expose moderator keys or
unrevealed quiz answers. Pinboard photos remain private until approved.

WebSockets use the hibernation API and automatic ping/pong responses. A missed
connection reconnects, with HTTP fallback to the same service. Local clocks use
server timestamps. Fill waits for phones to acknowledge preloaded content before
starting its shared countdown. Runs retain the existing 12-hour expiry; expired
Cloudflare rooms clear their ephemeral participants, receipts and photos. Start
a fresh run before the event, not the night before. Cloudflare is not an archive
of event responses.
