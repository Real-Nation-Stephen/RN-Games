# Future Compliance Workflow Specification

**Purpose:** Define how the manual [ESB Pilot Compliance Handbook](./ESB_PILOT_COMPLIANCE_HANDBOOK.md) becomes a structured deployment questionnaire and automated compliance workflow.  
**Status:** Specification for post-pilot productisation  
**Last updated:** July 2026  
**Depends on:** [1. TRACKING_MEASUREMENT_SPECIFICATION.md](./1.%20TRACKING_MEASUREMENT_SPECIFICATION.md), [2. REPORTING_COMPONENT_SPECIFICATION.md](./2.%20REPORTING_COMPONENT_SPECIFICATION.md), [3. COMPLIANCE_COMPONENT_SPECIFICATION.md](./3.%20COMPLIANCE_COMPONENT_SPECIFICATION.md)  
**Current implementation:** `netlify/functions/lib/compliance-scan.mjs`, `compliance-docs.mjs`, `deployment-measurement.mjs`, `deployment-scan.mjs`

---

## 1. Relationship to the pilot handbook

| Pilot (manual) | Future (productised) |
|----------------|----------------------|
| PDF/MD evidence pack (§4 handbook) | Deployment compliance record in platform + export |
| PM fills decision record in doc | Structured questionnaire in Studio |
| Platform generates draft privacy text | Versioned hosted privacy page with approval state |
| Legal reviews exported MD | Legal approval workflow + immutable published version |
| Manual launch checklists | Checklist UI with pass/fail + attachments |
| Advisory scan only | Scan + publish gate + override audit |
| Manual retention deletion | Scheduled purge jobs + overdue alerts |

**Pilot constraint (current code):** `blocksPublish: false` on all findings; `advisoryPilot: true` on generated documents.

---

## 2. Workflow overview

