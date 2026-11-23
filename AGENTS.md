# RAFIQ engineering instructions

These instructions apply to the entire repository and are intended for Codex and other coding agents.

## Required workflow

1. Inspect the current branch, working tree, relevant source files, tests, deployment configuration, and recent history before editing.
2. For non-trivial work, write or update a concise implementation plan before changing code. If the Superpowers skills are available, follow their documented workflow (brainstorming/design, planning, implementation, verification, and review). Do not claim a skill ran when it was unavailable.
3. Prefer the smallest coherent change. Reuse existing architecture, scripts, tests, and GitHub Actions rather than adding parallel systems.
4. Work on a dedicated branch. Never commit directly to `main`.
5. Add or update tests for behavior changes. Run the narrowest relevant tests first, then the complete applicable checks.
6. Review the final diff for scope creep, secrets, unsafe defaults, unrelated formatting, and generated artifacts. Report commands and actual results; distinguish executed checks from checks merely inspected in source.

## RAFIQ product and architecture constraints

- Treat the latest owner-approved product direction as authoritative: public informational directory and approved partner advertising by region, plus CV and Cover Letter creation. Do not reintroduce provider applications, care-request intake, admissions, or retired flows without a new explicit product decision.
- Verify the current target branch and open pull requests before assuming a proposed direction is already merged. Do not undo or duplicate work on open PRs.
- Preserve the existing Supabase project `qmuxaehrahfsnabyjens`. Never create another Supabase project, migrate user data, or recreate tables as a workaround.
- Do not use Render or introduce a Render fallback.
- Do not add paid services or subscriptions without explicit approval.
- Keep secrets server-side. Never commit API keys, bot tokens, service-role keys, passwords, private URLs, or real user data. Do not print secrets in logs or test output.
- Keep WhatsApp outbound sending, automatic replies, unsolicited broadcasts, and automatic Telegram webhook registration disabled unless a separately reviewed and explicitly approved change requires otherwise.
- Do not send real Telegram/WhatsApp messages as tests. Use mocks, fixtures, and isolated offline tests.
- Do not alter production webhooks, hosting settings, environment variables, Supabase schema/data, Edge Function deployments, or DNS as part of ordinary code changes.

## GitHub, CI, and release policy

- All changes go through a feature/fix branch and a Pull Request targeting `main`.
- CI must use least-privilege permissions (normally `contents: read`), pinned third-party actions by full commit SHA, bounded job timeouts, and `persist-credentials: false` for checkout unless a reviewed exception is necessary.
- CI tests must be deterministic and offline by default. No production secrets or external side effects are permitted.
- Reuse the existing Bun 1.3.10 toolchain, lockfile, test suites, Docker health smoke test, and Cloudflare Pages build checks. Do not add duplicate workflows without a demonstrated gap.
- A green CI run is evidence only for the checks it actually executed. It is not proof of live Supabase, Telegram, WhatsApp, hosting, or production health.
- Never merge a PR, push to `main`, deploy, apply a migration, register a webhook, or change production configuration without the owner's explicit approval for that specific action.

## Verification commands

Use the repository's current scripts and inspect their definitions before relying on them. The currently documented CI checks include:

```bash
bun install --frozen-lockfile
bun test tests/functions
bun test src
RAFIQ_PUBLIC_BASE_URL=https://rafiq-ci.pages.dev bash ops/build-cloudflare-pages.sh
```

The Docker build and isolated `/health` smoke test are run by the existing GitHub Actions workflow. Do not claim any command passed unless it was actually executed and its exit status was observed.

## Required completion report

For every task, report:
- branch and files changed;
- design/implementation decisions and any intentionally untouched systems;
- exact checks run and pass/fail/blocked status;
- remaining risks or required owner decisions;
- Pull Request URL when one was created.

Keep reports factual and concise. Never describe a draft PR as merged or deployed.
