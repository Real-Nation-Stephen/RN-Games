# RN Game Studio — Infrastructure

Live reference for how the platform is built, hosted, secured, and where the gaps are. Update this doc when a release changes behaviour, dependencies, or operational assumptions.

| | |
|---|---|
| **Product** | RN Game Studio (Real Nation Digital) |
| **Production** | [rn-games.netlify.app](https://rn-games.netlify.app) |
| **Repository** | [Real-Nation-Stephen/RN-Games](https://github.com/Real-Nation-Stephen/RN-Games) |
| **Last updated** | Jul 2026 |
| **Doc version** | 0.7.0 |

---

## Product context

RN Game Studio covers **tiers 1–3** of Real Nation’s digital product ladder: reskinnable, studio-built games, digital experiences, and planned structured learning **Courses**. **Tier 4** (custom HTML5, Unity, Godot, etc.) and **tier 5** (AR/VR, interactive media, AI) sit outside this codebase.

Current game types in Studio:

| `gameType` | Studio editor | Public play |
|------------|---------------|-------------|
| `spinning-wheel` (default) | `/admin/wheels/:id` | `/{slug}` |
| `scratcher` | `/admin/scratchers/:id` | `/play/scratcher.html?slug=` |
| `flip-cards` | `/admin/flip-cards/:id` | `/play/flip-cards.html?slug=` |
| `quiz` | `/admin/quizzes/:id` | `/quiz/:slug/host`, `/join`, `/present`, etc. |
| `pinboard` | `/admin/pinboards/:id` | `/pinboard/:slug`, `/submit`, `/moderate` |
| `leaderboard` | `/admin/leaderboards/:id` | `/leaderboard/:slug`, `/moderator` |
| `catch` | `/admin/catch/:id` | `/catch/:slug` · `/play/catch.html?slug=` |
| `runner` | `/admin/runner/:id` | `/runner/:slug` · `/play/runner.html?slug=` |
| `landing` | `/admin/landing/:id` | `/landing/:slug` |
| `form` | `/admin/forms/:id` | `/form/:slug` |
| `certificate` | `/admin/certificates/:id` | `/certificate/:slug` |
| `badge` | `/admin/badges/:id` | `/badge/:slug` |
| `consent` | `/admin/consent/:id` | `/consent/:slug` |
| `email-signup` | `/admin/email-signups/:id` | `/email-signup/:slug` |
| `redemption` | `/admin/redemptions/:id` | `/redemption/:slug` |
| `mini-quiz` | `/admin/mini-quizzes/:id` | `/mini-quiz/:slug` |

Arcade games (`catch`, `runner`) use the same blob + `/api/wheels` CRUD as other game types; public config is served via `GET /api/public-wheel?slug=` with type-specific stripping (`lib/catch.mjs`, `lib/runner.mjs`).

## Architecture overview

```
┌─────────────────────┐
│  Studio (admin SPA) │  /admin/
│  React + Vite       │
└──────────┬──────────┘
           │  Bearer JWT (Netlify Identity)
           ▼
┌─────────────────────┐     ┌──────────────────────────┐
│  Netlify Functions  │────▶│  Netlify Blobs           │
│  /api/*             │     │  store: rngames-platform │
└──────────┬──────────┘     └──────────────────────────┘
           │
           │  optional
           ▼
┌─────────────────────┐
│  Google Sheets API  │  spin reporting (wheels)
└─────────────────────┘

┌─────────────────────┐
│  Player bundle      │  /play/* + clean URLs via edge router
│  Vite multi-page    │
└──────────┬──────────┘
           │  no auth
           ▼
┌─────────────────────┐
│  public-wheel,      │
│  quiz-*, pinboard-* │
└─────────────────────┘
```

**Monorepo layout**

| Package | Path | Role |
|---------|------|------|
| `@rngames/admin` | `packages/admin` | Studio UI |
| `@rngames/player` | `packages/player` | Public surfaces, quiz host/join |
| `@rngames/shared` | `packages/shared` | Shared types and defaults |
| `@rngames/report` | `packages/report` | Branded spin report (`{slug}_Report`) |

**Build & deploy**

- Root command: `npm run build` — builds all workspaces, then `scripts/assemble-dist.mjs` copies outputs into `dist/`.
- `dist/admin/` — Studio SPA  
- `dist/play/` — player HTML + assets  
- `dist/report/` — report SPA  
- Push to `main` triggers Netlify production deploy.
- Functions live in `netlify/functions/` (esbuild bundler). Edge router: `netlify/edge-functions/router.mjs` on `/*`.

---

## Data storage

**Netlify Blobs** (`rngames-platform`) remain the store for configuration, sessions, and the resilient analytics buffer. **Netlify Database** (Postgres via `@netlify/database`) stores structured measurement events when `MEASUREMENT_DB_ENABLED` is set.

| Key / pattern | Contents |
|---------------|----------|
| `track-log:{YYYY-MM-DDTHH}` | Hourly canonical event buffer (max 5000 events/bucket); source for DB replay |
| `wheels-index` | Index of games: `id`, `slug`, `gameType`, `title`, `clientName`, `updatedAt`, `reportingEnabled`, `thumbnailUrl` |
| `wheel:{uuid}` | Full game configuration JSON |
| `file:{uuid}` | Uploaded binary (images, audio) |
| Quiz session keys | Live session: room code, host key, phase, answers, participants (via `lib/quiz-store.mjs`) |
| `pinboard-state:{wheelId}` | Guest submissions awaiting moderation |
| `experience:{uuid}` | Experience flow config (linear steps + graph) |
| `experiences-index` | Index of experiences |
| `experience-session:{sessionId}` | Per-participant journey state (resume on refresh) |
| `course:{uuid}` | Course config (sections, items, learning-link settings) |
| `courses-index` | Index of courses |
| `course-session:{sessionId}` | Learner course progress, `email`, `earnedBadges[]`, `earnedCertificates[]`, item outcomes |
| `course-email:{slug}:{email}` | Resume lookup index for learning-link emails |

**Netlify Database tables (measurement pilot):** `events`, `measurement_config`, `ingest_replay_runs`. Migrations live in `netlify/database/migrations/`. Apply locally with `netlify database migrations apply` only after confirming the correct site.

**Implications**

- Reads can be briefly inconsistent after writes (eventual consistency on Blobs).
- Fine for event tooling and moderate traffic; not suited to heavy analytics, complex joins, or strict audit requirements without a separate warehouse.
- No built-in backup/export UI — recovery depends on Netlify platform backups and manual exports.
- Game configs are JSON documents; schema is enforced loosely per `gameType` in functions and TypeScript types.

**Duplicate games:** `POST /api/wheels` with `sourceId` deep-clones an existing `wheel:{id}` blob and creates a new index entry with a fresh `id` and `slug`.

---

## API surface

Redirects in `netlify.toml` map `/api/*` → `/.netlify/functions/*`.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET/POST/PUT/DELETE /api/wheels` | Studio JWT | CRUD game configs + index |
| `GET /api/public-wheel?slug=` | Public | Player-facing config (stripped fields) |
| `POST /api/upload` | Studio JWT | Upload asset → blob + `/api/file?id=` URL |
| `GET /api/file?id=` | Public | Serve uploaded binary |
| `POST /api/log-spin` | Public | Append spin row (reporting wheels only) |
| `GET /api/report-data?slug=` | Public | Aggregate spin counts for report UI |
| `POST/GET /api/quiz-session` | Mixed | Create session / poll state |
| `POST /api/quiz-control` | Host key | Prev/next, timer, lobby lock |
| `POST /api/quiz-join` | Public | Player joins room |
| `POST /api/quiz-answer` | Public | Submit answer |
| `POST /api/quiz-bonus` | Public | Bonus steal flow |
| `GET/POST /api/pinboard-state` | Mixed | Board submissions + moderation |
| `GET/POST/PUT/DELETE /api/experiences` | Studio JWT | Experience CRUD + publish |
| `GET /api/public-experience?slug=` | Public | Published experience (draft via `previewToken`) |
| `POST/PATCH/GET /api/experience-session` | Public | Session create, resume, advance (rate-limited) |
| `GET/POST/PUT/DELETE /api/courses` | Studio JWT | Course CRUD + publish |
| `GET /api/public-course?slug=` | Public | Published course shell/config |
| `POST/PATCH/GET /api/course-session` | Public | Learner progress + resume |
| `POST /api/course-resume-email` | Public | Send learning link email (stores email on session) |
| `POST /api/track` | Public | Append canonical analytics events (Blob buffer + optional Netlify Database) |
| `POST /api/measurement-replay` | Studio / ops | Idempotent replay of Blob track-log events into Netlify Database |
| `GET /api/track-stats` | Studio JWT | Aggregate dashboards + `?format=csv` export |

Public wheel loader (`packages/player`) calls `/api/public-wheel` by slug. Studio calls `/api/wheels` with `Authorization: Bearer <Netlify Identity token>`.

---

## Authentication & authorization

### Studio (admin)

- **Netlify Identity** widget in admin (`netlify-identity-widget`).
- Protected functions use `requireAuth()` in `netlify/functions/lib/auth.mjs`: accepts JWT from `Authorization: Bearer` or Lambda `clientContext.user`.
- Unauthenticated requests return **401**.
- **Single-tenant model:** any authenticated Identity user can access the full Studio. There are no per-client roles, orgs, or game-level permissions yet.

### Public play

- No login required to play published games.
- Config is fetched by **slug** (guessable if slug is known). Slugs should be treated as unlisted URLs, not secrets.
- Planned Courses should follow the same lightweight model: no full account in v1, but learner progress is resumed through **learning link** emails (email stored on `course-session` for lookup).

### Quiz sessions

- Host receives a **room code** and **host key** at session creation.
- Control actions (`quiz-control`) require matching `hostKey`.
- Join uses room code only.

### Local / static preview

- Build with `VITE_DEV_AUTH=1` to skip Identity and use a fixed dev JWT (see `.env.example`). For UI preview only — not for production.

---

## Security measures (current)

| Area | Status |
|------|--------|
| Studio API behind Identity JWT | Yes |
| HTTPS (Netlify) | Yes |
| Upload size cap (~4 MB per file) | Yes |
| `X-Frame-Options: SAMEORIGIN` | Yes |
| `X-Content-Type-Options: nosniff` | Yes |
| CORS on APIs | `Access-Control-Allow-Origin: *` on most endpoints |
| CSP / strict sandbox for user HTML | No (not applicable yet; future cartridge uploads would need this) |
| Rate limiting / abuse protection | Not implemented |
| Audit logging | Not implemented |
| Per-client data isolation | Not implemented |
| Formal DPIA / privacy doc in repo | Not included |

Uploaded assets are served from the same origin (`/api/file`). Anyone with a file URL can fetch it if they know the `id`.

---

## GDPR & consent

**Pin board** is the only game type with a structured consent block today:

- `permissions.enabled`, headline, intro copy, checkbox items, GDPR link + label, accept button label.
- Guest submit flow (`/pinboard/:slug/submit`) blocks submission until required items are accepted.

Other game types do **not** share a universal consent or data-collection module. Reporting is opt-in per game via `reportingEnabled`.

A planned direction is **modular** consent / collection / tracking packs attachable to any game type (not built yet).

---

## Tracking & reporting

### Event stub (Phases B–F)

Player surfaces call `track()` from `@rngames/shared/track` at key moments (wheel spin, scratcher reveal, flip-card open, quiz answer, pin board submit). The function is a **no-op** until Phase G ingest is built.

Event shape:

```ts
{ type, gameId, moduleId?, campaignId?, sessionId?, timestamp, payload? }
```

Example types: `wheel.spin`, `scratcher.reveal`, `flip_cards.open`, `quiz.answer`, `pinboard.submit`, `leaderboard.view`, `leaderboard.submit`, `catch.round_start`, `catch.round_end`, `runner.round_start`, `runner.round_end`.

### Spinning wheels (most complete)

1. Editor toggles **Reporting** on a wheel (`reportingEnabled`). First enable can set `reportingLockedAt` and provision a **Google Sheet tab** per wheel (when `GOOGLE_SHEET_ID` and service account env vars are set).
2. Player calls `POST /api/log-spin` on each spin.
3. Report page: `https://{site}/{slug}_Report` (edge router → `/report/` SPA).
4. Report data: `GET /api/report-data?slug=` reads rows from the wheel’s sheet tab (or legacy single tab).

### Quiz

- Answers and session state live in **quiz session blobs**.
- No unified export, branded report UI, or Sheets integration for quiz outcomes yet.

### Pin board

- Submissions stored in `pinboard-state:{wheelId}`.
- Moderation UI on `/pinboard/:slug/moderate`.
- No central analytics dashboard.

### Scratcher / flip-cards / catch / runner

- `reportingEnabled` toggle exists in Studio editors for all listed types.
- Mature **Google Sheets** reporting pipeline today is **spinning wheels only** (`log-spin`, `{slug}_Report`).
- Catch and runner emit `track()` round lifecycle events; no dedicated report SPA or Sheets tab provisioning yet.

### Environment variables (reporting)

See `.env.example`:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_SHEET_ID` | Target spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account for Sheets API |
| `GOOGLE_PRIVATE_KEY` | PEM key (newlines as `\n` in env) |
| `GOOGLE_SHEET_TAB` | Optional legacy single-tab range (default `Spins!A:G`) |

Spreadsheet must be **shared with the service account email** (Editor).

### Build-time (admin)

| Variable | Purpose |
|----------|---------|
| `VITE_PUBLIC_SITE_URL` | Copy-link buttons in editors (production canonical URL) |
| `VITE_DEV_AUTH` | `1` = skip Identity for static admin preview |

---

## Public URL routing

Edge function `router.mjs` handles clean URLs before static fallthrough:

| URL pattern | Serves |
|-------------|--------|
| `/` | Redirect → `/admin/` |
| `/{slug}` (single segment, not reserved) | `/play/index.html` (wheel player; slug from path) |
| `/{slug}_Report` | `/report/index.html` |
| `/pinboard/:slug` | Board |
| `/pinboard/:slug/submit` | Guest submit |
| `/pinboard/:slug/moderate` | Moderation |
| `/leaderboard/:slug` | Leaderboard live board |
| `/leaderboard/:slug/moderator` | Leaderboard moderator (PIN) |
| `/x/:slug` | Experience player (multi-step journey) |
| `/course/:slug` | Planned Course shell / curriculum home |
| `/catch/:slug` | Catch arcade player |
| `/runner/:slug` | Runner arcade player |
| `/quiz/:slug/host` | Quiz host |
| `/quiz/:slug/present` | Presenter |
| `/quiz/:slug/present/:code` | Session presenter |
| `/quiz/:slug/join/:code` | Player join |
| `/quiz/:slug/kiosk` | Kiosk mode |
| `/quiz/:slug/live/:code/leaderboard` | Leaderboard |
| `/admin/*`, `/play/*`, `/api/*` | Passed through to static / functions |

Reserved path segments (won’t map to wheel slug): `admin`, `api`, `play`, `report`, `quiz`, `scratcher`, `flip-cards`, `pinboard`, `leaderboard`, `catch`, `runner`, etc.

---

## Accessibility & known limitations

**Accessibility**

- No systematic WCAG audit across game types.
- Wheel experience assumes **landscape** layout; orientation gate on narrow viewports.
- Quiz and pin board have more mobile coverage; behaviour varies by surface.
- Studio admin is usable on desktop; not optimised for mobile editing.

**Operational**

- Netlify Blobs eventual consistency can cause brief 404s right after session creation or writes (code includes retries in places).
- Edge router occasionally returns platform **500** on internal subrequests; usually transient. If clean URL `/{slug}` fails with a Netlify “Error - Request ID” page, try the same slug via `/play/index.html` (path or `?slug=` query) as a diagnostic fallback.
- `public-wheel` returns JSON `{ error }` on server failures (May 2026); client should still handle non-JSON 500s from the edge layer.
- Catch/runner **live preview** (`?preview=1`) applies config in-place without remounting the player iframe — avoids stealing focus from Studio number inputs (Jul 2026).

**Scale & product**

- Single Studio account model (no multi-brand tenancy in one deploy).
- No offline mode.
- Assets served from same-origin `/api/file`, not a global CDN.
- Analytics/reporting not unified across game types.
- No versioning UI for game configs (save overwrites blob).
- Experience step/module selection is still using simple dropdown-based Studio UX in places; this will not scale to large libraries and is scheduled for search-first categorised pickers.

---

## Local development

```bash
npm install
npm run build          # full production assemble
npm run dev:admin      # Studio on :5173 (proxies /api to Netlify dev)
npm run dev:player     # Player on :5173
```

For full API + Blobs locally, use **Netlify CLI**:

```bash
npx netlify-cli dev
```

Without Netlify dev, admin API calls from Vite proxy expect port **8888**.

---

## Planned infrastructure (not implemented)

High-level intent; **locked decisions and phase order** live in [PLANNING.md](./PLANNING.md) (updated as we build).

| Area | Status (Jul 2026) |
|------|-------------------|
| Rename → **RN Game Studio** | ✅ Phase A |
| Shared editor components (`HexField`, studio shell) | ✅ Phase B |
| Standalone **leaderboard module** | ✅ Phase C |
| **Catch** + **Runner** arcade games | ✅ Phases D + E (ongoing polish) |
| **Designer instructions** (`docs/DESIGNER_INSTRUCTIONS.md`) | ✅ Started (Catch); Runner TBD |
| **Console + cartridge** | ⏸ Phase F — under roadmap re-evaluation |
| **Tracking ingest + dashboards** | Wave 6 pilot — `POST /api/track`, `GET /api/track-stats`, Studio `/admin/analytics` |
| **Campaign landing pages** | Wave 2 shipped |
| **Experience platform** (session, `/x/:slug`, flow editor) | Wave 3 — React Flow canvas (`@xyflow/react`); logic stub passthrough |
| **Landing / form / certificate / badge / mini-quiz** | Wave 2 + pilot modules shipped |
| **Wave 2 page-module polish** | Shipped for pilot (backgrounds, logos, submit states, certificate download) |
| **Courses** | Wave 2.5 shipped — learning link, badge grid, curriculum editor |
| **Full analytics dashboards** | Wave 6 pilot — Studio dashboards + CSV; League deferred |

---

## Version changelog

| Doc / platform | Date | Notes |
|----------------|------|-------|
| 0.7.0 | Jul 2026 | **Pilot rollout:** learning link UX + GDPR acknowledgement; mini-quiz + badge modules; certificate PNG/PDF download; React Flow experience editor; experience node overrides; `GET /api/track-stats` + Studio analytics page; pilot-first roadmap reprioritisation. |
| 0.6.1 | Jul 2026 | Roadmap/infrastructure update: scheduled **Courses** as Wave 2.5, documented planned course storage/API/runtime, email-linked resume direction, Wave 2 page-module polish track, and the need for search-first categorised pickers in Studio. |
| 0.6.0 | Jul 2026 | **Wave 1:** Experience CRUD (`/api/experiences`), session API, public experience player at `/x/:slug`, linear flow editor in Studio, home/library retrofit, project/design codes on index, catch/runner flow mode + step complete bridge. |
| 0.5.1 | Jul 2026 | Roadmap locked from completed questionnaire: dual URL model, component branding, unified Logic node, Experience Overrides, Wave 2 priority (landing/form/certificate), analytics buckets, early track ingest. |
| 0.5.0 | Jul 2026 | Platform direction docs: experience/session schema, Waves 1–6 roadmap, planning questionnaire. |
| 0.4.0 | Jul 2026 | Phases C–E complete: leaderboard module; catch + runner games (editors, players, clean URLs, linked LB). Runner polish: multi-character, parallax depth tiers, controller menus, fullscreen, PNG upload alpha fix, collapsible editors. Catch editor collapsibles. `docs/DESIGNER_INSTRUCTIONS.md` added. Phase F (console) under re-evaluation. |
| 0.3.3 | Jun 2026 | Phase B: shared `track()` stub, `HexField` rollout, `leaderboard` reserved slug, validate.mjs slug list aligned with shared |
| 0.3 | May 2026 | Pin board guest submit toggles; game duplicate via `sourceId`; pin board thumbnail background fix; quiz host timer / `waiting` phase improvements |
| 0.3.2 | May 2026 | Phase A: RN Game Studio branding; `public-wheel` error handling; `syncSegmentArrays` hardening |
| 0.3.1 | May 2026 | Added [PLANNING.md](./PLANNING.md) with locked product decisions |
| 0.2 | May 2026 | Pin board studio editor, slug-from-path fix, moderator branding, guest assets |
| 0.1 | Earlier | Initial wheel + scratcher + quiz + flip-cards + pin board on Netlify Blobs |

---

## Maintenance

When shipping a meaningful change, update:

1. **Last updated** and **Doc version** at the top.
2. Relevant sections (API, storage, security, limitations).
3. A row in **Version changelog**.

Owners: Real Nation dev / Game Studio maintainers.
