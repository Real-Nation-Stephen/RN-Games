# RN Game Studio — Platform roadmap (Waves 1–6)

**Last updated:** July 2026  
**Status:** Locked — Wave 1 shipped (Jul 2026); Wave 2 in progress (Jul 2026)

Historical phases A–E: [PLANNING.md](./PLANNING.md).  
Schema: [EXPERIENCE_SCHEMA.md](./EXPERIENCE_SCHEMA.md) · `packages/shared/src/experience.ts`

**Direction:** Modular digital experience platform — reusable **components** assembled into **Experiences** with shared session, unified tracking, and a node-based Studio editor. **Experiences are the sellable unit**; standalone components remain first-class.

**Build context:** Solo development + AI assistance. Staging environment separate from production. Netlify during development; production domain later.

---

## Locked decisions (summary)

| Area | Decision |
|------|----------|
| **URLs** | Experiences: `/x/{slug}` · Components: existing standalone URLs (both first-class) |
| **Embeds** | Component embeds only — not full experiences |
| **Session** | Anonymous by default; resume on refresh; identity via gates/forms |
| **Branding** | Per component — experiences hold lightweight metadata only |
| **Publishing** | Autosave drafts · explicit Publish · draft preview links |
| **Flow editor** | Ordered list = Wave 1 stepping stone only → React Flow (Wave 3), then remove list |
| **Logic** | One configurable **Logic** node (not separate router/aggregator types) |
| **Module outputs** | Type-scoped keys (`catch.score`); node-scoped when same type appears twice |
| **In-flow UI** | **Experience Overrides** on component end screens — no duplicate flow end screens |
| **Completion** | Generic **Component Completion Behaviour** (auto-continue, Continue, replay, etc.) |
| **Quiz in flows** | Kiosk / single-player only — Play-Along Quiz is separate product |
| **Legacy linking** | Keep `linkedGameId` / `linkedLeaderboardSlug` in API; hide in UI over time |
| **Wave 2 priority** | Landing → Form → Certificate → Redemption |
| **Analytics** | Wire `track()` Wave 1; CTA ingest Wave 2; full dashboards Wave 6 |
| **Analytics buckets** | Campaign · Experience · Component · User Analytics |
| **Reporting** | Toggle per component and per experience (experience aggregates journeys) |
| **Leagues** | Single-experience only; manual + automatic stage transitions |
| **Console** | Parked (not cancelled) |
| **Quiz redesign** | Complete before deep Experience integration |
| **Multimedia flip cards** | Evolution of flip-cards, not new module type |
| **Open** | All locked — soft limit ~150–250 nodes; A/B split in Wave 4 |

---

## Strategic shift

| Before | After |
|--------|-------|
| Games are the product | **Experiences** are the product; games are components |
| Ad-hoc links (catch → leaderboard slug) | **Flow graph** defines order and branching |
| Per-page analytics | **Session-scoped** events + experience aggregation |
| Home lists every module | **Recent experiences** + 3 recent per type + library pages |
| Experience overrides branding | **Component owns branding** |

---

## Architecture layers

```
┌──────────────────────────────────────────────────────────────┐
│  Studio                                                       │
│  Component editors (existing) │ Experience flow editor (new)  │
│  Library / search / codes     │ Autosave · Publish · QR preview│
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  API (storage abstracted — SQL migration path)                │
│  /api/wheels · /api/experiences · /api/experience-session     │
│  /api/track (Wave 2+ CTA events, Wave 6 full ingest)          │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│  Player                                                       │
│  Standalone components │ Experience shell (/x/:slug)          │
│  Lazy-loaded bundles   │ Retry → fallback page on error      │
└──────────────────────────────────────────────────────────────┘
```

---

## Module library (target taxonomy)

Registry: `packages/shared/src/module-registry.ts`. Palette groups (Wave 3): **Intro/Pages · Games · Forms · Consent · Rewards · Results · Logic · Leaderboards**.

### Wave 2 build order (locked)

1. **Landing page** — foundation for all page-based modules; auto-Continue in experiences
2. **Form** — Google Forms–class field types + flexible validation
3. **Certificate** — backgrounds, merge fields, adjustable placement
4. **Redemption** — simple v1; schema allows tiers/inventory later
5. **Consent** — pin board logic, landing-page UI style
6. **Email signup** — exportable list; CRM later

