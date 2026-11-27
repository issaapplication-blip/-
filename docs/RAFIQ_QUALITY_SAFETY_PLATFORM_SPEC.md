# RAFIQ Quality & Safety Platform — Technical Implementation Specification

**Status:** Draft specification / review required  
**Date:** 2026-11-04  
**Scope:** Documentation-only proposal. No production configuration, schema, data, secrets, webhooks, or deployments are changed by this document.

## 1. Goals

Translate the RAFIQ evidence-based Operational Quality and Safety Manual v1 into staged product capabilities:

1. Provider verification and role/scope controls.
2. Person-centred care-plan and visit documentation.
3. Home safety and infection-prevention checklists.
4. Incident, safeguarding, complaint, and escalation workflows.
5. Quality dashboard with operational indicators.
6. Human-supervised RAFIQ assistant for administrative coordination.

The platform must not diagnose, prescribe, alter medication, independently determine clinical eligibility, or represent itself as an emergency monitoring service.

## 2. Non-negotiable implementation constraints

- Keep the existing Supabase project `qmuxaehrahfsnabyjens` and current repository architecture.
- No new Supabase project, database migration, table, bucket, policy, secret, or hosted-setting change until separately reviewed and explicitly approved.
- No direct commits to `main`; use feature branches and draft pull requests.
- No production deployment, webhook cutover, live customer submission, real Telegram/WhatsApp message, or broadcast as part of development verification.
- Do not use Render.
- Never expose service-role credentials in browser code, logs, documentation, or commits.
- Do not expose personal or health information publicly. Apply least privilege and data minimization.
- Preserve existing intake/admin approval flows and existing provider/customer channels; do not silently replace them.
- All clinical tasks remain within the verified professional's legal scope and current Lebanese requirements. This specification does not grant professional authority or establish Lebanese law.

## 3. Current architecture assumptions to verify

Repository README identifies a Bun 1.3.10 + Elysia backend and an existing Supabase project. The repository also contains Cloudflare Pages assets/functions and Supabase Edge Functions. The exact production routing and deployed versions must be verified before integration.

Known existing concepts referenced in repository history include:
- Existing public intake and application intake/upload flows.
- Existing admin authorization logic involving `public.is_admin()` and an active admin profile.
- Existing `bookings`, `rafiq_conversations`, and intake-related records.
- Telegram manager delivery and WhatsApp inbound relay work in separate PRs.

**Important:** These names and behaviors are repository-level leads, not proof of the current live schema. The connected Supabase management API returned a permission error during the 2026-11-04 read-only audit. Before any schema-dependent implementation, re-authenticate and inspect the live tables, RLS policies, functions, storage policies, migrations, and Edge Function versions. Do not infer missing tables or apply draft migrations.

## 4. Product modules and requirements

### 4.1 Provider verification

**Purpose:** prevent unverified or out-of-scope providers from being presented as approved.

Required capabilities:
- Provider application status: `pending`, `in_review`, `approved`, `rejected`, `suspended`.
- Provider category and permitted service list.
- Record verification state for identity, qualification, professional registration/license where applicable, references, and expiry/recheck date.
- Store only minimum metadata needed to establish verification; sensitive document storage remains private and access-controlled.
- Separate administrative verification from clinical competency assessment.
- Block matching/booking until required checks are complete.
- Record reviewer, timestamp, decision, and reason in a protected audit trail.
- Rejection removes provider from active/public discovery but does not silently destroy records subject to retention requirements.

Acceptance criteria:
- A pending/unverified provider cannot appear as approved or be assigned a service.
- Role and service scope are visible to authorized admins and dispatch staff.
- A nurse/physiotherapist/other regulated professional cannot be represented as licensed until verified through an authoritative channel.
- Expired or suspended verification blocks new assignments and raises an admin review item.

### 4.2 Person-centred care plans

**Purpose:** document agreed non-diagnostic service instructions and preferences.

Required capabilities:
- Link a care plan to a verified client/request and authorized provider.
- Capture goals, preferences, agreed tasks, schedule, accessibility needs, emergency contact (only with consent), and review date.
- Distinguish client/family-provided information from professional assessment.
- Clinical assessment fields, if ever required, must be completed and signed only by an appropriately authorized professional.
- Record consent and who may receive updates.
- Version changes; do not overwrite historical care-plan decisions.

