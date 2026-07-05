# Roadmap planning questionnaire — completed

**Completed:** July 2026 (Stephen)  
**Status:** Locked — drives [ROADMAP.md](./ROADMAP.md) and [EXPERIENCE_SCHEMA.md](./EXPERIENCE_SCHEMA.md)

**Related docs:** [PLANNING.md](./PLANNING.md)

**Open items (no answer provided):** *(none — all locked July 2026)*

**Soft limits:** ~150–250 nodes per experience (no hard UI cap).

---

## Cross-cutting (answer first — affects all waves)

### CX-1 Experience URL pattern

**Answer:** Support both experience URLs and standalone module URLs. Experiences use `/x/{experienceSlug}` with internal routing while modules remain directly accessible.

### CX-2 Standalone module URLs after flows ship

**Answer:** Standalone modules remain a first-class publishing option. Do not force all solutions into Experiences.

### CX-3 Slug namespace

**Answer:** Experience slugs must be unique and not collide with modules/reserved paths. Modules may exist standalone and inside experiences.

### CX-4 Session identity

**Answer:** Anonymous by default. Identity is layered through configurable gates/forms. Always maintain an anonymous session ID.

### CX-5 Session persistence

**Answer:** Resume sessions after refresh. Prefer avoiding cookies where practical; keep implementation flexible. Support anonymous return-visitor recognition if feasible.

### CX-6 Back button behaviour

**Answer:** Configurable per experience. Allow free navigation or one-way flows with configurable fallback page.

### CX-7 Draft vs published

**Answer:** Support draft previews, draft modules inside draft experiences, and future workflow states.

### CX-8 Deleting modules in use

**Answer:** Support archive vs delete. Flag broken references, notify designers, and add configurable fallback later.

### CX-9 Project Code & Design Code format

**Answer:** Optional, flexible alphanumeric.

### CX-10 Search scope

**Answer:** Search title, client, project code, design code and slug.

### CX-11 Branding hierarchy

**Answer:** Branding belongs to components. Experiences only own lightweight metadata.

### CX-12 Powered by Real Nation

**Answer:** Configured per component.

### CX-13 Embeds

**Answer:** Allow component embeds, not full experiences.

### CX-14 Kiosk / event mode

**Answer:** Configurable idle timeout and destination.

### CX-15 Facilitator vs participant

**Answer:** Focus Waves 1–4 on self-guided experiences.

---

## Wave 1 — Platform spine

### W1-1 Linear flow editor UX (pre–node canvas)

**Answer:** An ordered list is acceptable only as a stepping stone. Build functionality quickly with a simple ordered list to validate the concept, then move straight to the visual node editor. Do not leave two parallel editors long-term.

### W1-2 Experience record storage

**Answer:** Happy for Cursor to choose the implementation. Follow best practice, document the approach clearly, and keep experience records separate where appropriate without over-specifying storage architecture now.

### W1-3 Session storage

**Answer:** Use the cleanest middle-ground approach for now and abstract the storage layer so migration to SQL later is straightforward. Avoid painting the platform into a corner.

### W1-4 Minimum modules in Wave 1 player

**Answer:** Do not artificially limit Wave 1 to two module types. Support as many existing modules as practical so chaining multiple reusable modules can be properly validated.

### W1-5 track() in Wave 1

**Answer:** Put the tracking architecture in place early. Don't worry about retroactive tracking; ensure future modules emit the data needed for analytics.

### W1-6 Home page layout

**Answer:** Yes. Show recent Experiences at the top, then grouped module sections with a few recent items and a 'View All' link.

### W1-7 Library page URL pattern

**Answer:** Yes. URLs such as `/admin/library/catch` are appropriate.

### W1-8 Migration of existing index

**Answer:** Yes. Backfill missing Project Code and Design Code values for existing modules.

### W1-9 Experience player package location

**Answer:** Follow Cursor's recommended implementation. Keep experiences exposed through `/x/{slug}` while separating them cleanly from standalone modules.

### W1-10 Who can create experiences

**Answer:** Any authenticated Studio user for now.

---

## Wave 2 — UI modules

### W2-1 Landing page v1 scope

**Answer:** The Landing Page becomes the foundation for future page-based modules. Support hero image, headline, body copy, breakpoint-aware backgrounds, CTAs, inherited button styling and automatic Continue buttons when used inside an Experience. Standalone pages retain their own configured buttons.

### W2-2 Consent module

**Answer:** Reuse the underlying Pin Board consent logic but redesign the UI to match the new Landing Page style so it becomes the basis for future page components.

### W2-3 Form fields v1

