# Component Data & Event Inventory

**Purpose:** Source-of-truth describing what the RN Games platform **actually records today**, what identifiers and events are **technically available**, and what is **not yet instrumented**. This document is for analytics design, data minimisation review, and GDPR assessment — it does not make legal decisions or recommend field removal.

**Repository baseline:** audited from `main` after commit `1ab70ac` (July 2026).  
**Storage backend:** Netlify Blobs store `rngames-platform` (`netlify/functions/lib/store.mjs`).

**Legend**

| Tag | Meaning |
|-----|---------|
| **CONFIRMED** | Present in code and used in production paths |
| **AVAILABLE** | Derivable from runtime context but not persisted on events |
| **NOT IMPLEMENTED** | Would require new work |
| **PROPOSED** | Suggested canonical name; not emitted today |

---

## Platform overview

### Runtime shells

| Shell | Role | Session API |
|-------|------|-------------|
| **Standalone** | Direct public URL per component | Component-local only (quiz room, localStorage) |
| **Experience (flow)** | Multi-step iframe orchestrator | `POST/PATCH /api/experience-session` |
| **Course** | Learning link / class enrolment shell | `POST/PATCH /api/course-session` |

Nesting: **Course → Experience iframe → Step module iframe** (three levels for flow items inside courses).

### Analytics ingest

| Path | Storage | Retention |
|------|---------|-----------|
| `POST /api/track` | `track-log:{YYYY-MM-DDTHH}` | Hour buckets; max **5000 events/bucket**; older buckets not auto-deleted in code |
| `POST /api/log-spin` | Google Sheets (if `reportingEnabled`) | External; not in Blobs |
| Component state APIs | See per-component sections | Generally indefinite until admin clear/delete |

### Track event envelope (`packages/shared/src/track.ts`)

| Field | Source | Notes |
|-------|--------|-------|
| `type` | Caller | Event name |
| `gameId` | Caller | Module instance UUID or slug |
| `moduleId` | Caller | Experience step `moduleInstanceId` when set |
| `campaignId` | Auto from flow | `experienceId` when `flow=1` |
| `sessionId` | Auto from flow | Experience `sessionId` when `flow=1` |
| `timestamp` | Auto | ISO8601 |
| `payload` | Caller | Free-form object |

**Gap (CONFIRMED):** `track()` auto-enriches **flow** context only. Course context (`courseSessionId`, `courseItemId`) is **NOT** auto-attached to track events.

---

## Global context identifiers

| Identifier | Currently recorded | Technically available | Unavailable without new work |
|------------|-------------------|----------------------|------------------------------|
| Component instance ID (`wheel:{uuid}` / `gameId`) | Yes — track, sessions, blobs | Yes | — |
| Component slug | Yes — payloads, URLs | Yes | — |
| Experience / flow ID | Yes — `campaignId`, session blob | Yes | — |
| Experience session ID | Yes — experience session, track (in flow) | Yes | — |
| Experience step / node ID | Yes — `nodeId` in iframe URL; step events | Yes | — |
| Course ID | Yes — course session blob | Yes in course iframe URL | Not on standalone track events |
| Course session ID | Yes — course session blob | Yes | Not on track events |
| Course item ID | Yes — `itemOutcomes`, visit/complete | Yes in course URL | Not on track events |
| Participant ID | Yes — course & experience sessions | Yes — client can resubmit | Not linked to track by default |
| Resume token | Yes — course session + index blob | Yes — URL `?resumeToken=` | Experience has no resume token |
| Email | Optional — course session | User entry | Not on most components |
| Class code | Validated at enrolment only | Server-side compare | **Not stored** on session (only `enrolledViaClass: true`) |
| Learner display name | Yes — `courseSession.data.learnerDisplayName` | Derived from form fields | Not a separate pseudonym ID yet |
| Preview token | Auth only | URL | Not stored on participant events |
| Project / design code | Index metadata on components | Editor fields | Not on runtime events |
| Client name | Index metadata | Editor fields | Not on runtime events |
| Parent context (standalone vs flow vs course) | Partial — infer from URL params | Yes | No single `deploymentContext` field |
| Referral / UTM | **NOT IMPLEMENTED** | Browser referrer | Requires instrumentation |
| Version ID | **NOT IMPLEMENTED** | Could hash `updatedAt` | Requires schema |

---

## Global raw events

