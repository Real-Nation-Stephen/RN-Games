# ESB Pilot Compliance Handbook

**Purpose:** Operational handbook for the ESB (and equivalent controlled) pilot. Usable by a PM without reading the source memos.  
**Status:** Pilot — manual process with advisory platform tools  
**Last updated:** July 2026  
**Linked spec:** [FUTURE_COMPLIANCE_WORKFLOW_SPECIFICATION.md](./FUTURE_COMPLIANCE_WORKFLOW_SPECIFICATION.md)  
**Platform tools:** Studio → Course/Flow editor → **Measurement & Reporting** (collapsed panel)

> **Pilot honesty:** Compliance output is an **Indicative Assessment (Advisory Pilot)**. It supports decisions and documentation; it is **not** legal approval, WCAG certification, or a publish gate.

---

## 1. Who does what

| Role | Owner (fill in) | Responsibilities in this pilot |
|------|-----------------|--------------------------------|
| **RN — Project Manager** | | Scope, timeline, launch checklist, evidence pack, client comms |
| **RN — Delivery / Studio** | | Build deployment, M&R settings, generate platform docs, technical fixes |
| **RN — Platform administrator** | | Studio access, secrets, staging vs production, incident first response |
| **RN — Retention / deletion owner** | | Calendar deletion date, manual purge execution, verification record |
| **RN — Security sign-off** | | Pre-launch security checklist |
| **RN — Accessibility sign-off** | | Pre-launch accessibility checklist + exceptions register |
| **Client (ESB)** | | Purpose confirmation, audience context, report audience, client-facing wording approval |
| **Legal / compliance reviewer** | | Lawful basis, privacy page wording, children/safeguarding, high-risk exceptions |
| **Platform (automated)** | — | Inventory scan, effective field profile, indicative compliance status, draft privacy text |

**Rule:** Anything marked **Legal** or **Client** must not be inferred by the platform alone.

---

## 2. Before you build — lock these decisions

Complete **§2.1 Deployment decision record** before development starts. Update if scope changes.

### 2.1 Deployment decision record

| Field | Completed by | Value (ESB pilot) |
|-------|--------------|-------------------|
| Deployment name | RN PM | |
| Deployment type | RN PM | ☐ Standalone component ☐ Simple Flow ☐ Course |
| Public URL(s) | RN Delivery | |
| Staging URL | RN Platform admin | |
| Programme purpose (why this exists) | RN PM + **Client** | |
| Primary audience (age, context) | RN PM + **Client** | |
| Children / education context? | RN PM + **Legal** | ☐ No ☐ Yes — notes: |
| Personal data required for programme to work? | RN PM + **Legal** | ☐ No ☐ Yes — what: |
| Lawful basis (if personal data) | **Legal** | ☐ Consent ☐ Contract ☐ Legitimate interest ☐ Other: |
| Data controller | **Legal** | Default: Real Nation (confirm per contract) |
| Data processor(s) | **Legal** | Netlify, Resend (if learning link), Google Sheets (if wheel reporting) |
| Report audience | RN PM + **Client** | ☐ RN internal only ☐ Client aggregate ☐ Public aggregate |
| Identifiable data in reports? | RN PM + **Legal** | ☐ No (default) ☐ Yes — approved by: |
| Retention period (days) | RN PM + **Legal** | Default pilot: **365** — agreed: |
| Deletion owner | RN PM | Name: |
| Scheduled deletion date | RN PM | Date: |
| Incident contact (first) | RN Platform admin | Name / contact: |
| Client escalation contact | RN PM | Name / contact: |

### 2.2 Component subset (ESB)

Only include components that have passed end-to-end QA. Record each instance:

| Component type | Instance title | Slug / ID | In flow? | In course? | Notes |
|----------------|----------------|-----------|----------|------------|-------|
| | | | | | |

**Known embedding limits (platform):** Play-Along Quiz, Pin board, and Leaderboard are **not** embeddable in Flow/Course today.

---

## 3. Platform configuration (RN Delivery)

These are set in Studio; the platform **infers** inventory and draft docs from them.

| Setting | Where | Who sets | Pilot default |
|---------|-------|----------|---------------|
| Tracking enabled | M&R → Measurement | RN Delivery | On |
| Collection mode | M&R → Measurement | RN Delivery | Standard |
| Retention (days) | M&R → Measurement | RN Delivery | 365 |
| Exclude preview traffic | M&R → Measurement | RN Delivery | On |
| Reporting enabled | M&R → Measurement | RN PM | As agreed §2.1 |
| Public aggregate only | M&R → Measurement | RN PM | **On** unless Legal approves otherwise |
| Refresh scan | M&R → Measurement | RN Delivery | After every material config change |
| Generate privacy docs | M&R → Compliance | RN Delivery | Before legal review |
| Re-scan compliance | M&R → Compliance | RN Delivery | Before launch |

