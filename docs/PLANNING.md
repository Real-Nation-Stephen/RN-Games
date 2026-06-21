# RN Game Studio — Planning & locked decisions

Companion to [INFRASTRUCTURE.md](./INFRASTRUCTURE.md). Captures product decisions as we go; update when answers change.

**Last updated:** June 2026 (Runner game Phase E spec locked)

---

## Platform principles (save pain later)

Small decisions baked into early phases to avoid rework:

| Principle | Detail |
|-----------|--------|
| **Event stub** | From Phase B onward, shared `track(event)` in `@rngames/shared` with stable shape `{ type, gameId, moduleId?, timestamp, payload }` — no-op (dev console) until Phase G ingest |
| **Sheets** | **One-way export** only (platform → Sheets). Client deliverable = branded dashboard URL; Sheets = backup/export |
| **Slug uniqueness** | **Global** across module types — cannot claim a slug already in use (wheels, leaderboards, landings, etc.) |
| **Tracking Phase G** | Requires **management + head of research** sign-off on retention, buckets, and compliance before build — not improvised |
| **Cartridge spec doc** | Instructional MD for agents/designers (manifest, zip size, frame counts, min console version) — created with Phase F |

### Platform hygiene (Phase A/B)

Fix alongside rename / shared components — low cost, fewer demo failures:

- `public-wheel` — wrap handler in try/catch ✅ (Phase A)
- `syncSegmentArrays` — guard null `segmentOutcome` ✅ (Phase A)
- Edge router — document `/play/...` fallback when clean URLs 500; expand reserved paths as modules ship ✅ (`leaderboard` reserved, Phase B)
- Shared `track()` stub in `@rngames/shared` — no-op until Phase G; wired at player event sites ✅ (Phase B)
- `HexField` (hex + picker) rolled out to quiz, scratcher, flip-cards editors ✅ (Phase B; pin board was reference)

---

## Execution order

Build slices in this order; tracking/reporting architecture is a **separate phase** after arcade modules exist so we learn what each game actually emits.

| Phase | Work |
|-------|------|
| **A** | Rename: local folder `rn-game-studio` + user-facing copy → **RN Game Studio** |
| **B** | Shared editor components + **platform hygiene** (see above) |
| **C** | Leaderboard module (API + live + moderator) |
| **D** | Catch POC (isolated test → Studio) |
| **E** | Runner game POC (isolated test → Studio) |
| **F** | Console + cartridge (fresh in monorepo; Prowler as reference only) |
| **G** | Tracking ingest + dashboards (after D/E inform event shapes) |
| **H** | Campaign landing pages |

Capture tracking learnings in this doc and INFRASTRUCTURE.md during A–F.

---

## Rename & branding

| Item | Decision |
|------|----------|
| Local folder | `rn-game-studio` (renamed from `Spinning Wheel`, May 2026) |
| Product name (UI) | **RN Game Studio** |
| Production URL | Keep **rn-games.netlify.app** for now; new URL TBD after internal discussion |
| GitHub repo rename | Deferred |
| Technical IDs | No change yet (`spinning-wheel`, `/api/wheels`, blob keys) |

---

## Editor standardisation

| Item | Decision |
|------|----------|
| Color inputs | Shared **hex + picker only** (no RGB) |
| Approach | Shared components first; consistency is key |
| Quiz layout (Phase B) | Keep **list + detail panel** while rolling out shared inputs |
| Quiz (later) | **Major UI overhaul** planned — separate from Phase B component pass |
| **Kiosk quiz** | **Spin-off variant** — self-guided kiosk quizzes as their own product line, **not** bundled into play-along quiz (reduces complexity) |
| Live preview | Keep **preview at bottom** on all games (current pattern) — not a side column |
| Pin board | Reference for inputs + layout where other editors fit |
| **Studio editor shell** | See checklist below — game details card, bottom save bar, preview last |

### Studio editor consistency (all modules)

New editors should match the established shell unless there is a documented reason not to:

| Area | Convention |
|------|------------|
| **Game details** | `grid2`: Title, Client, Sub-URL (slug, lowercased on change). Reporting checkbox. Public URL(s) as `<code>`. Tab icon upload. “Powered by Real Nation” checkbox. |
| **Actions** | **Save**, **Save + thumbnail**, **Delete game** at the **bottom** of the page (not top). Preview card sits above them. |
| **Preview** | Live iframe at bottom section with Refresh + Open public links. |
| **Colours** | Shared `HexField` (hex + picker only). |
| **Powered by** | Public player: fixed bottom-right image (`powered-by-real-nation.png`), not text. |
| **Thumbnails** | `html2canvas` on preview `#app` → Save + thumbnail. |
| **Multi-panel layout** | Pin board / leaderboard: `repeat(auto-fit, minmax(280px, 1fr))` columns for branding surfaces. |

### Leaderboard linkable game types

Only game types in `LEADERBOARD_LINKABLE_GAME_TYPES` (`@rngames/shared`) appear in the Studio linker and may `POST` scores. **Not linkable:** spinning wheel, scratcher, flip cards, pin board, quiz (session LB built-in). **Linkable when shipped:** catch, runner. API enforces the same list.

---

## Leaderboard module

| Item | Decision |
|------|----------|
| URLs | Live: `/leaderboard/:moduleSlug` · Moderator: `/leaderboard/:moduleSlug/moderator` |
| PIN | **One PIN per module**, set by designer in Studio — **no daily rotation** (event partner responsible if PIN is mishandled; avoids RN becoming password courier between digital and events teams) |
| Modes | **Linked** (game hands off display name from upstream collection) or **Manual** (in-person / written scores; moderator maintains rows) |
| Ranking | **Shared rank** for tied scores; order by **timing** (earlier first within tie) |
| Manual entries | Rows added by moderator use **edit/create timestamp** for tie-break order (after linked-game submissions unless overridden in mod UI) |
| Moderator | Remove player, adjust score → **rank recalculates**; edits do not write back to source game |
| Live display | **≤15 entries → show all** · **16+ → show top 10** with on-screen indicator (e.g. “Top 10 of 23”) |
| Moderator pan | Facilitator can **activate a lower-rank pan** on the live board to scroll/reveal players below the cutoff |
| Refresh | Match **pin board** polling balance |
| Scope | **1:1** module ↔ game for now; “tournament board” multi-stage later |

**Fields:** rank, display name, score (+ internal id, timestamps for audit).

### High score vs Leaderboard module

These are **different mechanisms** — a game can use either, both, or neither.

| | **High score** (in-game) | **Leaderboard module** (Studio) |
|---|---|---|
| Scope | Inside a single game session/device | Standalone ranked board (`/leaderboard/:slug`) |
| Data | One best result + short tag (e.g. 3-letter name) | Many rows; shared rank + timing tie-break |
| Typical use | Arcade “best run” on the game over screen | Event projection, manual in-person scoring, linked game aggregation |
| Coexistence | Yes — e.g. catch shows local high score **and** POSTs to a linked leaderboard on submit | Linked mode accepts scores from one connected game (1:1 for now) |

**Quiz play-along** already has a session leaderboard (`/quiz/:slug/live/:code/leaderboard`) tied to quiz participants — that stays quiz-specific. The standalone module is for catch, runner, and other games plus manual event boards.

High score settings on game records (`highScore.enabled`, `nameMaxLength`) ship with arcade POCs (Phase D+). Linked submit uses `POST /api/leaderboard-state` with `sourceGameId`.

---

## Catch game (POC)

| Item | Decision |
|------|----------|
| Build path | Isolated test first → insert into Studio when refined |
| Orientation | **Responsive** (see note below) |
| Controls | Finger / cursor **drag**; gamepad later, not v1 |
| Session | **Timed round** (duration editable in Studio); most catches wins |
| Items | Good items add points; bad items **−points or −time**; Studio toggle for **positive-only** mode |
| Players | Single-player; competition via leaderboard |
| Submit | **End of round** → leaderboard |
| Mobile UX | Catcher **not pinned to bottom edge** — leave thumb clearance; catcher always visible above safe-area |

---

## Runner game (Phase E)

**Naming:** UI = **Runner game** · `gameType` = `runner` · public URL = `/runner/:slug` · editor = `/runner/:id`. Do not use “dino” in product copy or code identifiers.

| Item | Decision |
|------|----------|
| Build path | Same slice order as catch: shared types → API → player → editor → router → leaderboard link |
| User flow | Match catch: name (if linked LB) → intro → start → play → end → play again |
| Input | Tap / Space / gamepad **A** = jump only (no duck v1). **Start** = begin run · **B** = play again (same as catch) |
| Leaderboard | End-of-run submit; **designer picks** primary metric (points, time survived, distance, etc.) in editor |
| Intro / outro | Same pattern as catch (item explainer intro, branded end screen, optional link button) |