| Event name | Trigger | Properties attached | Currently emitted? | Stored where? | Notes |
|------------|---------|-------------------|--------------------|---------------|-------|
| `page.step_complete` | Page module `completeStep()` | `gameId`, spread outcomes | **CONFIRMED** | `track-log:*` | Also `emitStepComplete` postMessage (not in Blobs) |
| `experience.step_start` | Experience loads step | `stepId`, `moduleType`, `moduleId`, `campaignId`, `sessionId` | **CONFIRMED** | `track-log:*` | |
| `experience.step_complete` | Child step completes | `stepId`, `outcomes`, ids as above | **CONFIRMED** | `track-log:*` | |
| `experience.complete` | Flow finished | `slug`, `campaignId`, `sessionId` | **CONFIRMED** | `track-log:*` | |
| `wheel.spin` | Wheel spin completes | `slug`, `segmentIndex`, `prizeLabel`, `outcome` | **CONFIRMED** | `track-log:*` + optional Sheets | |
| `scratcher.reveal` | Scratch threshold reached | `outcome` win/lose | **CONFIRMED** | `track-log:*` | |
| `flip_cards.open` | Card flipped | `deckIndex`, `slotIndex` | **CONFIRMED** | `track-log:*` | |
| `catch.round_start` | Catch round begins | `slug` | **CONFIRMED** | `track-log:*` | |
| `catch.round_end` | Catch round ends | `slug`, `score` | **CONFIRMED** | `track-log:*` | |
| `runner.round_start` | Runner round begins | `slug` | **CONFIRMED** | `track-log:*` | |
| `runner.round_end` | Runner round ends | `slug`, `score` | **CONFIRMED** | `track-log:*` | |
| `pinboard.submit` | Note/photo submitted | `submissionType`, `stickyId`/`frameId` | **CONFIRMED** | `track-log:*` | |
| `leaderboard.view` | Live board loads | `slug`, `surface: "live"` | **CONFIRMED** | `track-log:*` | |
| `quiz.answer` | Play-along answer | `participantId`, `choiceId`; `sessionId`=room code | **CONFIRMED** | `track-log:*` | |
| `course.view` | — | — | **NOT IMPLEMENTED** | — | **PROPOSED** |
| `course.item_start` | — | — | **NOT IMPLEMENTED** | — | Visit action exists in session only |
| `course.item_complete` | — | — | **NOT IMPLEMENTED** | — | PATCH complete only |
| `form.submitted` | — | — | **NOT IMPLEMENTED** | — | Blob + `page.step_complete` only |
| `certificate.downloaded` | — | — | **NOT IMPLEMENTED** | — | Client-side PNG/PDF only |

### postMessage events (not in track Blobs)

| Message type | Constant | Purpose |
|--------------|----------|---------|
| Step complete | `rngames:step_complete` | Child → experience |
| Step engaged | `rngames:step_engaged` | Interaction gating |
| End screen ready | `rngames:end_screen_ready` | Show course footer |
| Course item complete | `rngames:course_item_complete` | Complete course item from child |
| Experience complete | `rngames:experience_complete` | Flow done in course |
| Experience step changed | `rngames:experience_step_changed` | Hide/show course footer |

---

## Global data fields

| Field | Type | Source | Required | Stored currently? | Entered / generated / derived | Could identify person? | Notes |
|-------|------|--------|----------|-------------------|------------------------------|------------------------|-------|
| `participantId` | UUID | Server or client | Optional | Course & experience sessions | Generated | Linkable within session | Same user new session = new ID unless resumed |
| `sessionId` | UUID | Server | Yes | Sessions | Generated | Linkable | |
| `resumeToken` | base64url | Server | Course only | Course session + index | Generated | Linkable to session | 9-byte token |
| `email` | string | User | Optional | Course session | Entered | **Yes — PII** | Indexes `course-email:{slug}:{email}` |
| `learnerDisplayName` | string | Form-derived | Optional | `courseSession.data` | Derived from form | **Yes — PII** | Fallback for merge tags |
| `form.fieldValues` | object | User | Per form | Session outcomes + form blob | Entered | Often PII | Keyed by field id |
| `formFields` | object | User | Per form | `session.data` | Entered | Often PII | Duplicate path vs outcomes |
| `outcomes` | object | Runtime | No | Course & experience sessions | Mixed | Depends on keys | Flat merge map |
| `itemOutcomes` | object | Runtime | No | Course session | Per item | Depends | |
| `completedItemIds` | string[] | Runtime | No | Course session | Derived | No | |
| `enrolledViaClass` | boolean | Server | No | Course session | Derived | No | Class code itself not stored |
| `playerName` | string | User | Optional | localStorage (runner/catch) | Entered | **Yes** | Not in server session by default |
| `externalId` | string | Client | Optional | Leaderboard entry | Generated | Pseudonymous link | `{gameType}-{gameId}-{uuid}` |
| `displayName` | string | User / default | Leaderboard | Leaderboard state | Entered | **Yes** | Truncated 64 chars |
| `avatarUrl` | string | Config | Optional | Leaderboard entry | Config URL | No | Sprite sheet URL |
| IP address | string | HTTP | — | Rate-limit keys only | Generated | **Yes** | `session-rate:{ip}:{hour}` |
| `voterId` | string | Client | Poll | Poll ballot | Generated | Weak pseudonym | localStorage per poll block |

