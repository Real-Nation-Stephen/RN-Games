# RN Game Studio — Planning & locked decisions

Companion to [INFRASTRUCTURE.md](./INFRASTRUCTURE.md). Captures product decisions as we go; update when answers change.

**Last updated:** May 2026 (concerns review)

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
| **E** | Dino runner POC (isolated test → Studio) |
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

Only game types in `LEADERBOARD_LINKABLE_GAME_TYPES` (`@rngames/shared`) appear in the Studio linker and may `POST` scores. **Not linkable:** spinning wheel, scratcher, flip cards, pin board, quiz (session LB built-in). **Linkable when shipped:** catch, dino runner. API enforces the same list.

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

**Quiz play-along** already has a session leaderboard (`/quiz/:slug/live/:code/leaderboard`) tied to quiz participants — that stays quiz-specific. The standalone module is for catch/dino and other games plus manual event boards.

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

## Dino / runner (POC)

| Item | Decision |
|------|----------|
| Build path | Isolated test first → Studio |
| Orientation | **Responsive** (same approach as catch) |
| Input | Tap / Space **jump only** (no duck v1) |
| Score | **Time survived** |
| Art | Designer uploads **two sprite sheets** (walk + jump), **fixed frame counts** |
| Leaderboard | Submit on run end (same hook as catch) |

### Responsive arcade games (catch & dino)

Dungeon Prowler uses **tile grids** that change per breakpoint — great for maze games, heavy for simple arcade.

For catch and dino, use the **same pattern as the spinning wheel player**: a fixed **logical resolution** (e.g. 360×640 portrait or 16∶9 landscape — pick per game in Studio) and **scale-to-fit** the canvas inside the viewport (`object-fit` / letterbox). Game logic stays in logical coordinates; CSS handles screen size. This is **straightforward** and already familiar in the monorepo (`#fit` / `#stage` layout).

Not difficult — different tool than tile profiles, simpler for these game types.

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
| **Results metrics** | Active | Quiz answers, wheel spins, redemptions, pin board images/notes/unique users, catch/dino scores |
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