### Responsive layout (differs from catch)

| Breakpoint | Canvas | Viewport |
|------------|--------|----------|
| **Mobile** | Portrait logical canvas (1080×1920) | **Full screen** — scale to fill viewport |
| **Desktop** | Landscape logical canvas (1920×1080) | **Full screen** — use entire viewport (not a centred letterbox column) |
| **Tablet** | Landscape (same as desktop) | **Rotate to start** overlay if portrait — shown **after** name/details entry (not before signup/name) |

Game logic stays in logical coordinates per breakpoint; layout layer picks canvas + scale mode (`cover` / fill on runner vs catch’s contain column).

### HUD (three slots)

Designer assigns **left · centre · right** each to one of: **Timer** · **Health** · **Score** · **None**.

- **Timer** — optional module-wide toggle; when off, run is **endless** until health loss (see end conditions).
- **Health** — max **1–10**; display style **hearts** or **bar** (designer choice + colours).
- **Score** — points and/or derived stats per designer metric config.

### Health, timer & end conditions

Health and “lives” are the **same meter** — always called **health** in UI and editor.

| Condition | Result |
|-----------|--------|
| Timer enabled and reaches **0** | **Round end** → end screen (even if health remains) |
| Timer not expired and **health → 0** | **Game over** → respawn or end screen (see below) |
| Timer **off** and **health → 0** | **Game over** → respawn or end screen |

**Obstacles** (negative items) reduce health on hit — **not** instant death. Obstacles render **in front of** the player to sell collision.

**Respawns:** designer chooses **respawn** vs **end on zero health**. `maxRespawns` = **extra attempts** after the first run (**`0` = single attempt** — one death/end → end screen; useful for signup/redemption gimmicks).

On respawn (attempts remaining): **full reset** — player back at run start, **score and progress at zero**, timer/difficulty back to start. Not a mid-run checkpoint — it is **multiple separate tries at a high score** in one session. Brief invincibility flash on restart optional.

When attempts are exhausted (or end-on-zero mode): **end screen**. Linked leaderboard / session best uses the **best score across attempts** (per designer metric), submitted once at session end.

**Pickup effects:** positive items can add health and/or points and/or time (per-variant toggles). Negative items can remove time and/or health and/or points.

**Feedback:** damage **flash** (custom colour); pickup **glow** overlay (custom colour) on health/points gains.

### Difficulty & scrolling

- **Scroll speed:** designer sets **start → end** (lerp over round when timer on; or over distance/time when endless).
- **Parallax midground:** up to **5** wide PNG layers; each has **parallax speed**; loops horizontally; **no collision**.
- **Ground strip:** optional single wide PNG; loops horizontally; **purely visual** — adjustable height and Y. **No box collider ground** — character uses designer **ground Y**, **character Y**, and **jump height** only (simple arcade jump arc, not Unity-style ground physics).

### Character sprites

Three sprite sheets: **run**, **jump**, **death**.

- Upload PNG + **cell width/height**; frames read **row-major** top-left → bottom-right; frame count inferred from sheet dimensions.
- Reasonable caps flagged in editor (e.g. max cell size, max frames per sheet).
- Designer adjusts **character size**, **ground Y**, **jump height**.

### Items

Two lists (same language as catch):

- **Positive items (collectibles)** — spawn from off-screen right; per-variant size, Y, effect flags (+health / +points / +time).
- **Negative items (obstacles)** — spawn from off-screen right; per-variant size, Y; collision reduces health / time / points per flags.

### Sounds & shared chrome

Same families as catch: positive/negative SFX, game end, music + volume; backgrounds (desktop/tablet/mobile); banner; fonts; end-screen branding; linked leaderboard; high-score name collection; reporting toggle; embed code in editor.

### Responsive note (catch vs runner)

Catch uses **contain** scaling in a centred stage. Runner uses **full-viewport fill** with breakpoint-specific logical resolution — see table above.

---

## Console + cartridge