**Answer:** Support standard field types comparable to Google Forms/Jotform/Typeform: text, email, phone, dropdown, multiple choice, checkbox, date, postcode and required/optional fields.

### W2-4 Form validation

**Answer:** Keep validation flexible. Support basic validation plus configurable rules such as college email patterns and custom matching logic.

### W2-5 Redemption v1

**Answer:** Start simple but design for expansion. Future support should include redemption tiers, uploaded voucher lists, inventory counts, threshold-based rewards, alerts and reporting.

### W2-6 Email signup

**Answer:** Support embedded or native signup forms. Collect standard marketing fields and store them in an exportable email list with future CRM/API integration.

### W2-7 Certificate v1

**Answer:** Include Certificates in Wave 2. Support custom backgrounds, dimensions, fonts, merge fields and adjustable placement.

### W2-8 Module priority if time-constrained

**Answer:** Priority: Landing Page, flexible Form, Certificate. Redemption is the next desirable module.

### W2-9 CTA tracking

**Answer:** Yes. Track CTA interactions and move analytics earlier in the roadmap because almost every feature depends on it.

### W2-10 Designer instructions

**Answer:** Primarily written by Stephen. Cursor generates first-pass parameter documentation and glossaries which are then refined into designer documentation.

---

## Wave 3 — Flow editor MVP

### W3-1 Node editor library

**Answer:** React Flow is an acceptable foundation for the visual flow builder. The implementation choice is less important than delivering an intuitive editing experience.

### W3-2 Canvas vs list

**Answer:** Replace the ordered list once the canvas is working. The list is only a stepping stone, not a permanent editing mode.

### W3-3 Node palette

**Answer:** Group modules into sensible categories such as Intro/Pages, Games, Forms, Consent, Rewards, Results, Logic and Leaderboards.

### W3-4 Connection rules

**Answer:** Standard modules should expose a single output. Multi-output behaviour belongs to dedicated Logic components (gates, routers, aggregators, etc.).

### W3-5 Flow preview

**Answer:** Preview in a new browser tab and provide a QR code for mobile preview.

### W3-6 Template cloning

**Answer:** Do not prioritise template cloning yet. Add later if needed.

### W3-7 Versioning

**Answer:** Separate Save and Publish. Draft changes should be previewable without affecting the live experience.

### W3-8 Export sales pack

**Answer:** Not required initially. Focus effort on a great editor with zoom/pan instead.

### W3-9 Leaderboard migration

**Answer:** Low priority. Use the quickest clean migration approach.

### W3-10 Max graph size

**Answer:** No hard cap in the UI for now. Treat ~150–250 nodes as a soft/invisible performance guideline; branching flows can grow quickly but typical experiences stay well below this.

---

## Wave 4 — Conditional branching

### W4-1 Router vs aggregator

**Answer:** Use one configurable Logic node rather than many specialised routing components.

### W4-2 Wheel branching

**Answer:** Route using existing wheel outputs (segment, prize tier, win/lose, etc.) rather than modifying the Wheel component.

### W4-3 Score thresholds

**Answer:** Support fixed thresholds, designer-defined ranges and high-score detection. Percentiles can come later.

### W4-4 Quiz branching

**Answer:** Wait until the Kiosk/Mini Quiz architecture is defined. Then expose quiz outputs for routing.

### W4-5 Default path

**Answer:** Every Logic node should require a default/fallback route.

### W4-6 Preview simulation

**Answer:** Provide tools to force outcomes while testing, prioritising random/luck-based components.

### W4-7 Retry loops

**Answer:** Loops should happen naturally through Logic nodes. Retries remain within the same session.

### W4-8 Parallel paths

**Answer:** Support branches that merge back together.

### W4-9 Time-based routing

**Answer:** Support before, during and after event routing using date/time conditions.

### W4-10 A/B testing

**Answer:** Yes — include random % split between paths (A/B testing) in Wave 4.

---

## Wave 5 — Games as flow citizens

### W5-1 End screen behaviour in flow

**Answer:** Use Experience Overrides for existing component end screens. Do not create separate flow end screens. Overrides may change text, CTA labels, button visibility and destinations while inheriting everything else from the standalone component.

### W5-2 Wheel in flow

**Answer:** Treat this as generic Component Completion Behaviour. The Wheel emits its outcome and the Experience decides whether to auto-continue, show Continue, replay, claim prize or any other configured action.

### W5-3 Quiz in flow

**Answer:** Single-player / kiosk quiz first. Play-Along Quiz is a separate facilitator-led product and should not drive the Experience Builder architecture.

### W5-4 Pin board in flow

