# RAFIQ Implementation Readiness Audit — 2026-11-04

## Scope and evidence boundary

This is a read-only source audit of the GitHub repositories `issaapplication-blip/-` and `issaapplication-blip/index.html`. It is not a live Supabase audit. The Supabase management connector denied access to project `qmuxaehrahfsnabyjens` for project, table, migration, and Edge Function reads. Therefore, repository files are treated as intended source only; they do not prove what is currently deployed or applied in the live project.

No production setting, database object, secret, webhook, deployment, or outbound message was changed during this audit.

## Existing architecture found in the repository

- Backend package declares Bun with Elysia, the Kapso WhatsApp Cloud API SDK, and QR-code generation.
- Backend README documents port 7860, `/health`, and `/api/status`, and says outbound WhatsApp, auto-replies, Telegram marketing/broadcasts, webhook auto-registration, and Kapso are disabled by container defaults.
- Repository contains source directories for `telegram-webhook`, `meta-whatsapp-webhook`, `rafiq-agent`, `public-intake`, `public-application-intake`, and `public-application-upload`.
- The backend also contains existing Telegram manager commands, provider/member records, case assignment logic, WhatsApp pending-approval handling, and private-document signing paths.
- Existing migrations in GitHub include admin review access, application approval/outbox, provider location structure, Telegram core, and a Telegram security-hardening migration. The live applied migration set could not be checked.

## Controls visible in source

1. The newer Telegram manager command handler rejects non-private chats and chat IDs not in `TELEGRAM_MANAGER_CHAT_IDS`.
2. The Telegram webhook path stores requests requiring human intervention in `whatsapp_pending_approvals` and tells managers that no automatic customer reply was sent.
3. The security-hardening migration in source enables RLS and creates service-role-only policies for a set of internal tables. Its Telegram rate-limit RPC validates chat ID length, clamps window and request limits, sets an empty search path, and restricts function execution to `service_role`.
4. The Docker CI workflow explicitly disables WhatsApp sending/auto-reply/forwarding, Telegram webhook auto-registration, marketing, startup broadcasts, and Kapso during its smoke test.
5. PR #84 updates the backend and public pages to use the current Cloudflare public-site URL rather than the retired Render host. Its GitHub Actions workflow passed Docker smoke, frozen lockfile, Cloudflare bundle, and offline Bun tests.

These are source-level observations only; live configuration and deployed behavior remain unverified.

## High-priority security and operational findings

### P1 — Legacy Telegram admin authorization accepts a mutable username

The backend contains a legacy admin gate that accepts a private Telegram chat when the sender username matches `RAFIQ_TELEGRAM_ADMIN_USERNAMES`, whose default is `MHDISSA980`. Telegram usernames can change and are weaker identifiers than numeric chat IDs. This path is separate from the newer `TELEGRAM_MANAGER_CHAT_IDS` check.

**Required action before production reliance:** verify the owner's numeric Telegram chat ID through a trusted admin-controlled process, ensure `RAFIQ_TELEGRAM_ADMIN_CHAT_IDS` is configured, then plan removal of the username fallback without locking out the legitimate owner. Do not guess or insert a chat ID.

### P1 — Marketing commands can send immediately when invoked by an authorized manager

The manager handler includes `/broadcast`, `/publish_ads`, and `/publish_specialty_ads`. The broadcast path can target active subscribers and configured broadcast targets; the two publishing commands send directly to `TELEGRAM_MARKETING_CHAT_ID`. The commands are private-manager gated, but the publishing commands do not implement a separate preview/confirm transaction inside the handler.

**Required action:** keep marketing and broadcast flags disabled unless a manager has reviewed the exact content and target. Before enabling routine campaigns, implement a preview → explicit confirmation → send flow and persist an approval record. No broadcast was executed during this audit.

### P1 — Live Supabase security state remains unknown

The repository migration source shows intended policies, but it is not proof that those migrations are applied to the existing project. Current RLS, grants, views, RPC bodies, Storage bucket policies, Edge Function versions, and `verify_jwt` settings could not be inspected.

**Required action:** restore read-only Supabase connector access and inspect the existing project before making any schema-dependent code changes.

### P2 — Retired-host references existed in public and operational content

The source search found stale Render-host references in backend replies, barcode links, robots/sitemap, public-page canonical metadata, and deployment/Kapso guidance. PR #84 updates the backend repository; PR #17 updates the separate frontend repository's operational documents. Both remain unmerged drafts and therefore have not changed production.

## Implementation sequence

1. Restore read-only access to the existing Supabase project `qmuxaehrahfsnabyjens`.
2. Capture live tables/columns/foreign keys, migrations, RLS policies, grants, views, RPC definitions, Storage policies, Edge Function versions and JWT settings, and security/performance advisors.
3. Reconcile the live state against repository migrations without applying anything.
4. Map the quality/safety specification to existing tables and workflows. Prefer additive use of existing structures; if a schema change is genuinely required, prepare a separate reviewed migration and obtain approval before applying it.
5. Build the admin quality workflow behind authenticated, role-checked routes; use mock/offline tests first, then a staging-only validation.
6. Review the Telegram admin identity and marketing approval findings before enabling management or broadcast capabilities.

## Current GitHub review artifacts

- PR #83 — quality and safety platform implementation specification.
- PR #84 — backend canonical URL and retired Render-link correction; GitHub Actions passed.
- PR #17 in `issaapplication-blip/index.html` — update operational documents to the Cloudflare public-site URL.

All remain unmerged. No production deployment or live Supabase mutation is authorized by this audit.