```text
┌─────────────────────────────────────────────────────────────────┐
│ 1. QUESTIONNAIRE (PM / Client / Legal fields)                   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. DEPLOYMENT SCAN (platform-inferred facts)                    │
│    components · fields · events · effective M&R profile          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RULE ENGINE (deterministic findings + status)                │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DOCUMENT GENERATION (draft outputs)                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. REVIEW STAGES (human approval — never auto-approved)         │
│    Delivery → Legal → Client (where required) → Publish         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. PUBLISH + VERSION SNAPSHOT + AUDIT LOG                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Deployment questionnaire

### 3.1 Fields entered by PM / RN

| Field ID | Label | Required | Used for |
|----------|-------|----------|----------|
| `purpose` | Programme / deployment purpose | Yes | Privacy page, client summary, DPIA threshold |
| `audienceDescription` | Primary audience | Yes | Safeguarding rules, children checks |
| `childrenContext` | Involves children / education | Yes | `CHILD_EMAIL_001`, safeguarding pack |
| `jurisdiction` | Primary jurisdiction | Yes | Rule packs (future), legal templates |
| `reportAudience` | Who sees reports | Yes | `PUBLIC_REPORT_NAME_001`, export policy |
| `publicSurface` | Public / unlisted / authenticated | Yes | Exposure rules |
| `incidentContact` | RN incident contact | Yes | Ops record |
| `deploymentOwner` | RN PM owner | Yes | Audit, retention |
| `deletionOwner` | Retention deletion owner | Yes | Purge ops |
| `launchDate` | Planned go-live | No | Checklist scheduling |
| `clientName` | Client organisation | Yes | Docs, controller block |
| `projectCode` | Internal project code | No | Index metadata |
| `notes` | Internal delivery notes | No | Audit |

*Partially exists today as `clientName`, `projectCode`, `designCode` on Course/Flow records — extend with compliance block.*

### 3.2 Fields entered by Client

| Field ID | Label | Required | Used for |
|----------|-------|----------|----------|
| `clientPurposeConfirm` | Client confirms programme purpose | Yes (pilot+) | Client summary sign-off |
| `clientReportAudienceConfirm` | Client confirms report audience | Yes | Reporting exposure |
| `clientPrivacyWordingConfirm` | Client approves learner-facing privacy copy | If PII | Publish gate |
| `clientAccessibilityAck` | Client acknowledges documented limitations | If exceptions | A11y register |
| `clientEscalationContact` | Client data/privacy contact | If PII | Privacy page, DSAR routing |

*Pilot: captured in handbook §6.2; future: Client portal or signed PDF upload linked to deployment.*

### 3.3 Fields entered by Legal

| Field ID | Label | Required | Used for |
|----------|-------|----------|----------|
| `lawfulBasis` | Lawful basis for personal processing | If PII | Privacy page, checklist |
| `controllerEntity` | Data controller legal entity | Yes | Privacy page header |
| `processorEntities` | Sub-processors list | Yes | Privacy page |
| `dpoContact` | Privacy / DPO contact | If PII | Privacy page |
| `privacyPageLegalApproval` | Legal approval of hosted privacy text | If PII | Publish gate |
| `approvedPrivacyVersionId` | Version ID legal approved | If PII | Immutable publish |
| `highRiskException` | Documented exception for blocking finding | Rare | Override audit |
| `retentionLegalConfirm` | Retention period legally adequate | If PII | Retention enforcement |

*Pilot: handbook §6.1; future: Legal role in Studio with approval action.*

### 3.4 Fields automatically inferred by platform

| Field ID | Source | Spec reference |
|----------|--------|----------------|
| `deploymentId` | `dep_{kind}_{recordId}` | Measurement §deployment context |
| `deploymentKind` | course \| flow \| component | Measurement |
| `componentInventory` | `scanDeployment()` | Compliance §2.2 |
| `effectiveFields` | `resolveEffectiveMeasurementJs()` | Measurement §effective profile |
| `collectsPersonalData` | Field detection + component types | Compliance docs logic |
| `collectsPseudonymousData` | Effective profile | Measurement data classes |
| `enabledEvents` | Component metadata registry | Measurement registry |
| `retentionDaysConfigured` | `measurement.retention.defaultDays` | Measurement |
| `trackingEnabled` | `measurement.trackingEnabled` | Measurement |
| `reportingEnabled` | `measurement.reporting.enabled` | Reporting |
| `publicAggregateOnly` | `measurement.reporting.publicAggregateOnly` | Reporting §public exposure |
| `excludePreviewTraffic` | `measurement.excludePreviewTraffic` | Reporting |
| `collectionMode` | minimal \| standard \| diagnostic | Measurement |
| `hasEmailCollection` | Form/email-signup scan | `compliance-scan.mjs` |
| `hasFreeText` | Form field types | `FORM_FREE_TEXT_001` |
| `hasLeaderboard` | Component inventory | `LEADERBOARD_REAL_NAME_001` |
| `hasPinboardPhotos` | Pinboard config | `PHOTO_PUBLIC_001` |
| `hasCertificateOrBadge` | Component inventory | Personal merge fields |
| `metadataComplete` | Registry coverage | `METADATA_GAP_001` |
| `complianceFindings` | `runComplianceScan()` | Compliance §8 |
| `complianceStatus` | `calculateComplianceStatus()` | Compliance §9 |
| `scanTimestamp` | Server time | Stale detection |
| `configHash` | Hash of scanned config | Re-review triggers |

*Must not ask PM to re-enter detected fields (Compliance spec §1, §10).*

---

## 4. Generated outputs

| Output | Current (pilot) | Future | Publish behaviour |
|--------|-----------------|--------|-------------------|
| **Hosted privacy page** | Markdown in API response | Stable URL `/privacy/{deployment}` | New version on publish; prior versions archived |
| **Website snippet** | Short text block | Client CMS copy block | Tied to approved privacy version |
| **Compliance checklist** | Markdown with findings | Interactive checklist + export | Snapshot on publish |
| **Client summary** | Plain text | PDF/email pack | On approval |
| **Indicative status label** | UI + checklist header | Dashboard badge | Advisory until legal approval recorded |
| **Effective field table** | M&R Measurement tab | Same + API | Read-only inferred |
| **Headline metrics** | M&R Reporting tab | + client report links | Reporting spec §dashboards |
| **Launch checklists** | External handbook | In-product checklist module | Manual sign-off → audit log |
| **Exceptions register** | External PDF | Linked to deployment | A11y + compliance exceptions |

---

## 5. Review and approval stages

| Stage | Actor | Entry criteria | Exit criteria | Auto-approved? |
|-------|-------|----------------|---------------|----------------|
| **1. Draft configuration** | RN Delivery | Deployment exists | Scan runs without error | — |
| **2. Questionnaire complete** | RN PM | Required PM fields filled | All required PM/client fields valid | **No** |
| **3. Indicative scan reviewed** | RN Delivery | Scan + docs generated | Findings acknowledged or mitigated | **No** |
| **4. Legal review** | Legal | Personal data OR high-risk finding | `privacyPageLegalApproval` + version ID | **No** |
| **5. Client confirmation** | Client | Pre-launch | Purpose, reports, wording confirmed | **No** |
| **6. Security checklist** | Security owner | P0 controls in place | Checklist passed | **No** |
| **7. Accessibility checklist** | A11y owner | Pilot path tested | Checklist + exceptions filed | **No** |
| **8. Publish approval** | Authorised publisher | Stages 2–7 complete | Publish action | **No** |

**Pilot:** Stages 1–3 partially in product; 4–8 are handbook/manual.

**Future publish gate (Compliance spec §9.3):**

| Status | Publish behaviour |
|--------|-------------------|
| Ready | Allowed |
| Ready with recommendations | Allowed with warnings |
| Review required | Blocked unless authorised override |
| High Risk | Blocked; compliance admin override only for overridable rules |

**Non-overridable (spec §9.3):** missing privacy page with public PII; public identifiable reports; missing retention for retained personal data; child-linked public media without review; missing metadata contract.

---

## 6. Versioning and audit requirements

### 6.1 Configuration versioning

| Artifact | Version trigger | Retention |
|----------|-----------------|-----------|
| Published deployment config | Each publish | Full history |
| Measurement profile | Publish + M&R change | Diff vs previous |
| Compliance scan result | Each scan | Immutable scan record |
| Generated privacy page | Each generation | Draft vs published separation |
| Approved privacy page | Legal approval | Immutable; new version on re-approval |
| Override record | Each override | Permanent (spec §6.4) |
| Checklist sign-off | Each launch | 7 years ops default (policy TBD) |

### 6.2 Audit log events (future)

| Event | Actor | Payload |
|-------|-------|---------|
| `compliance.scan` | system | findings, status, configHash |
| `compliance.docs.generated` | user | output types, generatedAt |
| `compliance.legal.approved` | legal | privacyVersionId |
| `compliance.client.approved` | client | scope |
| `compliance.override` | admin | ruleId, reason, finding snapshot |
| `compliance.publish.blocked` | system | status, blocking rules |
| `measurement.changed` | user | field diff |
| `retention.purge.scheduled` | system | due date, counts |
| `retention.purge.executed` | system / ops | deleted counts, verification |
| `security.checklist.completed` | user | checklist version, pass/fail |
| `accessibility.checklist.completed` | user | exceptions linked |

*Pilot: git + evidence folder only.*

### 6.3 Stale assessment (Compliance spec §9.4)

Display **“Status unavailable — rescan required”** when:

- `configHash` changes after last scan;
- questionnaire answers material to rules change;
- component added/removed;
- M&R retention or reporting toggles change;
- legal-approved privacy version predates current config hash.

Stale **Ready** must not permit publish.

---

## 7. Re-review triggers

| Trigger | Rescan | Regenerate docs | Legal re-review | Client re-review |
|---------|--------|-----------------|-----------------|------------------|
| Add/remove component | Yes | Yes | If PII impact | If audience impact |
| Form field added/changed | Yes | Yes | Yes | Maybe |
| Email signup / learning link change | Yes | Yes | Yes | Yes |
| Retention days changed | Yes | Yes | Yes | Maybe |
| Reporting enabled or public aggregate off | Yes | Yes | Yes | Yes |
| Leaderboard / pinboard added | Yes | Yes | Yes | Maybe |
| Children context flag set | Yes | Yes | Yes | Yes |
| Lawful basis or controller change | No | Yes | Yes | Yes |
| Branding-only change | No | No | No | No |
| A11y exception added | No | No | No | Maybe |
| Security incident | Ops | Maybe | Maybe | Yes |

---

## 8. What remains advisory vs automatically approved

| Item | Pilot | Future default |
|------|-------|----------------|
| Indicative compliance status | **Advisory** | Advisory until legal stage complete |
| Generated privacy page text | **Draft — not legal truth** | Published only after legal approval |
| Website snippet | **Draft** | Published with privacy version |
| Lawful basis | **Human / Legal** | Never auto-determined |
| Purpose statement | **Human / PM + Client** | Questionnaire required |
| WCAG conformance claim | **Human / QA** | Checklist sign-off, not scan alone |
| Security “safe to launch” | **Human / Security owner** | Checklist + P0 controls |
| Retention adequacy | **Human / Legal** | Config + legal confirm |
| Override justification | N/A (no overrides) | **Human / Compliance admin** |
| Purge completion | **Manual ops** | System job + human verification |
| Metric labels (“sessions” not “learners”) | **Platform enforced** | Auto |
| Field inventory / effective profile | **Platform inferred** | Auto |
| Rule findings (deterministic) | **Platform inferred** | Auto — but overridable per spec |

**Never automatically approved:** legal wording, lawful basis, client-facing compliance claims, children's safeguards, high-risk exceptions, publish decision.

---

## 9. Current generated GDPR / privacy text blocks

*Source: `netlify/functions/lib/compliance-docs.mjs` (commit baseline July 2026). Submit templates below to legal for amendment; implementation uses exact logic described.*

### 9.1 Master branch condition: personal data processing

**Variable:** `hasPersonal` (= `deploymentProcessesPersonalData(deployment, effective)`)

**`hasPersonal` is TRUE if any of:**

1. **Configured personal fields** — `effective.fields` contains an entry where:
   - `dataClass` is `personal` or `pseudonymous`, AND
   - `reason` is **not** `"Not enabled in component configuration."`

2. **Email collection detected** — any scanned component where:
   - `componentType === "email-signup"`, OR
   - `componentType === "form"` AND `config.fields` includes a field with `type === "email"` OR `id === "email"` OR label contains `"email"` (case-insensitive)

3. **Component presence** — any scanned component with `componentType` in:
   - `leaderboard`, `certificate`, `pinboard`

**`hasPersonal` is FALSE if none of the above.**

---

### 9.2 Block A — Website snippet (personal data)

**Condition:** `hasPersonal === true`

**Template (dynamic field list):**

```text
This experience may process personal data including: {fieldIds}. See the hosted privacy page for details.
```

- `{fieldIds}` = comma-separated `fieldId` from `getConfiguredPersonalFields(effective)`
- **Fallback** if no configured fields but `hasPersonal` still true (e.g. leaderboard only):  
  `"names, email addresses, or survey responses"`

---

### 9.3 Block B — Website snippet (no personal data)

**Condition:** `hasPersonal === false`

**Fixed text:**

```text
This experience is configured not to collect personal or pseudonymous data beyond operational session identifiers.
```

---

### 9.4 Block C — Privacy page (no personal data)

**Condition:** `hasPersonal === false`

**Template:**

```markdown
# Privacy notice — {deployment.title}