Acceptance criteria:
- A provider sees only assigned clients and the minimum information required for the visit.
- Family access is explicit, revocable, and limited to the consented scope.
- No care plan can instruct a non-clinical caregiver to diagnose, prescribe, change medication, or perform a regulated procedure.

### 4.3 Visit and safety checklist

**Purpose:** support consistent documentation, not replace professional judgment.

Checklist sections:
- Visit identity, date/time, assigned provider, and task scope.
- Home environment: lighting, clutter, loose rugs, cables, bathroom/steps, mobility aids, and other observed hazards.
- Falls history/risk flag only when obtained through an authorized assessment or reported by the client/family; avoid automated clinical risk scoring in phase 1.
- Infection prevention: hand hygiene, risk-appropriate PPE, equipment cleaning, sharps safety where relevant, and supply shortage reporting.
- Skin/mobility/nutrition/swallowing concerns as observations or client reports only; route clinical concerns to a qualified professional.
- Visit outcome, deviations from agreed tasks, and follow-up required.

Acceptance criteria:
- Checklists are role-specific and do not imply a caregiver performed a clinical assessment.
- Missing safety-critical items prevent routine visit closure only where operationally appropriate; emergency escalation must never be delayed by form completion.
- Records are timestamped and attributable.

### 4.4 Incidents, safeguarding, and escalation

Incident types:
- Medical emergency / sudden deterioration.
- Fall or injury.
- Medication discrepancy or medication-related event.
- Infection exposure / sharps injury.
- Suspected abuse, neglect, or unsafe environment.
- Provider no-show or unsafe conduct.
- Privacy/security incident.

Workflow:
1. Protect people and seek local emergency assistance immediately for imminent danger; do not wait for platform approval.
2. Notify the designated clinical contact/supervisor through the approved route.
3. Record objective facts, time, immediate action, and contacts made; avoid speculative diagnosis.
4. Restrict incident visibility to authorized roles.
5. Assign follow-up owner and due date.
6. Review severity, contributing factors, corrective action, and closure approval.

Acceptance criteria:
- Emergency instructions are visible without requiring login where appropriate, but never promise that RAFIQ monitors emergencies 24/7.
- Incident creation does not automatically send messages to customers, groups, or channels.
- Outbound notifications require the existing approval process and a separately approved integration.
- High-severity incidents cannot be silently auto-closed.

### 4.5 Quality dashboard

Initial operational indicators (define denominator, period, exclusions, and source before reporting):
- Provider verification completion rate.
- Share of assignments within verified provider scope.
- On-time visit rate and provider substitution rate.
- Falls/injuries per 1,000 visits, stratified by severity.
- Medication discrepancies escalated per 1,000 visits.
- IPC training completion and visit checklist completion.
- Time from incident report to supervisor acknowledgement.
- Complaints and client-reported experience.
- Privacy/security incident counts.
- Staff training, absence, and workload indicators.

Rules:
- Establish a baseline before setting targets.
- Display counts and denominators; suppress small groups where re-identification is possible.
- Do not compare providers using unadjusted raw incident counts.
- Clearly label operational indicators; do not imply clinical effectiveness or causal impact.

### 4.6 RAFIQ assistant

Allowed phase-1 uses:
- Explain platform services and process steps.
- Help staff find approved SOPs and checklist guidance.
- Draft administrative summaries for human review.
- Remind authorized staff about pending tasks.
- Route potential safety concerns to a human supervisor using deterministic rules.

Disallowed:
- Diagnosis, treatment advice, medication changes, clinical triage as a final decision, or autonomous provider approval.
- Claiming continuous monitoring or emergency response.
- Sending health data to external model providers without an approved privacy/security review.
- Sending outbound Telegram/WhatsApp messages without the existing explicit approval gate.

All sensitive outputs require a named human owner and an audit record.

## 5. Data and authorization design — discovery before design

Do not create tables or migrations in this phase.

First inspect the live database and map existing records to the following logical entities:
- provider profile and verification evidence;
- client/request and consent;
- care plan and versions;
- visit and checklist;
- incident and corrective action;
- training/competency record;
- audit event;
- quality metric aggregation.