**Do not treat generated privacy text as final.** Route to **Legal** (see §6).

---

## 4. Required evidence pack

File one folder per deployment: `ESB-Pilot-{date}/`

| # | Evidence | Completed by | File name (suggested) | Done |
|---|----------|--------------|----------------------|------|
| E1 | Deployment decision record (§2.1) | RN PM | `01-deployment-decisions.pdf` | ☐ |
| E2 | Component subset table (§2.2) | RN PM | `02-component-subset.pdf` | ☐ |
| E3 | Platform generated privacy page (draft) | Platform → RN Delivery | `03-privacy-page-draft.md` | ☐ |
| E4 | Platform generated website snippet (draft) | Platform → RN Delivery | `04-website-snippet.txt` | ☐ |
| E5 | Platform generated compliance checklist | Platform → RN Delivery | `05-compliance-checklist.md` | ☐ |
| E6 | Legal review of privacy wording | **Legal** | `06-legal-privacy-signoff.pdf` | ☐ |
| E7 | Client approval of purpose & reports | **Client** | `07-client-approval.pdf` | ☐ |
| E8 | Security pre-launch checklist (§5.1) | RN Security sign-off | `08-security-checklist.pdf` | ☐ |
| E9 | Accessibility pre-launch checklist (§5.2) | RN A11y sign-off | `09-accessibility-checklist.pdf` | ☐ |
| E10 | Accessibility exceptions register (§5.3) | RN A11y sign-off | `10-a11y-exceptions.pdf` | ☐ |
| E11 | Deployment security record (§5.4) | RN PM | `11-security-record.pdf` | ☐ |
| E12 | Deployment accessibility record (§5.5) | RN PM | `11a-accessibility-record.pdf` | ☐ |
| E13 | Retention deletion plan | RN Deletion owner | `12-retention-deletion-plan.pdf` | ☐ |
| E14 | Incident route (one-pager) | RN Platform admin | `13-incident-route.pdf` | ☐ |
| E15 | Launch sign-off (§7) | RN PM | `14-launch-signoff.pdf` | ☐ |
| E16 | Known limitations statement (§8) | RN PM | `15-known-limitations.pdf` | ☐ |

---

## 5. Launch checklists

### 5.1 Security pre-launch checklist

**Owner:** RN Security sign-off · **Before:** production go-live

| # | Check | Pass | Owner | Notes |
|---|-------|------|-------|-------|
| S1 | Production and staging are separate Netlify sites with separate secrets | ☐ | Platform admin | |
| S2 | Studio APIs reject unauthenticated access | ☐ | Delivery | |
| S3 | Verified authentication path in use (no decode-only JWT trust) | ☐ | Delivery | |
| S4 | Rate limits on public write endpoints in scope | ☐ | Delivery | track, session, forms, etc. |
| S5 | No default moderator PIN (`1234`) on live deployment | ☐ | Delivery | |
| S6 | Preview/test traffic excluded from reporting | ☐ | Delivery | M&R setting |
| S7 | Upload paths reviewed if UGC in scope | ☐ | Delivery | Pin board only if used |
| S8 | Secrets inventory documented; rotation path exists | ☐ | Platform admin | |
| S9 | Manual retention deletion owner and date set | ☐ | PM | |
| S10 | Incident route filed (E14) | ☐ | Platform admin | |
| S11 | Client reports do not expose internal IDs beyond agreed purpose | ☐ | PM | |
| S12 | No unresolved **critical** security defect | ☐ | Security sign-off | |

### 5.2 Accessibility pre-launch checklist

**Target:** WCAG 2.2 AA for **conventional public HTML** in the pilot path (forms, landing, course shell, mini-quiz, consent, email-signup). **Documented exceptions** for arcade/canvas if present.

**Owner:** RN Accessibility sign-off

| # | Check | Pass | Tester | Notes |
|---|-------|------|--------|-------|
| A1 | Pilot scope and component list match §2.2 | ☐ | PM | |
| A2 | Keyboard-only path through enrolment → progress → submit → exit | ☐ | QA | |
| A3 | Visible focus order logical on conventional pages | ☐ | QA | |
| A4 | Form labels, required states, errors understandable (+ SR spot check) | ☐ | QA | |
| A5 | Contrast checked on **final client branding** (AA) | ☐ | Design | |
| A6 | 200% zoom usable on conventional pages | ☐ | QA | |
| A7 | `prefers-reduced-motion` respected on animated steps | ☐ | QA | |
| A8 | Informative images have alt text; required AV has captions/transcript plan | ☐ | Design | |
| A9 | No essential journey blocked **only** by orientation gate | ☐ | QA | |
| A10 | axe (or equivalent) scan on page-module routes — critical issues resolved | ☐ | QA | |
| A11 | Exceptions register complete for any game/canvas steps | ☐ | A11y sign-off | |
| A12 | Client-facing accessibility wording agreed | ☐ | PM + **Client** | |

