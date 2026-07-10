# Analytics & data processing — pilot decisions

**Purpose:** Locked decisions and open actions from leadership review (July 2026). Plain English throughout. Forward to legal for final sign-off where noted.

**Platform:** RN Game Studio (Netlify hosting, Netlify Blobs storage, Resend for transactional email)

**Market:** Ireland (EEA). Work is not targeted at UK learners.

**Pilot scope:** Standalone components/modules only — not full experiences or courses in pilot analytics/reporting.

**Last updated:** July 2026

---

## Executive summary

| Area | Pilot decision |
|------|----------------|
| Event types | Current set is sufficient; expand per game type post-pilot |
| Storage | Netlify Blobs OK for pilot; migrate to a more robust store shortly after |
| Analytics access | Authenticated Studio users only; client-facing dashboards later |
| Consent model | Anonymous/pseudonymous baseline; explicit consent for anything beyond legitimate interest |
| Pseudonymous `track()` | No consent required (Irish advice); scores/session ids are not personally identifiable on their own |
| Form PII | Consent-driven; can appear in aggregates/exports when collected with consent — not excluded by default |
| Retention | **1 year** default across data types; build a warning before automatic deletion |
| DSAR / erasure | No formal SLA for pilot; manual removal when requested (no self-service delete button) |
| Learning link | Acknowledgement checkbox approved for pilot; product may need **copy link** option and reduced email retention (see §4) |
| Data controller | Real Nation for all pilot processing |
| Pilot reporting | Aggregated analytics only; no per-learner educator roster |
| Erasure routing | Client first line → Real Nation executes removal |

---

## 1. What data do we collect?

### Analytics events (`POST /api/track`)

The player calls `track()` on meaningful actions. Events append to hourly blobs (`track-log:YYYY-MM-DDTHH`) and aggregate in Studio (`GET /api/track-stats`).

| Field | Example | Notes |
|-------|---------|-------|
| `type` | `page.step_complete`, `catch.game_end` | Event name |
| `gameId` / `moduleId` | Component UUID | Which module fired the event |
| `campaignId` | Experience UUID | Only when embedded in a flow (not pilot scope) |
| `sessionId` | Opaque session id | Pseudonymous journey id |
| `timestamp` | ISO datetime | Server-stamped on ingest |
| `payload` | Object | Type-specific (scores, CTA ids, etc.) |

**Decision 1 — Event set for pilot:** ✅ Sufficient for pilot. Post-pilot we will define additional baseline analytics per game type so we capture everything we might need for reporting.

**Decision 2 — Raw event storage:** ✅ Netlify Blobs is acceptable for the pilot retention period. Plan to migrate to a more solid approach (e.g. warehouse/SQL) shortly after pilot.

**Decision 3 — Who sees dashboards:** ✅ Any authenticated Studio user today. Future: dedicated analytics modules so clients can see their own aggregated view without full Studio access.

### Sessions (experiences & courses — post-pilot)

These exist in the platform but are **out of pilot analytics scope** (standalone modules only for pilot):

- Experience sessions: pseudonymous id, optional name/email from forms, progress, outcomes
- Course sessions: progress, earned badges/certificates, learning-link flow (see §4)

### Form & mini-quiz

- **Forms** may collect PII (name, email, phone, etc.) — consent required before collection.
- **Mini-quiz** emits scores (`quiz.score`, `quiz.correctCount`, `quiz.scorePercent`) — not PII on their own.

**Decision 4 — Lawful basis for form PII:** Everything is consent-driven. The baseline is fully anonymised/pseudonymous data. Anything that goes beyond legitimate interest requires **explicit consent** before collection.

**Decision 5 — PII in analytics aggregates/exports:** Form/mini-quiz data is **not** excluded from aggregates or CSV exports by default. If a learner has consented to a form that collects their email, that data may flow into session outcomes and could appear in exports tied to a session id. Aggregates count events and labels — they do not publish a public directory of learners. If a future export could surface identifiable fields, use the export anonymisation options (§6) or restrict exports to aggregated rollups only. Mini-quiz scores alone are not PII.

**Decision 6 — Children / education contexts:** Some pilot work may touch education. Additional safeguards to consider (confirm with legal per client):

