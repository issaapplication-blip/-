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
- Public intake/upload Edge Functions use the service-role key only server-side, validate the upload token and expiry, limit uploads to eight files and 10 MiB each, and store files in the private bucket. Public intake has no robust per-IP rate limit or CAPTCHA; CORS is not an anti-abuse control.
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
Enable leaked-password protection in Supabase Dashboard → Authentication → Settings / Password Security. Review MFA enforcement for administrator accounts. Configure Turnstile or equivalent anti-abuse controls plus trusted server-side rate limiting for public intake/upload endpoints. Rotate server secrets only after confirming the deployed secret inventory and updating every consumer.
