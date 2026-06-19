# RN Game Studio — Infrastructure

Live reference for how the platform is built, hosted, secured, and where the gaps are. Update this doc when a release changes behaviour, dependencies, or operational assumptions.

| | |
|---|---|
| **Product** | RN Game Studio (Real Nation Digital) |
| **Production** | [rn-games.netlify.app](https://rn-games.netlify.app) |
| **Repository** | [Real-Nation-Stephen/RN-Games](https://github.com/Real-Nation-Stephen/RN-Games) |
| **Last updated** | May 2026 |
| **Doc version** | 0.3 |

---

## Product context

RN Game Studio covers **tiers 1–3** of Real Nation’s digital product ladder: reskinnable, studio-built games and digital experiences. **Tier 4** (custom HTML5, Unity, Godot, etc.) and **tier 5** (AR/VR, interactive media, AI) sit outside this codebase.

Current game types in Studio:

| `gameType` | Studio editor | Public play |
|------------|---------------|-------------|
| `spinning-wheel` (default) | `/admin/wheels/:id` | `/{slug}` |
| `scratcher` | `/admin/scratchers/:id` | `/play/scratcher.html?slug=` |
| `flip-cards` | `/admin/flip-cards/:id` | `/play/flip-cards.html?slug=` |
| `quiz` | `/admin/quizzes/:id` | `/quiz/:slug/host`, `/join`, `/present`, etc. |
| `pinboard` | `/admin/pinboards/:id` | `/pinboard/:slug`, `/submit`, `/moderate` |

---

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

There is **no SQL database**. All persistent platform data uses **Netlify Blobs** (store name: `rngames-platform`).

| Key / pattern | Contents |
|---------------|----------|
| `wheels-index` | Index of games: `id`, `slug`, `gameType`, `title`, `clientName`, `updatedAt`, `reportingEnabled`, `thumbnailUrl` |
| `wheel:{uuid}` | Full game configuration JSON |
| `file:{uuid}` | Uploaded binary (images, audio) |
| Quiz session keys | Live session: room code, host key, phase, answers, participants (via `lib/quiz-store.mjs`) |
| `pinboard-state:{wheelId}` | Guest submissions awaiting moderation |

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

### Scratcher / flip-cards

- `reportingEnabled` exists on records; end-to-end reporting pipeline is partial or placeholder compared to wheels.

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
| `/quiz/:slug/host` | Quiz host |
| `/quiz/:slug/present` | Presenter |
| `/quiz/:slug/present/:code` | Session presenter |
| `/quiz/:slug/join/:code` | Player join |
| `/quiz/:slug/kiosk` | Kiosk mode |
| `/quiz/:slug/live/:code/leaderboard` | Leaderboard |
| `/admin/*`, `/play/*`, `/api/*` | Passed through to static / functions |

Reserved path segments (won’t map to wheel slug): `admin`, `api`, `play`, `report`, `quiz`, `scratcher`, `flip-cards`, `pinboard`, etc.

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

**Scale & product**

- Single Studio account model (no multi-brand tenancy in one deploy).
- No offline mode.
- Assets served from same-origin `/api/file`, not a global CDN.
- Analytics/reporting not unified across game types.
- No versioning UI for game configs (save overwrites blob).

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

- **Modular data collection / GDPR / tracking** — broad ingest + configurable dashboards; Sheets as export, Blobs/SQL as source of truth
- **Leaderboard module** — `/leaderboard/:slug` + moderator PIN; linked or manual mode
- **New game types** — catch + dino runner POCs, then console + cartridge (fresh in monorepo)
- **Editor standardisation** — shared `ColorField` / asset components; preview stays at bottom
- **Campaign landing pages** — same Netlify site; tracked CTAs/QRs
- **Rename** — folder `rn-game-studio`, UI **RN Game Studio**; production URL unchanged for now

---

## Version changelog

| Doc / platform | Date | Notes |
|----------------|------|-------|
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
