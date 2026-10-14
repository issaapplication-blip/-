# RAFIQ live Supabase inventory — 2026-10-14

## Scope and method
Read-only inspection of project ref `qmuxaehrahfsnabyjens` using the connected Supabase tools. No SQL writes, migrations, function deployments, Storage writes, webhook changes, or DNS changes were performed.

## Live project status
- Project status: `ACTIVE_HEALTHY`
- PostgreSQL: 17.6.1.165 (engine 17)
- Public schema: 55 base tables, 37 functions, 62 recorded migrations.
- Five active Edge Functions were retrieved into the companion recovery PR:
  - `public-application-intake` v6, `verify_jwt=false`
  - `public-application-upload` v5, `verify_jwt=false`
  - `meta-whatsapp-webhook` v3, `verify_jwt=false`
  - `rafiq-agent` v6, `verify_jwt=true`
  - `public-intake` v1, `verify_jwt=true`

## Extensions
Direct database query reports:
- `pgcrypto` 1.3 — installed
- `uuid-ossp` 1.1 — installed
- `pg_cron` — not installed
- `pg_net` — not installed

This only reports current extension state. It does not prove whether a different scheduling mechanism is available, and no scheduled job was created.

## Security findings requiring review (no remediation applied)
Supabase security advisor reports:
- 9 public tables have RLS enabled but no policies:
  - `rafiq_case_assignments`
  - `rafiq_provider_registry`
  - `rafiq_telegram_broadcast_targets`
  - `rafiq_telegram_broadcasts`
  - `rafiq_telegram_identities`
  - `rafiq_telegram_request_sessions`
  - `rafiq_telegram_subscribers`
  - `whatsapp_integrations`
  - `whatsapp_webhook_events`
- 5 `SECURITY DEFINER` functions are executable by `anon` according to the advisor:
  - `manager_folder_counts()`
  - `public_lookup_issued_barcode(p_code text)`
  - `public_member_barcode(p_code text)`
  - `public_member_count()`
  - `record_pwa_install(...)`
- 14 `SECURITY DEFINER` functions are executable by `authenticated` according to the advisor.
- Leaked-password protection is disabled.

These are findings to assess, not automatic proof of an exploitable vulnerability. Some functions may intentionally be public. Do not apply blanket revokes or add blanket policies: first inspect function bodies, callers, intended access, and admin authentication.

## Migration coverage limitation
The presence of 62 migration records does not guarantee that every live table, function, policy, trigger, extension, Auth object, Storage object, or project setting can be rebuilt from the repository. A full recovery still requires:
1. an encrypted database backup and successful isolated restore,
2. Storage object export and count/hash verification,
3. Auth and project configuration inventory,
4. function source/config review,
5. staging integration tests.

## Next safe steps
1. Review the recovered Edge Function sources in this PR.
2. Run a real backup locally using secrets stored only in the local environment; do not paste them into chat or commit them.
3. Verify the archive and restore into an isolated local PostgreSQL environment.
4. Test Telegram webhook behavior against a mock Telegram API before touching production.
5. Keep WhatsApp outbound automation disabled until explicitly re-enabled and verified.