---

## Derived metrics (platform-level)

| Metric | Possible now | Minor instrumentation | Substantial new work |
|--------|--------------|----------------------|----------------------|
| Hourly event counts by type | Yes (`track-stats`) | — | — |
| Flow completion rate | Partial | Add `course.item_complete` track | Cross-shell joins |
| Unique experience sessions | Partial | Count distinct `sessionId` in logs | SQL / proper warehouse |
| Unique learners (cross-course) | No | — | Identity layer |
| Drop-off by step | Partial | Experience session `history` | Funnel dashboard |
| Average quiz score | Partial | mini-quiz + play-along outcomes | Aggregation API |
| Leaderboard rank distribution | Yes | — | — |
| Form submission export | Yes | Admin UI | — |
| Poll results | Yes | Admin export | — |
| GDPR erasure per learner | No | — | Deletion orchestration |

---

## Data relationships

```
CourseSession.sessionId ←── course-resume:{resumeToken}
        │
        ├── participantId (opaque UUID)
        ├── email? ──→ course-email index
        ├── data.formFields / learnerDisplayName
        ├── outcomes.* (merged across items)
        └── itemOutcomes[itemId].*

ExperienceSession.sessionId
        │
        ├── participantId
        ├── outcomes.* (step merges)
        └── data.* (form, etc.)

Form submission blob: form-submissions:{formId}
        └── values (may duplicate session formFields)

Same component slug in different deployments:
  - Standalone: URL /{type}/{slug} — no courseId/flowId on events
  - Flow A: campaignId=experienceA.id, sessionId=expSession
  - Flow B: campaignId=experienceB.id
  - Course A item: courseSessionId + courseItemId (session only, not track)
  - Course B item: different courseSessionId

Distinguishing deployments today: **CONFIRMED** via session blobs and URL params; **NOT CONFIRMED** on all analytics events.
```

---

## Retention & deletion

| Storage | Expires? | Overwrite? | Delete API? | Export? | Per-learner delete? |
|---------|----------|------------|-------------|---------|---------------------|
| `track-log:*` | No auto-expire | Hour bucket trimmed to 5000 | No | Via `track-stats` | No |
| `course-session:*` | No | PATCH merges | No dedicated | No | No |
| `experience-session:*` | No | PATCH merges | `deleteExperienceSessionJson` exists, unused in API | No | No |
| `form-submissions:*` | No | Append | Admin clear in editor | CSV export | No |
| `poll-state:*` | No | Tallies update | Admin clear | CSV export | No |
| `leaderboard-state:*` | No | Upsert by externalId | Moderator clear | No | No |
| `pinboard-state:*` | No | Append + moderate | Board clear | No | No |
| `wheel:/experience:/course:` config | No | PUT replace | DELETE wheel API | No | N/A |
| Google Sheets spin log | External | Append | External | Sheets | External |

---

## Gaps & inconsistencies (CONFIRMED)

1. **Multiple course-completion signals** — `courseLastStep=1`, `moduleItemComplete=1`, `flowCompleteOverride` (landing screen flag), experience `module_item_complete` override, `FLOW_END_SCREEN_READY`, `FLOW_EXPERIENCE_COMPLETE`, `FLOW_COURSE_ITEM_COMPLETE`. These overlapped; landing ignored experience-level `module_item_complete` until fixed.
2. **Track lacks course context** — cannot attribute standalone analytics to course item without joining sessions manually.
3. **`email-signup` does not sync to course session** — only patches experience session.
4. **`form.fieldValues` vs `data.formFields`** — duplicate storage paths.
5. **Experience `SessionContext` type vs runtime blob** — rich type in `experience.ts`; persisted blob is simpler.
6. **Pinboard / leaderboard / quiz join** — not embeddable in flows or courses.
7. **No `viewed` / `started` track events** for most page modules — only `page.step_complete`.
8. **Participant ID** is resumable but not stable across new sessions without resume token.
9. **Class code** validated but not stored on session (only boolean flag).
10. **Blobs → SQL migration** would need normalised event schema, foreign keys for session/participant/component deployment.