### 5.3 Accessibility exceptions register (if needed)

| Component / step | Barrier | Alternative route | Client informed? | Signed off by |
|------------------|---------|-------------------|------------------|---------------|
| | | | ☐ | |

### 5.4 Deployment security record

| Field | Value |
|-------|-------|
| Live URL | |
| Staging URL | |
| Deployment owner | |
| Technical owner | |
| Access model | ☐ Public ☐ Unlisted link ☐ Class code ☐ Other |
| Personal data collected | ☐ None ☐ Email ☐ Name ☐ Form/survey ☐ Other |
| Uploads / UGC | ☐ None ☐ Designer only ☐ Participant upload |
| Leaderboard / live rooms | ☐ None ☐ Leaderboard ☐ Quiz room |
| Report audience | |
| Third-party services | Netlify, Resend, Sheets (strike if N/A) |
| Security check date | |
| Sign-off name | |

### 5.5 Deployment accessibility record

| Field | Value |
|-------|-------|
| Tested browsers/devices | |
| Target standard | WCAG 2.2 AA (conventional UI) + exceptions |
| Keyboard/focus result | ☐ Pass ☐ Pass with exceptions |
| Contrast result | ☐ Pass ☐ Fail — mitigations |
| Zoom / reduced motion | ☐ Pass |
| Media / alt text status | |
| Known barriers | |
| Test date | |
| Sign-off name | |

---

## 6. Legal and client sign-off

### 6.1 Legal review (required if personal data)

| Item | Legal outcome | Date | Initials |
|------|---------------|------|----------|
| Generated privacy page (E3) approved or amended | ☐ Approved ☐ Amended — use version: | | |
| Website snippet (E4) approved for client site | ☐ Yes ☐ No | | |
| Lawful basis recorded (§2.1) | ☐ Confirmed | | |
| Children / education safeguards adequate | ☐ N/A ☐ Confirmed ☐ Further action | | |
| High-risk compliance findings reviewed | ☐ N/A ☐ Accepted ☐ Mitigated | | |

### 6.2 Client sign-off

| Item | Client outcome | Date | Name |
|------|----------------|------|------|
| Programme purpose and audience | ☐ Confirmed | | |
| Report content and audience | ☐ Confirmed | | |
| Privacy / learning-link wording (if shown to learners) | ☐ Confirmed | | |
| Known limitations (games, retention manual) | ☐ Acknowledged | | |

---

## 7. Launch sign-off record

**No launch without:** E1, E6 (if PII), E7, E8, E9, E11, E13, E14, E15.

| Role | Name | Date | Signature / approval |
|------|------|------|----------------------|
| RN PM | | | ☐ |
| RN Delivery lead | | | ☐ |
| Legal (if PII) | | | ☐ |
| Client programme owner | | | ☐ |

**Launch date:** _______________  
**Production URL:** _______________

---

## 8. What we can and cannot say (client-facing)

**Appropriate**

- Hosted on managed infrastructure with HTTPS and authenticated Studio access.
- Data collection is configured per deployment and should be minimised.
- The pilot was reviewed using RN checklists for security and accessibility.
- Aggregate reporting is the default; identifiable reporting requires explicit agreement.
- Retention is configured in the platform; **deletion is executed operationally** until automation ships.
- Compliance scan is **advisory**; privacy text was **legally reviewed** where personal data is collected.

**Avoid**

- “Fully GDPR compliant” or “WCAG certified platform.”
- “Automatically deleted after retention period” (until purge jobs live).
- “Impossible to hack” or “enterprise certified.”
- “Unique learners” when metrics are session-based.
- Platform-wide claims from a single-deployment pilot test.

---

## 9. After launch

| Action | When | Owner |
|--------|------|-------|
| Monitor indicative compliance status after config changes | Ongoing | Delivery |
| Re-run M&R scan + regenerate docs if components/fields change | On change | Delivery |
| Execute manual deletion on scheduled date | Retention date | Deletion owner |
| File deletion verification | Within 7 days of purge | Deletion owner |
| Pilot close-out report | End of pilot | PM |
| Review → productise manual steps | After pilot | Leadership |

---

## 10. Engineering support (reference)

Pilot hardening engineering is tracked separately. **One run ≈ 1–2 hours focused Cursor development** (excludes human testing and legal review).

See [FUTURE_COMPLIANCE_WORKFLOW_SPECIFICATION.md §8](./FUTURE_COMPLIANCE_WORKFLOW_SPECIFICATION.md#8-implementation-runs-pilot-hardening) for run breakdown.

PM action: confirm P0 security and accessibility engineering runs are scheduled **before** launch sign-off (§7).

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | Jul 2026 | Initial ESB pilot handbook |