### Shipped components (flow integration Wave 1 / Wave 5)

All shipped types should run inside experiences **as early as Wave 1 allows** — not limited to two types.

| Component | Standalone | In experience |
|-----------|------------|---------------|
| Spinning wheel, scratcher, flip-cards | ✅ | Wave 1+ player |
| Quiz (kiosk/single-player) | ✅ | After quiz redesign |
| Pin board | ✅ | Wave 5 — natural slot, no over-engineering |
| Catch, runner | ✅ | Wave 1+ |
| Leaderboard | ✅ | Wave 5 — overrides for projector / rank / auto-continue |

---

## Wave 1 — Platform spine

**Goal:** Shared session + linear chaining; validate multi-component flows; Studio library retrofit.

### Deliverables

1. **Module registry** — shipped + planned types and outcome ports (`module-registry.ts`)
2. **Experience record** — separate from `wheel:{id}`; implementer chooses blob layout; document in INFRASTRUCTURE
3. **Session API** — abstract storage layer; resume after refresh; anonymous `participantId`
4. **Experience player** — `/x/:slug`; lazy-load components; retry then fallback page
5. **All practical shipped components** in flow player (not artificially limited to two types)
6. **`track()`** — `campaignId` + `sessionId` on flow-mode components from day one
7. **Studio home** — recent experiences top; 3 recent per component type + View all → `/admin/library/{type}`
8. **projectCode + designCode** — optional on index + editors; backfill empty; search filter
9. **Draft / publish** — draft preview links; publish gate
10. **Linear step editor** — ordered list only (removed once Wave 3 canvas ships)
11. **Archive** — archive components; flag broken refs in experiences
12. **Rate limiting** — public session endpoints

### Success criteria

- Chain multiple existing components in one session with persistent `sessionId` on `track()`
- Home usable at scale; library pages per type
- Draft experience previewable without affecting published version

### Out of scope (Wave 1)

- Visual node editor (Wave 3)
- Branching (Wave 4)
- Facilitator / Play-Along quiz flows
- Full experience embeds

---

## Wave 2 — Page components + early analytics

**Goal:** Landing-led page family; certificates; begin event ingest.

### Deliverables

1. **Landing page module** — hero, copy, breakpoint backgrounds, CTAs; inherited button styling; auto-Continue in experience mode
2. **Form module** — text, email, phone, dropdown, multiple choice, checkbox, date, postcode; required/optional; custom rules (e.g. college email)
3. **Certificate module** — custom background, dimensions, fonts, merge fields, placement
4. **Redemption v1** — display + instructions + optional form; extensible schema
5. **Consent module** — pin board consent engine, landing-page UI
6. **Email signup** — marketing fields → exportable list
7. **`POST /api/track`** (minimal) — store raw events; `experience.cta_click` and step events
8. **Designer docs** — Cursor first-pass → Stephen refines

### Success criteria

- Landing → Form → Certificate flow without code
- CTA clicks recorded with session + experience ids

### Gate

Prepare concise **business/legal doc** (GDPR, retention, PII) before production client use — parallel to build.

---

## Wave 3 — Flow editor MVP

**Goal:** React Flow canvas replaces list editor; intuitive wiring for sales and design.

### Deliverables

1. **React Flow editor** — drag from palette; snap connectors; zoom/pan
2. **Remove ordered-list editor** once canvas is stable (no permanent dual mode)
3. **Palette categories** — Intro/Pages, Games, Forms, Consent, Rewards, Results, Logic, Leaderboards
4. **Single output** on standard component nodes; multi-output on Logic nodes only
5. **Graph validation** — entry, orphans, broken refs, missing publish
6. **Preview** — new tab + QR for mobile (not iframe-only)
7. **Autosave** drafts; **Publish** explicit
8. **Logic node (stub)** — placeholder for Wave 4 rules; linear passthrough OK in Wave 3

### Not in Wave 3

- Template cloning (add later if needed)
- Sales PDF/PNG export pack
- Leaderboard migration tooling (low priority; manual graph wiring OK)

### Success criteria

- Designer wires 5-step linear flow in &lt; 15 minutes on canvas
- Published `/x/:slug` works on mobile via QR preview

---

## Wave 4 — Conditional branching

**Goal:** Giveaways, learning paths, time-based routing, merge paths.

