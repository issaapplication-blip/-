# RAFIQ staging E2E and Supabase read-only audit

## Safety prerequisites

Run only against an isolated staging deployment and staging Supabase project.
The seven form tests create real staging intake records and upload small synthetic PDF fixtures.
They are blocked unless both explicit environment switches are set:
- `RAFIQ_E2E_ALLOW_SUBMISSIONS=1`
- `RAFIQ_E2E_NO_EXTERNAL_MESSAGING=1`

Before enabling these switches, verify that staging has no working Telegram/Meta outbound credentials or that outbound adapters are disabled. Do not point this test at production. The second variable is an operator attestation, not an automatic provider kill switch.

## Install Playwright

The existing repository does not currently declare Playwright. From the repository root:

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

Commit the generated `package.json` and `bun.lock` changes on this branch before using a frozen-lockfile CI install.

## Run

```bash
export RAFIQ_STAGING_URL="https://<your-staging-host>"
export RAFIQ_E2E_ALLOW_SUBMISSIONS=1
export RAFIQ_E2E_NO_EXTERNAL_MESSAGING=1
bunx playwright test --config=playwright.config.ts
```

HTML report:

```bash
bunx playwright show-report playwright-report
```

The suite checks all seven forms with real staging HTTP submissions, internal routes and links, return-to-home navigation, RTL, mobile overflow at 320/390px, and desktop rendering. It runs Chromium in mobile and desktop profiles.

It does not assert admin queue status because no read-only admin test endpoint or staging admin session contract has yet been confirmed. Do not treat the success message as proof of downstream admin processing.

## Read-only Supabase audit

Open Supabase Dashboard -> SQL Editor for the staging project and run:
`ops/sql/staging-acceptance-readonly.sql`.

All statements are SELECT-only. Compare:
- RLS enabled on every sensitive table.
- No anon SELECT policy or grant on applications, bookings, private file metadata, inbound WhatsApp, Telegram receipts or conversations.
- Storage bucket `private_documents` has `public=false`, a finite `file_size_limit`, and an allowlist of PDF/JPEG/PNG where applicable.
- Storage object policies are scoped to admin/service roles and the intended bucket.
- Telegram claim RPC signature, return type, SECURITY DEFINER setting and EXECUTE grants match the checked-in migration/application contract.

JWT lifetime, refresh-token rotation, reuse interval, signing keys and Auth hooks are configured in Dashboard -> Authentication -> Settings / JWT Keys / Hooks. SQL cannot reliably prove all hosted Auth settings. Never paste secrets into SQL or chat.

## Important limitation

The Playwright source and read-only SQL audit are committed, but the E2E dependency is not yet in `package.json` / `bun.lock`. Install it as above and commit the generated lockfile before CI can run reproducibly. The tests have not been run because no staging URL or isolated staging credentials/environment were provided.