---

# Per-component inventory

Below, each **shipped participant-facing** type from `packages/shared/src/module-registry.ts`.

---

## spinning-wheel

### 1. Component identity

| | |
|-|-|
| **Name** | Spinning wheel |
| **Type key** | `spinning-wheel` |
| **Status** | shipped |
| **Standalone** | Yes |
| **In flow** | Yes |
| **In course** | Yes (direct item or inside experience) |

### 2. Context identifiers

All flow/course URL params **AVAILABLE** in iframe; track receives flow `sessionId`/`campaignId` only.

### 3. Raw events

| Event | Trigger | Properties | Emitted? | Stored |
|-------|---------|------------|----------|--------|
| `wheel.spin` | Spin ends | `slug`, `segmentIndex`, `prizeLabel`, `outcome` | Yes | `track-log:*` |
| `page.step_complete` | Result CTA in flow | `wheel.segmentId`, `wheel.segmentLabel`, `wheel.isWin`, `completed` | Yes | `track-log:*` |
| postMessage step complete | Same | outcomes object | Yes | Not in Blobs |

Optional: `POST /api/log-spin` → Google Sheets when `reportingEnabled`.

### 4. Data fields

| Field | Stored | PII? | Notes |
|-------|--------|------|-------|
| Segment index/label | Outcomes | No | |
| Win/lose | Outcomes | No | |
| Player name | No | — | Not collected |

### 5–9. Metrics, relationships, retention

Completion = step complete in flow. Standalone spins only in track + optional Sheets. No server session. Delete wheel config deletes blob only.

---

## scratcher

### 1. Identity

| **Type** | `scratcher` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? | Stored |
|-------|---------|------------|----------|--------|
| `scratcher.reveal` | Reveal threshold | `outcome` | Yes | track-log |
| `page.step_complete` | CTA / auto in flow | `scratcher.revealed`, `completed` | Yes | track-log |

### 4. Data fields

| Field | Stored | Notes |
|-------|--------|-------|
| Win/lose outcome | Random per load | Not persisted server-side |
| `hideWinButton` | Config only | |

---

## flip-cards

### 1. Identity

| **Type** | `flip-cards` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `flip_cards.open` | Each card open | `deckIndex`, `slotIndex` | Yes |
| `page.step_complete` | Next in flow | `flipCards.engaged`, `completed` | Yes |

---

## quiz (play-along)

### 1. Identity

| **Type** | `quiz` | **Standalone** Yes (host/join) | **Flow** No | **Course** No |

### 3. Raw events

| Event | Trigger | Properties | Emitted? | Stored |
|-------|---------|------------|----------|--------|
| `quiz.answer` | Player submits | `participantId`, `choiceId`, `sessionId`=code | Yes | track-log |
| Room events | Host actions | In `quizsession:{CODE}.events` | Yes | Blobs |

### 4. Data fields (quiz session blob)

`participants[].{id,name,icon,score}`, `answers`, `phase`, `hostKey`, room `code`.

### 7. Retention

Quiz sessions expire via `expiresAt` on room creation (CONFIRMED in quiz-session handler).

---

## pinboard

### 1. Identity

| **Type** | `pinboard` | **Standalone** Yes | **Flow** No | **Course** No |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `pinboard.submit` | Submit note/photo | `submissionType`, ids | Yes |

### 4. Data fields (`pinboard-state:{wheelId}`)

Submissions may include `noteText`, `imageDataUrl` — **potential PII/media**.

---

## catch

### 1. Identity

| **Type** | `catch` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `catch.round_start` | Round start | `slug` | Yes |
| `catch.round_end` | Round end | `slug`, `score` | Yes |
| `page.step_complete` | Embedded end | `catch.score`, `completed` | Yes |

### 4. Data fields

| Field | Stored | PII? |
|-------|--------|------|
| `catch.score` | Experience outcomes | No |
| Player name | localStorage | Yes |
| Leaderboard row | `leaderboard-state` | displayName |