**Answer:** Support Pin Board inside flows but do not over-engineer it. It remains primarily an in-person collaborative component and should slot naturally into experiences.

### W5-5 Leaderboard in flow

**Answer:** Treat Leaderboard as a normal configurable component with Experience Overrides (player rank, Top 10, projector mode, auto-continue, etc.).

### W5-6 Deprecation timeline

**Answer:** Keep legacy linkedGameId/linkedLeaderboardSlug support for backwards compatibility. Hide/deprecate in the UI rather than removing immediately.

### W5-7 Outcome conflicts

**Answer:** Namespace every component's outputs (e.g. runner.score, catch.score, quiz.score) so multiple components never overwrite one another. When the same component type appears twice in one flow, scope outcomes by node id.

### W5-8 High score

**Answer:** Keep both per-component scores/high scores and an experience-level summary for future aggregate scoring and league tables.

### W5-9 Scratcher / flip-cards outcomes

**Answer:** Expose generic outcome variables (prize tier, revealed prize, match count, etc.) that Logic nodes consume instead of hardcoding behaviour.

### W5-10 Reporting toggle

**Answer:** Support reporting at both component and experience level. Experience reporting aggregates component reporting and user journeys.

---

## Wave 6 — Competition + reporting

### W6-1 Tracking sign-off

**Answer:** Prepare a concise business/legal decision document covering GDPR, retention periods and PII before production.

### W6-2 Ingest storage

**Answer:** Use the current storage abstraction initially but design it so SQL migration later does not change product behaviour.

### W6-3 Raw events vs aggregates

**Answer:** Store raw events and derive aggregates.

### W6-4 Dashboard v1 widgets

**Answer:** Provide platform analytics plus context-aware component analytics. Hide irrelevant metrics and allow relabelling for client reporting.

### W6-5 Client-facing dashboard

**Answer:** Studio dashboards first. Public dashboards later.

### W6-6 Google Sheets

**Answer:** Keep Google Sheets export alongside dashboards.

### W6-7 League module scope

**Answer:** Single-experience leagues only.

### W6-8 Stage transitions

**Answer:** Support both manual and automatic transitions depending on experience type.

### W6-9 PDF export

**Answer:** Prioritise CSV/Excel/Google Sheets export over polished PDFs.

### W6-10 API export

**Answer:** Webhook first. Richer API later.

---

## Business & operations

### B-1 First pilot client

**Answer:** Do not lock to a specific client yet. Use the first suitable live opportunity.

### B-2 Sales narrative

**Answer:** Continue using mockups before implementation where useful.

### B-3 Pricing / packaging

**Answer:** Experiences become the sellable unit, built from reusable components.

### B-4 Production URL

**Answer:** Remain on Netlify during development and move to a production domain later.

### B-5 Console / cartridge

**Answer:** Park the concept rather than cancelling it.

### B-6 Resource constraints

**Answer:** Assume solo development with AI assistance.

### B-7 Quiz overhaul

**Answer:** Complete the Quiz redesign before deep Experience integration.

### B-8 Multimedia flip cards

**Answer:** Treat as an evolution of the existing Flip Cards component, not a separate module.

### B-9 Compliance

**Answer:** Business/legal decision outside the roadmap.

### B-10 Localization

**Answer:** No multilingual framework initially. Create separate experiences where required.

---

## Technical preferences

### T-1 Flow editor autosave

**Answer:** Autosave drafts. Publishing remains explicit.

### T-2 Module lazy loading

**Answer:** Lazy-load modules on demand.

### T-3 Error handling

**Answer:** Retry first, then route to a configurable fallback page.

### T-4 Rate limiting

**Answer:** Implement rate limiting on public endpoints.

### T-5 Test environments

**Answer:** Maintain a separate staging environment.

### T-6 Analytics buckets

**Answer:** Use Campaign Analytics, Experience Analytics, Component Analytics and User Analytics.

### T-7 Module registry location

**Answer:** Use the shared TypeScript registry as the source of truth.

---

## Summary checklist

- [x] Cross-cutting CX-1 … CX-15
- [x] Wave 1 W1-1 … W1-10
- [x] Wave 2 W2-1 … W2-10
- [x] Wave 3 W3-1 … W3-10 *(W3-10 soft limit ~150–250 nodes)*
- [x] Wave 4 W4-1 … W4-10 *(A/B split included)*
- [x] Wave 5 W5-1 … W5-10
- [x] Wave 6 W6-1 … W6-10
- [x] Business B-1 … B-10
- [x] Technical T-1 … T-7

**Total: 82 questions (all locked)**

**Soft limit:** ~150–250 nodes per experience (no hard cap in UI).
