# Experience platform — schema (draft)

Design reference for the modular flow architecture. TypeScript: `packages/shared/src/experience.ts`, `packages/shared/src/module-registry.ts`.

**Status:** Locked for planning (July 2026) — see [ROADMAP_QUESTIONS.md](./ROADMAP_QUESTIONS.md). Not yet wired to API/runtime.

---

## Three layers

| Layer | Storage (proposed) | Purpose |
|-------|-------------------|---------|
| **Component instance** | `wheel:{uuid}` + `wheels-index` | Reusable configured artifact |
| **Experience** | `experience:{uuid}` + `experiences-index` | Graph referencing instances + Logic nodes |
| **Session** | Abstract store (`experience-session:{id}`) | Per-participant state; SQL-migration-friendly |

Component editors unchanged. Flow editor edits **Experience** records only.

---

## URLs & publishing (locked)

| Surface | URL | Embeddable |
|---------|-----|------------|
| Experience | `/x/{experienceSlug}` | **No** (full journeys not embedded) |
| Component | Existing paths (`/catch/:slug`, `/{slug}`, etc.) | **Yes** (component embed codes) |

- Standalone components remain **first-class** alongside experiences.
- Experience slugs globally unique with component slugs and reserved paths.
- **Autosave** draft experiences; **explicit Publish** for live.
- Draft preview links for unpublished experiences.

---

## Branding (locked)

**Branding belongs to components.** Experiences store lightweight metadata only (title, client, codes, favicon optional) — not full visual override of component branding.

**Powered by Real Nation:** per component.

---

## Module capability registry

`MODULE_REGISTRY` in `@rngames/shared` is the source of truth for outcome ports and palette grouping.

**Standard component nodes:** single output edge.  
**Logic nodes:** multiple conditional outputs + required default/fallback.

### Outcome namespacing (locked)

| Case | Key pattern | Example |
|------|-------------|---------|
| Default | `{typeId}.{key}` | `catch.score`, `wheel.isWin` |
| Same type twice in one flow | `nodes.{nodeId}.{key}` | `nodes.n2.catch.score` |

Logic nodes read from session outcomes using these paths.

### Mini Quiz outcomes (pilot)

`gameType: mini-quiz` emits the same quiz outcome keys as kiosk quiz for flow/course consumption:

| Key | Type | Notes |
|-----|------|-------|
| `quiz.score` | number | Total points |
| `quiz.correctCount` | number | Correct answers |
| `quiz.scorePercent` | number | 0–100 |

---

## Experience graph

### Component reference node

Points at `moduleInstanceId` (today’s `wheel:{id}` pattern). Optional **Experience Overrides** on the node:

```ts
interface ExperienceNodeOverrides {
  completionBehaviour?: "auto_continue" | "show_continue" | "replay" | "custom";
  endScreen?: {
    headline?: string;
    body?: string;
    hidePlayAgain?: boolean;
    primaryCtaLabel?: string;
    secondaryCtaLabel?: string;
  };
  leaderboard?: {
    mode?: "player_rank" | "top10" | "projector";
    autoContinue?: boolean;
  };
}
```

Overrides adjust in-flow behaviour without duplicating component end-screen layouts.

### Control nodes

| controlType | Role |
|-------------|------|
| `entry` | Start (or `entryNodeId` on graph) |
| `exit` | Terminal |
| `logic` | **Unified routing node** — rules, time conditions, merge, loops (replaces separate router/aggregator) |
| `join` | Merge parallel branches |
| `delay` | Timed auto-advance |
| `redirect` | External URL |

Every **Logic** node must define `defaultTargetNodeId`.

### Logic rule sources (Wave 4+)

- Component outcomes (`wheel.isWin`, `catch.score`, thresholds, ranges)
- Date/time (before / during / after event window)
- Session data (consent, form fields)
- High-score detection within session

Quiz routing deferred until kiosk/mini quiz architecture is defined.

---

## Experience record (extended)

```ts
interface ExperienceRecord {
  id: string;
  slug: string;
  title: string;
  clientName: string;
  projectCode: string;   // optional, Studio-only
  designCode: string;    // optional, Studio-only
  status: "draft" | "published" | "archived";
  graph: ExperienceGraph;
  foundation: {
    trackingEnabled: boolean;
    reportingEnabled: boolean;  // aggregates component reporting
    sessionTtlMinutes: number;
    navigation: {
      backButton: "free" | "one_way" | "blocked";
      fallbackNodeId?: string;  // on error or blocked back
    };
    kiosk?: {
      idleTimeoutMs: number;
      idleDestinationNodeId?: string;
    };
  };
  publishedAt?: string | null;
  updatedAt: string;
}
```

---

## Session context

- **Anonymous by default** — always assign `participantId` + `sessionId`.
- Identity layered via forms/gates (`displayName`, `email`, etc.).
- **Resume on refresh** — prefer localStorage/session token; avoid cookies where practical.
- **Component + experience summaries** — per-component scores/high scores plus experience-level rollup for leagues.

```ts
interface SessionContext {
  sessionId: string;
  experienceId: string;
  identity: SessionIdentity;
  progress: SessionProgress;
  outcomes: SessionOutcomes;
  data: Record<string, unknown>;
  moduleSnapshots: Record<string, Record<string, unknown>>;
  experienceSummary?: {
    bestScores: Record<string, number>;
    completedNodeIds: string[];
  };
}
```

---

## Session API (proposed)

| Method | Purpose |
|--------|---------|
| `POST /api/experience-session` | Create/resume session |
| `GET /api/experience-session?id=` | Read state |
| `PATCH /api/experience-session` | Advance step, merge outcomes, identity |
| `GET /api/public-experience?slug=` | Published graph + entry (draft excluded) |
| `POST /api/track` | Raw events (Wave 2+); aggregates derived Wave 6 |

Public endpoints rate-limited. Storage behind abstraction for future SQL.

---

## Component lifecycle

| Action | Behaviour |
|--------|-----------|
| **Archive** | Component hidden from pickers; existing experience refs flagged |
| **Delete** | Prefer archive; hard delete flags broken refs in experiences |
| **Draft component in draft experience** | Allowed |
| **Draft component in published experience** | Block publish / warn |

---

## Tracking & analytics buckets (locked)

| Bucket | Scope |
|--------|-------|
| **Campaign Analytics** | Cross-experience / client rollup |
| **Experience Analytics** | Funnel, drop-off, completion per journey |
| **Component Analytics** | Context-aware metrics per module type |
| **User Analytics** | Session/participant behaviour (pseudonymous default) |

Wire `campaignId` (= experience id) + `sessionId` in Wave 1. Minimal ingest Wave 2 (`experience.cta_click`, step events). Full dashboards Wave 6.

Reporting toggle: **per component and per experience** (experience aggregates journeys).

---

## Error handling (locked)

1. Retry load on component failure  
2. Then route to configurable **fallback** node/page on experience

Lazy-load component bundles on step entry.

---

## Migration from today’s linking

| Today | Future |
|-------|--------|
| `catch.linkedLeaderboardSlug` | Experience graph edge |
| `leaderboard.linkedGameId` | Same; UI fields hidden, API retained |

---

## Open items

- Max nodes per experience (W3-10)
- A/B random split (W4-10)

See [ROADMAP.md](./ROADMAP.md) for wave deliverables.