---

## runner

### 1. Identity

| **Type** | `runner` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `runner.round_start` | Round start | `slug` | Yes |
| `runner.round_end` | Round end | `slug`, `score` | Yes |
| `page.step_complete` | Embedded end | `runner.score` / distance / time | Yes |

### 4. Data fields

Character selection stored client-side only; avatar sprite URL sent to leaderboard.

---

## leaderboard

### 1. Identity

| **Type** | `leaderboard` | **Standalone** Yes | **Flow** No | **Course** No |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `leaderboard.view` | Board load | `slug`, `surface` | Yes |

Scores arrive via `POST /api/leaderboard-state` from linked games (not a track event).

---

## landing

### 1. Identity

| **Type** | `landing` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `page.step_complete` | CTA click | `landing.cta`, `completed` | Yes |

Poll block votes: `POST /api/poll-state` (not track).

### 4. Data fields

Poll `voterId`, `optionId` in `poll-state:{landingId}:{blockId}`.

### Completion modes (CONFIRMED — overlapping)

- Landing screen `flowCompleteOverride` flag
- Experience override `completionBehaviour: module_item_complete`
- URL `moduleItemComplete=1` + `endHeadline`/`endBody`/`endCta`

---

## form

### 1. Identity

| **Type** | `form` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `page.step_complete` | Submit | `form.fieldValues`, `completed` | Yes |

### 4. Data fields

| Field | Stored | PII? |
|-------|--------|------|
| `values` per submission | `form-submissions:{formId}` | Often |
| `form.fieldValues` | Session outcomes | Often |
| `formFields` | Session data | Often |
| `learnerDisplayName` | Course session data | Yes |

Admin: per-form results export (CSV).

---

## certificate

### 1. Identity

| **Type** | `certificate` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `page.step_complete` | Continue | `completed` | Yes |

### 4. Data fields

Reads merge fields from session (`form.fieldValues`, scores, `learnerDisplayName`). PNG/PDF download is **client-only** (not tracked).

---

## badge

Same pattern as certificate; merge fields from session.

---

## consent

### 1. Identity

| **Type** | `consent` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `page.step_complete` | Accept | `consentGranted`, `completed` | Yes |

---

## email-signup

### 1. Identity

| **Type** | `email-signup` | **Standalone** Yes | **Flow** Yes | **Course** Partial |

### 4. Data fields

| Field | Stored | Notes |
|-------|--------|-------|
| `emailSignup` | Experience `data` only | **Gap:** not synced to course session |
| `form.fieldValues` | Outcomes | |

---

## redemption

### 1. Identity

| **Type** | `redemption` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

`page.step_complete` with `completed` only.

---

## mini-quiz

### 1. Identity

| **Type** | `mini-quiz` | **Standalone** Yes | **Flow** Yes | **Course** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `page.step_complete` | Continue after results | `quiz.score`, `quiz.correctCount`, `quiz.scorePercent` | Yes |

### 4. Data fields

`data.miniQuiz.{correctCount,scorePercent,total}` on session sync.

---

## experience (flow shell)

### 1. Identity

| **Type** | experience player (`/x/{slug}`) | **Standalone** Yes | **Is the flow** | **Course embed** Yes |

### 3. Raw events

| Event | Trigger | Properties | Emitted? |
|-------|---------|------------|----------|
| `experience.step_start` | Step load | `stepId`, `moduleType` | Yes |
| `experience.step_complete` | Child complete | `stepId`, `outcomes` | Yes |
| `experience.complete` | All steps done | `slug` | Yes |

### 4. Session blob (`experience-session:{id}`)

`sessionId`, `experienceId`, `experienceSlug`, `participantId`, `currentStepIndex`, `currentNodeId`, `history[]`, `outcomes`, `data`, `startedAt`, `updatedAt`, `completedAt`.

---

## course (learning link shell)

### 1. Identity

| **Type** | course player (`/course/{slug}`) | **Standalone** Yes | **Hosts flows** | **Is the course** |

### 3. Raw events

**None** via `track()` today.

### 4. Session blob (`course-session:{id}`)

`sessionId`, `courseId`, `courseSlug`, `participantId`, `email?`, `resumeToken`, `completedItemIds[]`, `currentItemId`, `lastVisitedItemId`, `earnedCertificates[]`, `earnedBadges[]`, `outcomes`, `itemOutcomes`, `data`, `enrolledViaClass?`, timestamps.