### Deliverables

1. **Logic node (full)** — one configurable node: rules on session outcomes, date/time, default/fallback **required**
2. **Wheel routing** — use existing outputs (segment, prize tier, win/lose) — no wheel changes
3. **Score rules** — fixed thresholds, designer ranges, high-score detection; percentiles later
4. **Join node** — branches merge back together
5. **Time routing** — before / during / after event
6. **Preview simulation** — force outcomes for luck-based components (wheel, scratcher, etc.)
7. **Loops / retries** — via Logic nodes; same session

### Deferred until quiz kiosk architecture locked

- Quiz score / per-question branching (W4-4)

7. **A/B split** — random % between two targets (Wave 4)

### Open

- *(none)*

### Soft limit

- ~150–250 nodes per experience — performance guideline only, no hard UI cap

### Success criteria

- Wheel → win vs consolation paths live and preview-testable
- Catch score threshold → two different modules

---

## Wave 5 — Components as flow citizens

**Goal:** Standard outcomes, Experience Overrides, legacy link deprecation in UI.

### Deliverables

1. **Experience Overrides** per node — end-screen text, CTA labels, button visibility, destinations; inherit standalone layout
2. **Component Completion Behaviour** — experience configures auto-continue vs Continue vs replay per step
3. **Namespaced outcomes** — `type.key`; `nodes.{nodeId}.key` when duplicate types in one flow
4. **Experience-level summary** — aggregate scores alongside per-component high scores
5. **Scratcher / flip-cards outcomes** — prize tier, revealed prize, match count for Logic consumption
6. **Reporting toggles** — component + experience (experience aggregates)
7. **Hide legacy link fields** in editors; API backward compat retained
8. **Pin board + leaderboard** — slot as normal components with overrides

### Out of scope

- Play-Along Quiz in experience builder (separate product)

### Success criteria

- Full sampling journey on canvas with overrides and branching
- No new features depend on slug-based leaderboard linking in UI

---

## Wave 6 — Competition + reporting

**Goal:** Dashboards, leagues, exports, webhooks.

### Deliverables

1. **Full tracking ingest** — raw events stored; aggregates derived
2. **Studio dashboards** — Campaign / Experience / Component / User analytics; context-aware widgets; relabelling for clients
3. **Public dashboards** — later (Studio first)
4. **Google Sheets** — one-way export retained
5. **League module** — single-experience; manual + automatic stage transitions
6. **Export** — CSV / Excel / Sheets priority over PDF
7. **Webhook** on session complete; pull API later
8. **Business/legal sign-off** completed before production analytics at scale

### Gates

- Legal doc approved (W6-1)
- Storage abstraction proven for SQL migration if needed

---

## Studio navigation (target)

| Nav group | Contents |
|-----------|----------|
| **Experiences** | List + flow editor |
| **Intro & pages** | Landing, consent, transition |
| **Forms & data** | Form, email signup, pin board |
| **Digital experiences** | Wheel, scratcher, flip-cards |
| **Games** | Catch, runner |
| **Competition** | Leaderboard, leagues (Wave 6) |
| **Outcomes** | Certificate, redemption, results |
| **Analytics** | Dashboards, exports |

**Home:** recent experiences → grouped component sections (3 + View all).

**Search:** title, client, project code, design code, slug.

---

## Parallel tracks (not wave-blockers)

| Track | Timing |
|-------|--------|
| **Quiz UI redesign** | Before deep quiz-in-experience work |
| **Kiosk / mini quiz** | Before quiz branching (Wave 4+) |
| **Console + cartridge** | Parked |
| **Multimedia flip cards** | Extend flip-cards component |
| **Flow templates** | After editor stable; not Wave 3 priority |
| **Localization** | Separate experiences per language for now |
| **Experience step progress bar** | Toggleable shell UI: connected circles + fill line per step; brandable colours/fonts (future) |

---

## Relationship to legacy phases

| Legacy | Wave mapping |
|--------|----------------|
| Phase A–E | ✅ Complete — component library |
| Phase F (console) | Parked |
| Phase G (tracking) | Wave 2 (minimal ingest) + Wave 6 (dashboards) |
| Phase H (landing) | Wave 2 landing module |

---

## Next step

**Wave 2:** Landing page, form, certificate modules + minimal `/api/track` ingest.
