# Dedicated live connection

The Studio and player pages stay on Netlify. A flow can choose **Standard** (default) or **Dedicated live service** in its existing Foundation settings. The choice applies to a **new run**. Reopening an active run preserves its connection, participants and scores even if the editor setting changes.

Dedicated runs reuse the platform's snapshot, game engine, SQL scoring and role projections. The service handles joins, commands, answers, presence, media and WebSocket updates directly. Existing standard room codes remain on their existing path, without extra routing lookups. Dedicated room codes start with `L` and use seven characters.

## Deploy

Use a persistent Node 22 service with WebSocket support and PostgreSQL, in the same region. Railway is one suitable option. Build from the repository root using `services/live/Dockerfile`. Set a health check at `/health`. Keep one replica initially; rooms persist in SQL and connected rooms refresh from SQL every second. Do not enable sleep-to-zero for the event. Use a separate database for preview and production.

Service environment:

- `DATABASE_URL`: its PostgreSQL connection string (keep certificate verification enabled for public connections).
- `DEDICATED_LIVE_SECRET`: a random secret of at least 32 characters, shared with Netlify Functions only.
- `PUBLIC_LIVE_URL`: the HTTPS origin of this service, with no trailing slash or path.
- `LIVE_ALLOWED_ORIGINS`: exact comma-separated player/Studio origins, e.g. `https://deploy-preview-1--rn-games.netlify.app`. Add the production origin only when enabling production.
- `PORT`: set by the host; defaults to 8080.

The container runs additive schema migrations before starting. It refuses to start without PostgreSQL or the required tables. It does not use Netlify Blobs for live state or media.

Netlify **Functions-scoped** environment, initially deploy-preview only:

- `DEDICATED_LIVE_URL`: the same HTTPS service origin.
- `DEDICATED_LIVE_SECRET`: the shared secret above.

Do not set `LIVE_DEDICATED_SERVER` on Netlify. It is internal to the service. `LIVE_STATE_BACKEND` still controls the existing standard backend and is independent of this feature.

Choose Dedicated on a test flow, save, then start a new run. Existing event runs need not be reset or changed. If configuration or provisioning fails before activation, starting the new run fails clearly and the previous active run remains available. Changing back to Standard applies to the next run; it is not a mid-round failover switch.

## Connection and recovery

Studio authenticates run creation/resumption. Provisioning is server-to-server, signed with HMAC, timestamp and replay protection. Browsers receive a service origin, never the provisioning or database secret. Live requests retain existing participant/host credentials. WebSocket subscriptions authenticate in their first message, not in the URL.

Clients fetch one full state then subscribe to updates. Disconnected sockets reconnect with a fresh state; HTTP polling against the **same dedicated service** continues if sockets are unavailable. There is no silent fallback to Netlify or a different scoring state. Media follows the same approval checks and is served directly from the live service.

Netlify still serves the initial page/assets and one room-discovery request. This removes sustained live traffic from Netlify's gateway; it does not promise that initial page access can never be challenged. The event Wi-Fi and hosted service must still be rehearsed.

## Verification

```
npm run test:live
npm run test:live:race
node scripts/test-live-connection.mjs
DATABASE_URL=... node services/live/migrate.mjs
DATABASE_URL=... node scripts/test-live-dedicated.mjs
npm run build
```

The dedicated test provisions a disposable room, exercises 150 authenticated WebSocket participants, poll votes, preload acknowledgements, 12 rounds/1,800 answers, exact scores, reconnects, media permissions and role privacy. It writes only random test rooms and cleans them up. Optional `LIVE_REPORT_PATH` saves latency statistics. Starts are spread across 300ms to avoid the local macOS TCP accept burst limit. This local service test against a remote database is **not a hosted event performance sign-off**.

Before enabling the actual event: deploy near the database, repeat the full 150-user test against the service, test service restart/reconnect, then rehearse with actual phones on the venue network. Confirm timer/audio and moderator controls. Target fast answer acknowledgements and no lost/duplicated scores; investigate outliers before event use.

## Operations

Restarting the service preserves SQL state. Host/participant secrets remain usable. Keep the service URL and shared secret available for existing runs. A production secret rotation must update both services together. Avoid switching hosts during an active session.

Back up PostgreSQL before the event. Pinboard media contains attendee uploads: retain it according to the event policy and remove it with its run during scheduled cleanup. No automatic retention deletion is enabled by this change.