| Safeguard | Why it may matter |
|-----------|-------------------|
| **Age-appropriate consent** | Under Irish/EEA rules, children below a certain age cannot consent themselves — a parent, school, or institution may need to act as controller. |
| **Data minimisation** | Collect only what the learning activity needs; avoid optional marketing fields on school-facing pilots. |
| **No profiling for marketing** | Do not use children's activity data for ads or unrelated profiling. |
| **Clear school/client agreement** | Who is controller, who is processor, and who parents contact — should be explicit in the client contract. |
| **Retention limits** | Shorter retention may be expected for child-facing activities; 1-year default may need client-specific overrides. |
| **Access controls** | No per-learner roster or named exports in pilot; revisit before educator/class features ship. |

---

## 2. How long do we keep data?

**Decision 7 — Retention for privacy policy:** **1 year** is the proposed default across data types unless a client contract says otherwise.

| Data | Pilot retention (proposed) |
|------|--------------------------|
| Raw track events | 1 year |
| Experience / course sessions | 1 year from last activity |
| Learning-link email (if retained — see §4) | 1 year or until erasure request |
| Uploaded assets (`file:{uuid}`) | Until deleted in Studio or contract end |

**Action — Retention warnings:** Build a mechanism that warns the team before data is automatically purged (e.g. 30/14/7-day notices in Studio or ops channel). Not required for pilot launch but should follow soon after.

**Decision 8 — Deletion requests (DSAR) for pilot:** No formal SLA required for pilot. If someone asks to be forgotten, Real Nation removes the data **manually** in the backend — there is **no** self-service "delete my data" button for learners or clients in pilot.

**Decision 9 — Learning-link email on erasure:** Yes — delete if a learner requests erasure. Unlikely to come up often.

---

## 3. Lawful basis (Ireland / EEA)

Real Nation is based in **Ireland**, not the UK. Previous advice: **anonymous and pseudonymous analytics do not require consent** — e.g. how well someone scores on a jump game does not make them identifiable without additional data.

| Processing | Data | Pilot basis |
|------------|------|-------------|
| Analytics `track()` | Session ids, scores, event types | Pseudonymous — no consent required |
| Form fields | Name, email, etc. | **Explicit consent** before collection |
| Learning link email | Email address | Consent via acknowledgement checkbox (pilot) |
| Transactional email (Resend) | Email, link | Necessary to deliver what the learner asked for |

**Decision 10 — Consent before every `track()` call:** ❌ Not required for pseudonymous analytics under current Irish advice.

**Decision 11 — Learning-link checkbox vs full consent module:** ✅ Acknowledgement checkbox with privacy policy link is **sufficient for pilot**. Full consent module per client can follow post-pilot if needed.

**Decision 12 — UK-specific defaults:** N/A — work is isolated to the **Irish market**; no UK-specific `requireConsentBeforeTrack` default required.

---

## 4. Learning link (courses — product alignment)

**Approved learner-facing copy (pilot):**

> We'll use your email only to email you this learning link and reconnect your progress. We won't add you to marketing lists unless you opt in elsewhere.

**Decision 13:** ✅ Approved for pilot; refine during/after pilot as needed.

**Decision 14 — Data controller:** **Real Nation** is the data controller across the board (not individual clients).

**Product alignment note (action required):**

Leadership intent: the learning-link feature is for the learner to **send themselves the link** or **copy the link** — not to sign them up to a list. We may be misaligned with current implementation, which **stores email** on the course session and in a lookup index for resume.

| Option | Privacy impact |
|--------|----------------|
| **Copy link only** | No email stored; lowest friction for privacy |
| **Email me the link** | Email processed to send message; retention should be minimal or none after send unless needed for resume |

**Recommended pilot follow-up:** Offer **copy link** and **email link** as separate choices; if email is only used to send the message, avoid long-term retention of email unless resume-by-email is explicitly required and consented.

---

## 5. Third-party services (plain English)

We use external companies to run the platform. Personal data may pass through them.

### Resend (email)

**What this means:** When we email a learning link, Resend delivers the message. They are a **sub-processor** — a supplier that handles data on our behalf.

**Decision 15 — Is Resend OK for pilot?** ✅ Acceptable for pilot provided:

- Resend's terms allow transactional email use
- We can name Resend in our privacy policy as a sub-processor
- **Action:** Confirm Resend has a data-processing agreement (DPA) with Real Nation, or accept their standard terms if they act as processor. Legal to confirm in writing before scaling.