| Item | Decision |
|------|----------|
| Codebase | **Fresh in monorepo** — Prowler repo is reference only (Pygame port baggage) |
| Shell themes v1 | **Minimal** + **retro handheld**; both need branding space; handheld supports **colour variations** |
| Cartridge upload | **Single zip** (manifest + entry + assets) |
| Who uploads | **RN designers only** (Studio auth); end users never upload |
| Security v1 | Trusted designer uploads; no public cartridge sideload |
| Console without game | **Yes** — shell preview shows empty cartridge slot |
| `/v2/` subpath pattern | **No** — that was a one-off port strategy, not a platform pattern |
| Cartridge authoring | **`docs/CARTRIDGE-SPEC.md`** (Phase F) — zip limits, manifest schema, frame counts, assetsBase, min console version |

**Architecture (from Prowler learnings):** DOM shell (chrome, HUD, touch) + Canvas cartridge viewport.

---

## Tracking, data & dashboards

### Storage direction

| Item | Decision |
|------|----------|
| Source of truth | **Platform store** (Blobs → SQL when needed) |
| Google Sheets | **From the beginning** as accessible export/view; not the only story for clients |
| Sheets sunset | Possible later if security/policy requires; core data stays in platform |

### Model (conceptual)

**Tracking** = capture everything we might need (broad ingest).  
**Dashboards** = configurable views (like Analytics): pick modules, metrics, layout, copy, tooltips.

- Dashboard can link to **one module** or **many** (campaign-level rollup).
- Sections per linked module with chosen metrics and chart/table/metric widgets.
- Designers edit labels, headers, tooltip notes in Studio (moderator permissions later).

**Not the same thing:** tracking store vs dashboard config — interconnected but separate artifacts.

### Metric buckets (working)

| Bucket | Status | Examples |
|--------|--------|----------|
| **Results metrics** | Active | Quiz answers, wheel spins, redemptions, pin board images/notes/unique users, catch/runner scores |
| **Campaign performance** | **TBC** — may rename/split (e.g. analytics vs advanced analytics) | — |
| **Analytic performance** | **First-party only** for now | Clicks, dwell, funnel; no GA4 dependency |

### Other tracking decisions

| Item | Decision |
|------|----------|
| Retention (raw events) | **Pending** — management + head of research (Phase G gate) |
| PII default | Avoid real names unless signup/collection module requires it; leaderboard allows “Player 1” / pseudonym |
| Redemptions | Primarily **button clicks**; optional **QR with tracking**; conversion labels configured backend-side; toggle “click conversion” tagging |
| Pin board permissions | **Separate for now**; later replace built-in pin board consent with reusable **Consent / Sign-up / Data collection modules** modeled on pin board |
| First full ingest priority | **Defer to implementer** after arcade POCs |
| Landing + all modules | **Trackable** — report falloff landing → game/module |

### Event shape (clarification for T3)

**Versioned event types** means naming like `wheel.spin`, `quiz.answer`, `catch.round_end` with an optional schema version — not “group users under one calendar event.”

Example record: `{ type, gameId, campaignId?, sessionId?, timestamp, payload }`. Grouping by campaign, venue, or date range is **query/dashboard config**, not baked into the type name. Cider Decider–style continuous dated events can map to this with `timestamp` + optional `location` / `campaignId` fields.

---

## Campaign landing pages

| Item | Decision |
|------|----------|
| Hosting | **Same Netlify site**; centralise in Studio UI |
| Studio navigation groups | Landing & Sign-up · Digital Experiences · Games · Tracking & Reporting |
| v1 features | CTA **link** and/or **QR** (both tracked); QR colour customisation = nice-to-have |
| Slugs | Consistent with wheels (`/{slug}`) for now; aware we may need reserved namespaces or different URL later |
| Tracking | Yes — landing events in same first-party pipeline |

---

## Internal only

| Item | Decision |
|------|----------|
| Tier labels (T1–T3) | **Internal** complexity/value hierarchy — not customer-facing |
| Game ↔ tier mapping | No platform enum needed |

---

## Open / deferred

- **T4 / Phase G gate** — retention policy and tracking architecture: **management + head of research** consultation before implementation  
- **T7** Final naming/split of analytics buckets  
- **R3 / P3** Production URL and landing slug strategy when management decides  
- **Leaderboard ↔ name collection module** — wire when collection modules exist; manual mode covers gap for now  
- **Quiz kiosk spin-off** — scope and editor timing (after play-along quiz stabilises or in parallel with quiz overhaul)  

---

## Reference repos

| Repo | Role |
|------|------|
| RN-Games (this monorepo) | Game Studio platform |
| dungeon-prowler | Console/cartridge **patterns only** — do not merge as-is |