{DISCLAIMER}

**Generated:** {generatedAt}  
**Deployment:** {deployment.slug} ({deployment.kind})

## Confirmed no-personal-data processing (configuration-based)

Based on the current deployment configuration scan, this deployment is **not configured to collect personal or pseudonymous data** such as names, email addresses, or free-text responses identifiable to an individual.

Operational session identifiers may still be used to maintain progress within a session. These are not presented as a general-purpose participant identity in reports.

If you change form fields, email collection, or other component settings, regenerate this document.
```

**`DISCLAIMER` (all generated docs):**

```text
This document is generated from platform configuration facts detected at the time of generation. It does not constitute legal advice. A qualified privacy professional should review before publication.
```

---

### 9.5 Block D — Privacy page (personal data)

**Condition:** `hasPersonal === true`

**Field list section** — for each entry in `getConfiguredPersonalFields(effective)`:

```markdown
- **{fieldId}** ({dataClass}) — from {componentType} (“{title}” if present): {reason}
```

**Fallback** if `collectedFields` empty but `hasPersonal` true:

```markdown
- Personal or survey data may be collected via forms, email signup, or participant-entered names. Review component configuration for details.
```

**Full template:**

```markdown
# Privacy notice — {deployment.title}

{DISCLAIMER}

**Generated:** {generatedAt}  
**Deployment:** {deployment.slug} ({deployment.kind})