### Auth paths (CONFIRMED)

- New session: `intent: "new"`
- Resume: `resumeToken`
- Class: `classCode` (validated against course settings; not stored verbatim)

---

# Machine-readable appendix (PROPOSED — not implemented)

```json
{
  "schemaVersion": "2026-07-12",
  "platform": {
    "componentType": "platform",
    "supportedContexts": ["standalone", "flow", "course"],
    "events": [
      { "name": "page.step_complete", "emitted": true, "storage": ["track-log"] },
      { "name": "experience.step_start", "emitted": true, "storage": ["track-log"] },
      { "name": "experience.step_complete", "emitted": true, "storage": ["track-log"] },
      { "name": "experience.complete", "emitted": true, "storage": ["track-log"] }
    ],
    "fields": [
      { "name": "participantId", "stored": true, "storage": ["course-session", "experience-session"], "pii": "linkable" },
      { "name": "resumeToken", "stored": true, "storage": ["course-session", "course-resume"], "pii": "linkable" },
      { "name": "email", "stored": true, "storage": ["course-session"], "pii": true }
    ],
    "derivedMetrics": [
      { "name": "hourlyEventCounts", "feasibility": "possible_now" },
      { "name": "uniqueLearnersCrossCourse", "feasibility": "substantial_new_work" }
    ],
    "relationships": ["courseSession→experienceSession via embed", "form→certificate via outcomes merge"],
    "currentStorage": ["track-log:{hour}", "course-session:{id}", "experience-session:{id}"],
    "instrumentationGaps": ["course context on track events", "viewed/started events", "per-learner erasure"]
  },
  "components": [
    {
      "componentType": "runner",
      "supportedContexts": ["standalone", "flow", "course"],
      "events": [
        { "name": "runner.round_start", "emitted": true },
        { "name": "runner.round_end", "emitted": true },
        { "name": "page.step_complete", "emitted": true }
      ],
      "fields": [
        { "name": "runner.score", "stored": true, "storage": ["experience-session.outcomes"] },
        { "name": "displayName", "stored": true, "storage": ["leaderboard-state"], "pii": true }
      ],
      "derivedMetrics": [
        { "name": "averageScore", "feasibility": "possible_now" },
        { "name": "completionRate", "feasibility": "minor_instrumentation" }
      ],
      "relationships": ["linkedLeaderboardSlug→leaderboard-state"],
      "currentStorage": ["track-log", "leaderboard-state", "localStorage player name"],
      "instrumentationGaps": ["download/export not tracked", "character choice not in session"]
    },
    {
      "componentType": "form",
      "supportedContexts": ["standalone", "flow", "course"],
      "events": [{ "name": "page.step_complete", "emitted": true }],
      "fields": [
        { "name": "form.fieldValues", "stored": true, "storage": ["experience-session", "course-session", "form-submissions"], "pii": "often" },
        { "name": "learnerDisplayName", "stored": true, "storage": ["course-session.data"], "pii": true }
      ],
      "derivedMetrics": [{ "name": "submissionCount", "feasibility": "possible_now" }],
      "relationships": ["feeds certificate/badge merge tags"],
      "currentStorage": ["form-submissions:{formId}"],
      "instrumentationGaps": ["no form.viewed event", "duplicate field paths"]
    },
    {
      "componentType": "landing",
      "supportedContexts": ["standalone", "flow", "course"],
      "events": [{ "name": "page.step_complete", "emitted": true }],
      "fields": [{ "name": "landing.cta", "stored": true, "storage": ["outcomes"] }],
      "derivedMetrics": [{ "name": "ctaClickRate", "feasibility": "minor_instrumentation" }],
      "relationships": ["poll-state per block"],
      "currentStorage": ["poll-state"],
      "instrumentationGaps": ["multiple completion override mechanisms"]
    }
  ]
}
```

*Full JSON for all 16 shipped types should extend this pattern; omitted here for length. Each type's details are in the per-component sections above.*

---

## Document maintenance

When adding components, events, or storage:

1. Update the relevant per-component section.
2. Add rows to global event/field tables.
3. Extend the JSON appendix.
4. Record new gaps in § Gaps & inconsistencies.

**This document describes behaviour; it does not authorise processing.** Legal review should cross-reference `docs/ANALYTICS_LEGAL_QUESTIONNAIRE.md`.
