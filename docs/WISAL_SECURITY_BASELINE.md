# RAFIQ | رفيق — Security Baseline

## Security objective
Treat identity documents, caregiver records, patient data, contracts, payment evidence, and WhatsApp metadata as sensitive data. Apply least privilege, deny-by-default access, server-side secrets, auditability, and human approval for consequential actions.

## Non-negotiable controls
- Never store Supabase service-role keys, OpenAI API keys, Meta access tokens, webhook secrets, or payment credentials in browser code, HTML, Git history, or public files.
- Use short-lived authenticated sessions and server-side authorization for privileged operations.
- Enforce authorization with Supabase RLS; frontend checks are convenience only, never security boundaries.
- Private Storage buckets for identity, certificates, CVs, contracts, and payment evidence. Access through authorized signed URLs or server-mediated downloads only.
- Never expose patient/provider documents through public buckets.
- Validate input on the server: type, length, allowed values, file size, MIME type, extension, and ownership.
- Use allowlists rather than deny lists for roles, statuses, file types, and actions.
- Rate-limit authentication, public forms, AI endpoints, upload endpoints, and WhatsApp webhook/API endpoints.
- Add security headers: CSP, HSTS in HTTPS production, frame-ancestors/anti-clickjacking, Referrer-Policy, Permissions-Policy, X-Content-Type-Options.
- Never place secrets or personal medical/identity data in logs. Redact tokens, phone numbers where unnecessary, and document contents.
- Audit security-sensitive events: sign-in, role changes, document access, approval/rejection, contract changes, AI recommendations, outbound-message approval, and administrative changes.
- Verify webhook signatures before processing provider events; reject replayed/expired requests where provider supports timestamps/nonces.
- Protect against CSRF where cookie-based sessions are used; prefer Authorization headers for APIs where appropriate.
- Prevent SSRF: outbound URLs must be allowlisted; never let user input directly select arbitrary server destinations.
- Protect against prompt injection: treat uploaded documents, messages, and external content as untrusted data, not instructions.
- AI output is advisory and must pass deterministic validation and human approval before consequential actions.
- Healthcare-related content must not become autonomous diagnosis, treatment, or emergency decision-making.

## Incident readiness
Maintain an incident procedure covering credential revocation, session invalidation, compromised webhook/token rotation, document-access review, audit-log preservation, and notification/escalation decisions.

## Release gate
No production release until RLS, Storage policies, authentication, secret configuration, webhook verification, rate limits, audit logging, backup/recovery, dependency audit, and manual approval workflows are tested.