## What this deployment may process

The platform detected the following data categories in the current configuration:

{fieldLines}

## Retention

Default retention period: {retentionDays} days.
```

- `{retentionDays}` = `deployment.measurement.retention.defaultDays` OR string `"not configured"` if missing

```markdown
## Reporting

Public aggregate-only reporting: {enabled|disabled} by default.
```

- `enabled` when `deployment.measurement.reporting.publicAggregateOnly !== false`

```markdown
## Your rights

Contact the deployment administrator for access, correction, or deletion requests relating to your data.
```

**Legal gap (future questionnaire):** controller identity, DPO contact, lawful basis, processor list, jurisdiction — required by Compliance spec §10.1 but **not in current templates**.

---

### 9.6 Block E — Compliance checklist header

**Always generated** (both branches)

```markdown
# Compliance checklist (indicative) — {deployment.title}

{DISCLAIMER}

**Status:** {complianceStatus.label}
**Generated:** {generatedAt}

## Findings

{findings list — excludes severity "expected"}
```

Each finding:

```markdown
- [ ] **{ruleId}** ({severity}): {message}
  - Recommendation: {recommendation}   # if present
```

**Footer (pilot):**

```markdown
## Note

Publish blocking, override audit and purge enforcement are not active in this advisory pilot.
```

---

### 9.7 Block F — Client summary

**Always generated**

```text
Client summary — {deployment.title}
Generated: {generatedAt}
Indicative status: {complianceStatus.label}
Personal data in configuration: {yes|no}
This is an indicative assessment only, not a compliance certification.
```

---

### 9.8 Compliance scan rules → findings (configuration triggers)

| Rule ID | Severity | Trigger condition |
|---------|----------|-------------------|
| `CHILD_EMAIL_001` | warning | `context.childrenEnabled` AND email collection detected |
| `METADATA_GAP_001` | review_required | Component lacks metadata OR unknown `componentType` |
| `NO_PRIVACY_PAGE_001` | high_risk | Personal data + `!context.privacyPageConfigured` |
| `RETENTION_MISSING_001` | high_risk | Personal data + no `measurement.retention.defaultDays` |
| `LEADERBOARD_REAL_NAME_001` | recommendation | Any `leaderboard` component |
| `PHOTO_PUBLIC_001` | review_required | Pinboard with `mobile.guestSubmit.allowPhotos` |
| `EMAIL_SIGNUP_OPTIN_002` | high_risk | Email-signup without consent items/items/consentRequired+consentText |
| `FORM_FREE_TEXT_001` | recommendation | Form with `textarea` or `text` field |
| `PUBLIC_REPORT_NAME_001` | high_risk | Reporting enabled AND NOT `publicAggregateOnly` |
| `NO_PERSONAL_DATA_001` | expected | No personal data detected (informational) |

**Status calculation:**

| Label | Condition |
|-------|-----------|
| Review Required (Indicative) | Any `high_risk` OR `review_required` finding |
| Ready with Recommendations (Indicative) | Warnings/recommendations only |
| Ready (Indicative) | No active findings |

---

## 10. Alignment with specifications

### 10.1 Tracking & Measurement spec

| Spec requirement | Pilot | Future workflow |
|------------------|-------|-----------------|
| Define once, reuse everywhere | Registry + effective profile | Questionnaire does not duplicate field inventory |
| Collect vs report vs retain | M&R panel | Enforced at publish |
| Deployment context on events | Course/flow shell events shipped | Full envelope on all events |
| Data minimisation default | `collectionMode: standard` | Diagnostic requires justification |
| Retention hooks | Days configured | Purge jobs + warnings (spec + Reporting §retention) |

### 10.2 Reporting spec

| Spec requirement | Pilot | Future workflow |
|------------------|-------|-----------------|
| Aggregate default | `publicAggregateOnly` default true | Publish block if off without approval |
| Sessions not labelled learners | Metric labelling in M&R | Enforced in UI |
| Compliance status in reports | Not in client reports yet | Reporting §compliance panel |
| Export personal data | Studio JWT only | Role-based export + anonymise option |

### 10.3 Compliance spec

| Spec requirement | Pilot | Future workflow |
|------------------|-------|-----------------|
| Deterministic scan | Shipped (subset of rules) | Full rule library |
| Generated docs | Shipped (Blocks A–F) | + hosted URL, versioning |
| Publish blocking | **Deferred** | §9.3 |
| Override audit | **Deferred** | §6.4, §11 |
| Legal fields on privacy page | **Gap** | Questionnaire §3.3 |
| Accessibility validation | Handbook manual | Spec §15.2 productised |

---

## 11. Implementation runs — pilot hardening

**Definition:** One **run** ≈ **1–2 hours** of focused Cursor development, excluding human testing, legal review, and client sign-off.

### 11.1 P0 — Before live pilot (security)

| Run | Work package | Deliverable | Est. runs |
|-----|--------------|-------------|-----------|
| SEC-1 | Public endpoint rate limiting (`/api/track`, session APIs, form/pinboard/quiz as in scope) | Throttled writes; 429 responses | 1–2 |
| SEC-2 | Authentication hardening — verified Identity path; reject unverified JWT | Single auth path documented | 1 |
| SEC-3 | Staging environment documentation + Netlify site split | Separate URLs/secrets checklist | 0.5–1 |
| SEC-4 | Studio guard on weak moderator PIN / host defaults | Warning or block on publish config | 1 |
| **Subtotal** | | | **3.5–5 runs** |

### 11.2 P0 — Before live pilot (accessibility)

| Run | Work package | Deliverable | Est. runs |
|-----|--------------|-------------|-----------|
| A11Y-1 | Pilot path keyboard/focus fixes (course shell, forms, landing) | Defect fixes from QA | 1–2 |
| A11Y-2 | Form error `aria-live` + focus on error | Accessible validation | 1 |
| A11Y-3 | Contrast / zoom fixes on ESB branding (if QA fails) | CSS/token adjustments | 0–1 |
| **Subtotal** | | | **2–4 runs** |

### 11.3 P0 — Measurement / compliance verification

| Run | Work package | Deliverable | Est. runs |
|-----|--------------|-------------|-----------|
| M-1 | DB ingest verification + replay smoke test | Evidence for E5/E metrics | 0.5 |
| M-2 | Field detection edge cases on ESB components | Accurate effective profile | 0–1 |
| **Subtotal** | | | **0.5–1.5 runs** |

### 11.4 Pilot total (engineering only)

| Category | Runs (hours) |
|----------|----------------|
| Security P0 | 3.5–5 (4–10 h) |
| Accessibility P0 | 2–4 (2–8 h) |
| Measurement verify | 0.5–1.5 (1–3 h) |
| **Total** | **6–10.5 runs (6–21 h)** |

*Ops/legal/manual QA parallel — not counted.*

### 11.5 Post-pilot productisation (indicative)

| Phase | Work packages | Est. runs |
|-------|---------------|-----------|
| Compliance workflow v1 | Questionnaire schema, legal fields, approval states, hosted privacy URL | 8–12 |
| Publish gate + override audit | Block publish, override UI, immutable log | 4–6 |
| Retention purge jobs | Scheduler, warnings, verification UI | 4–6 |
| RBAC | Admin/editor/analytics/client roles | 6–10 |
| A11y productise | Studio warnings, axe CI, publish a11y checks | 6–8 |
| Security P2 | Audit log, regression tests, headers/CSP | 4–6 |

---

## 12. Immediate actions for legal review

Submit to legal **before ESB launch:**

1. **Blocks B, C, D** (§9.2–9.5) — full templates with disclaimer  
2. **Block E** finding list semantics — confirm `high_risk` / `review_required` appropriate for pilot  
3. **Gap list** — controller, DPO, lawful basis, processor table (spec §10.1; not yet generated)  
4. **Handbook §8** — approved client-facing claims wording  
5. **Retention** — 365-day default + manual deletion process (until purge automated)

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | Jul 2026 | Initial specification linked to ESB handbook |