### Netlify (hosting & storage)

Hosts the site, runs APIs, stores blobs (configs, sessions, analytics logs).

**Decision 16 — Where must data stay?** Pilot clients should expect processing within the **EEA** (European Economic Area). Confirm Netlify region/settings match this expectation.

**Decision 17 — Standard Contractual Clauses (plain English):**

When data might be stored or processed in the **US** (or outside the EEA), EU law often requires a written safeguard — commonly **Standard Contractual Clauses (SCCs)**: pre-approved contract wording between us and the supplier saying they protect EU data to EU standards.

**Action for legal:** Confirm whether Netlify and Resend have SCCs (or equivalent) in place with Real Nation, and whether our Netlify plan uses EU-region storage. No action required from product beyond documenting suppliers in the privacy policy.

---

## 6. Reporting & exports

**Decision 18 — Pilot analytics scope:** ✅ **Aggregated only.** Pilot uses standalone modules — not flows or courses in analytics scope. No per-learner educator roster until separately approved and built.

| Surface | Pilot |
|---------|-------|
| Studio `/admin/analytics` | Aggregated counts |
| Per-learner educator view | Not in pilot |
| Public client dashboards | Future |

**Decision 19 — CSV export anonymisation:**

Exports from `/api/track-stats?format=csv` should offer **anonymisation levels** with clear guidance:

| Export mode | What it includes | When to use |
|-------------|------------------|-------------|
| **Aggregated rollup** (default) | Counts by event type, component, experience — no session ids | Client reporting, safest default |
| **Session-level** | Includes `sessionId` — still pseudonymous unless paired with identity elsewhere | Internal debugging, funnel analysis |
| **Full payload** (restricted) | May include form outcomes or other fields from event payloads | Internal only; never share externally without legal review |

**Action:** Add export mode selector to Studio analytics UI with short in-app guidance for each option. Pilot can ship with aggregated CSV; session-level modes can follow.

---

## 7. Client vs platform responsibilities

**Real Nation (platform):**

- Hosting, security, Studio auth
- Executing manual data deletion when instructed
- Default privacy copy templates
- Analytics ingest, retention, and purge execution

**Client:**

- First line for learner questions and erasure requests
- Privacy policy on their campaign pages
- Ensuring their form fields and copy match what they told learners

**Decision 20 — Contracts during pilot:**

Formal MSAs and data-processing schedules will be figured out **during the pilot**. Recommendations for legal to draft when ready:

| Topic | Recommendation |
|-------|----------------|
| **Roles** | Real Nation = **controller** for platform processing; client may be controller for their campaign content — clarify in each pilot SOW |
| **Processor terms** | Short DPA appendix listing sub-processors (Netlify, Resend) and purposes |
| **Retention** | 1-year default unless SOW states otherwise |
| **Erasure** | Client notifies Real Nation; Real Nation deletes within a reasonable period (e.g. 30 days) post-pilot |
| **Pilot limitation** | Standalone modules only; no guarantee on course/flow analytics until later phase |

**Decision 21 — Erasure requests:** **Client first line** → **Real Nation executes** removal in systems.

---

## 8. Sign-off checklist

| Item | Status |
|------|--------|
| Event set sufficient for pilot | ✅ Locked |
| Netlify Blobs storage for pilot | ✅ Locked |
| 1-year retention default | ✅ Proposed — publish in privacy policy |
| Retention expiry warnings | ⏳ Build post-pilot |
| Learning link copy | ✅ Approved |
| Learning link product alignment (copy vs email retention) | ⏳ Engineering follow-up |
| Pseudonymous analytics without consent | ✅ Locked (Irish advice) |
| Form PII requires explicit consent | ✅ Locked |
| Resend / Netlify sub-processor check | ⏳ Legal to confirm |
| EEA processing expectation | ✅ Locked |
| Aggregated analytics only for pilot | ✅ Locked |
| CSV export anonymisation modes | ⏳ Engineering follow-up |
| Pilot MSA / DPA template | ⏳ Legal during pilot |

| Role | Name | Date | Approved |
|------|------|------|----------|
| Leadership | | | |
| Legal / DPO | | | |
| Product | | | |

---

*This document records internal decisions. It is not legal advice. Legal should confirm items marked for their review before production scale.*
