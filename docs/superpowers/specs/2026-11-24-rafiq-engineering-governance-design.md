# RAFIQ engineering governance and CI design

- Date: 2026-11-24
- Status: implemented on an isolated branch; awaiting owner review
- Target: `main`
- Scope: repository-level development guidance and pull-request CI coverage only

## Goals

1. Give Codex and human contributors one durable source of repository-specific engineering rules.
2. Make the existing test/build pipeline run when governance instructions themselves change.
3. Preserve the current CI implementation rather than introducing duplicate pipelines.
4. Keep production, Supabase, messaging integrations, and hosting configuration outside this change.

## Current-state findings

- The repository uses Bun 1.3.10 and Elysia.
- Existing `.github/workflows/rafiq-edge-function-tests.yml` already runs a Docker build and isolated `/health` smoke test, frozen Bun installation, backup-script syntax checks, Cloudflare Pages bundle validation, and offline Bun tests for `tests/functions` and `src`.
- The workflow grants `contents: read`, pins checkout and Bun setup actions by full commit SHA, and disables persisted checkout credentials.
- Separate workflows already cover safety preflight, production QA (manual dispatch), lockfile audit, and other focused tasks.
- Therefore, adding another overlapping test workflow would increase maintenance without closing a demonstrated gap.

## Implemented design

### Repository instructions

Add root `AGENTS.md` for Codex and other coding agents. It defines:
- inspect-first and plan-before-change expectations;
- branch/PR-only development;
- test and final-diff review requirements;
- RAFIQ's current owner-approved product direction;
- existing Supabase project preservation and no Render/no paid-service constraints;
- safe defaults for WhatsApp and Telegram;
- prohibition on real outbound messaging during tests;
- explicit approval gates for merge, deploy, migrations, webhooks, and production settings;
- accurate reporting of executed versus merely inspected checks.

Superpowers is an assistant-side skill workflow, not a GitHub Actions runtime. Contributors should use it when available, but repository instructions must remain useful when those skills are unavailable. CI does not claim to execute Superpowers.

### CI coverage

Extend the existing edge-function workflow's pull-request path filters to include `AGENTS.md` and `docs/superpowers/**`. This ensures changes to engineering governance trigger the existing verification suite without creating a duplicate workflow.

The existing workflow remains the source of truth for:
- Docker image build and local health smoke test;
- frozen Bun dependency installation;
- shell syntax checks;
- Cloudflare Pages bundle generation and retired-host scan;
- mocked/offline Supabase Edge Function tests and source tests.

### Release gates

- All changes remain on a dedicated branch and are proposed through a PR.
- No automatic merge or production deployment is introduced.
- CI permissions remain read-only.
- No Supabase project, schema, data, secrets, Edge Functions, webhook, Meta/Kapso, Telegram, WhatsApp, Cloudflare, or hosting configuration is changed.
- CI success must not be represented as live integration or production verification.

## Verification and acceptance

The PR must trigger the existing workflow because the changed paths are included in its pull-request filters. Review the actual run before declaring CI successful. A successful source-level commit or PR creation is not itself a test result.

Owner approval is still required before merge to `main`. Any later production deployment or live integration change requires its own explicit approval and verification plan.
