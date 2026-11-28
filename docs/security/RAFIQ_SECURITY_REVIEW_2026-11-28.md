# RAFIQ security review — 2026-11-28

## Scope
Authorized, non-destructive review of the RAFIQ GitHub repository, Cloudflare Pages build configuration, Supabase PostgreSQL metadata, RLS policies, function grants, and private Storage policies. No destructive payloads, credential guessing, denial-of-service, data extraction, or third-party targets were used.

## Findings
- All 58 relations in the public schema have RLS enabled.
- The private_documents bucket is private, has a 10 MiB file-size cap and a MIME allowlist.
- Admin RPCs exposed to authenticated users contain an active-admin check through public.is_admin(); internal helper and worker functions are not granted to anon/authenticated.
- Several RLS policies checked profiles.role = 'admin' without consistently enforcing active status. A disabled administrator could retain access through those policies.
- The legacy public_lookup_issued_barcode(text) RPC was callable by anon and returned an internal intake UUID and membership number. No current source-code caller was found. The newer public member barcode verifier hashes a high-entropy token and returns minimal verification fields.
- The anonymous PWA-install telemetry RPC remains enabled; it is idempotent per installation UUID but is not a substitute for edge-level abuse controls.
- Supabase Auth leaked-password protection is disabled and requires an Auth settings change in the Supabase Dashboard; no supported Auth configuration write action was available in this connected session.
- Public intake/upload Edge Functions use the service-role key only server-side, validate upload tokens and expiry, enforce HMAC-keyed per-IP rate limits, bound request sizes, validate file signatures, cap uploads at eight files / 10 MiB each / 30 MiB aggregate, and store files in the private bucket. CORS is treated only as an origin control, not as the rate limiter.
- The Pages build script overwrote the source _headers file and weakened frame protection to SAMEORIGIN.

## Controls in this change
- Convert direct profile-role admin RLS checks to public.is_admin() and authenticated.
- Narrow the public-pricing read policy to authenticated sessions.
- Revoke anon/authenticated execution of the legacy issued-barcode lookup.
- Revoke TRUNCATE, REFERENCES and TRIGGER privileges from anon/authenticated, including default privileges for future public-schema tables created by postgres.
- Emit HSTS, DENY framing, MIME sniff protection, restrictive object/base/frame CSP directives, strict referrer policy, restricted browser permissions, and no-cache rules for service worker/manifests.
- Add regression tests.

## Not changed
No tables or user data were deleted. No service-role credentials were rotated. No admin accounts or sessions were disabled. No Edge Function was redeployed. No rate-limit or CAPTCHA service was enabled because this needs a trusted client-IP or challenge verification design and configured secrets.

## Manual follow-up
Enable leaked-password protection in Supabase Dashboard → Authentication → Settings / Password Security. Review MFA enforcement for administrator accounts. Configure Turnstile or equivalent CAPTCHA as an additional layer for public intake/upload endpoints; server-side HMAC-keyed rate limiting is already active. Rotate server secrets only after confirming the deployed secret inventory and updating every consumer.


## Visitor protection phase — 2026-11-28

- Added a private, non-exposed `rafig_private` schema containing rate-limit counters and short-lived upload reservations. It stores keyed IP digests only, not raw IP addresses.
- Public CV intake: 5 requests / 10 minutes and 20 / 24 hours per visitor IP; JSON request body capped at 64 KiB.
- Public document upload: 15 requests / 10 minutes and 60 / 24 hours per visitor IP; multipart body capped at 35 MiB, aggregate files at 30 MiB, each file at 10 MiB, and eight files maximum.
- PDF, JPEG, PNG, DOC and DOCX uploads are checked against file signatures. Concurrent uploads reserve slots atomically; failed uploads remove partial storage objects and metadata.
- PWA install telemetry now goes through a rate-limited Edge Function (10 / 10 minutes and 50 / 24 hours). Direct anon/authenticated execution of the underlying telemetry RPC is revoked.
- Public member barcode/count helpers remain available to anonymous visitors, use an empty search_path, and are no longer callable by authenticated users.
- The migration's rate-limit RPCs and upload reservation RPCs are executable only by service_role. SQL smoke tests confirmed the rate limit permits the first two requests and blocks the third at a test limit of two, and that a reservation exceeding the eight-file ceiling is rejected.
- GitHub Actions: visitor hardening test run passed after correcting regression assertions. Production Cloudflare Pages deployment for the visitor intake hardening commit succeeded. The latest PWA telemetry frontend release is deployed to the official Pages project; production alias remains `https://rafiq-lebanon.pages.dev`.
- Supabase Edge Functions `public-application-intake` v8, `public-application-upload` v7, and `public-pwa-install` v1 are ACTIVE.

## Remaining control gaps

- Supabase Auth leaked-password protection remains disabled according to Security Advisor despite an older migration record; the Auth service configuration must be enabled in Dashboard / Management API.
- The one active administrator account has no verified MFA factor. MFA is not forcibly required yet to avoid locking out the only admin before enrollment.
- CAPTCHA / Turnstile is not yet configured; it requires a site key and server-side secret. Rate limiting is active independently.
- The remaining authenticated SECURITY DEFINER admin RPCs all contain an explicit `is_admin()` check. They remain available to preserve admin workflows; continue reviewing each function body and its search path before altering grants.