Reuse existing tables only where their semantics and security model genuinely match. Do not overload `bookings` or intake tables with unrelated clinical records.

Required security review before any write:
- RLS enabled on every exposed table.
- Explicit policies by role and row relationship; `TO authenticated` alone is not authorization.
- No reliance on user-editable JWT metadata for privilege checks.
- Admin authorization must use the established trusted authorization path (e.g. verified `public.is_admin()` behavior), not client-provided role fields.
- UPDATE policies must include appropriate `USING` and `WITH CHECK`.
- No public read access to health, identity, incident, or provider verification records.
- Private Storage bucket policies and signed access must be reviewed for every document type.
- Views/functions must be reviewed for RLS bypass and grants; avoid unnecessary `SECURITY DEFINER`.
- Audit access to sensitive records and minimize retention.

## 6. Integration map

| Capability | Preferred existing surface | Gate |
|---|---|---|
| Public provider application | Existing public intake pages/proxy and Supabase intake function | Preserve admin review; no auto-approval |
| Admin verification | Existing protected admin interface and trusted admin authorization | Verify live RLS and role checks |
| Visit/checklist | New UI only after data model and access model approval | No new schema in this phase |
| Incident escalation | Existing internal admin workflow where suitable | No automatic external messaging |
| Telegram/WhatsApp | Existing official, approved paths only | No webhook changes or real messages |
| Quality dashboard | Aggregated, access-controlled admin view | No public health data or small-cell disclosure |
| AI assistant | Existing RAFIQ agent path only after prompt/data-flow review | Human oversight; no diagnosis/treatment |

## 7. Delivery phases

### Phase 0 — Read-only discovery (current gate)
- Inspect repository tree, active branches, open PR dependencies, and CI.
- Restore authorized read-only Supabase access.
- Inspect live schema, migrations, RLS, storage policies, and Edge Function versions.
- Map existing UI/routes and identify duplicate or conflicting work.
- Produce a gap report; no writes.

### Phase 1 — Documentation and offline contracts
- Add role/scope matrix and workflow diagrams.
- Define JSON contracts and validation tests without connecting to production.
- Add mock-only tests for provider verification, visit checklist, and incident state transitions.
- Add no live customer records and no external provider calls.

### Phase 2 — UI prototype
- Build admin-only screens against local fixtures or isolated mock data.
- Ensure Arabic RTL and mobile behavior.
- No production API writes.

### Phase 3 — Backend implementation proposal
- Only after live schema/RLS review, prepare additive, minimal migration proposal if needed.
- Submit draft PR and SQL for review.
- No migration application, deployment, or production data writes until explicit approval.

### Phase 4 — Controlled staging validation
- Use an isolated staging environment and test identities.
- Disable outbound Telegram/Meta/WhatsApp.
- Verify authorization, RLS, storage access, audit trails, and failure paths.
- No production cutover until separate approval.

## 8. Release checklist

- [ ] Live Supabase access restored and read-only schema audit completed.
- [ ] Existing open PR dependencies reconciled; no duplicated feature work.
- [ ] Lebanese legal/licensing/privacy review completed for relevant service types.
- [ ] Clinical owner and escalation contacts designated.
- [ ] RLS and Storage policy review passed.
- [ ] Mock/offline tests and CI pass.
- [ ] Staging tests pass with external messaging disabled.
- [ ] Human approval and rollback plan documented.
- [ ] Separate explicit approval obtained for any migration, production write, secret, webhook, or deployment.

## 9. Evidence basis and limitations

The operational manual in the Undermind research workspace informs these requirements, including evidence on home-care workforce capability, falls prevention, home-care infection prevention, Lebanon PHC access experiences, and ethical concerns in smart-home health technology.

Research evidence is not Lebanese law, does not establish a provider's license, and does not authorize RAFIQ to offer clinical services. Verify current Lebanese Ministry of Public Health and professional syndicate requirements before launch. Clinical pathways must be reviewed by qualified local professionals.

## 10. Immediate blocker

As of 2026-11-04, GitHub repository access is available, but the Supabase management connector returned a permission error for project `qmuxaehrahfsnabyjens`. Therefore this change set deliberately contains documentation only. The next implementation gate is restoring Supabase read-only access and completing Phase 0; do not work around this by creating another project or applying guessed schema changes.
