# RAFIQ — Project Operating Rules

Last reviewed: 2026-11-23

## Product scope

RAFIQ is a Lebanon-focused informational directory and advertising platform for management-approved providers: laboratories, radiology/imaging centers, physiotherapy centers, and medical-equipment sales/rental providers. Listings, offers, agreed prices, and provider claims require management verification before publication.

The website retains the CV and Cover Letter preparation service. Do not reintroduce general caregiver/provider applications, care-case intake forms, public admission workflows, or automatic booking unless the owner explicitly changes the product scope.

Customer contact is user-initiated through the verified RAFIQ Telegram and WhatsApp destinations. A link opening a chat is not proof that a message was sent. Do not implement automatic WhatsApp replies or unapproved outbound messaging.

## Discount policy

There is no universal discount percentage, fixed discount amount, or public discount formula. Review each exact test or imaging service against the provider's current agreed price. Management decides whether a discount applies and approves the amount/percentage, validity, eligibility, and terms. A code is generated only after approval, must be unique and one-use, and is marked redeemed only after provider confirmation. Never invent a price, discount, code, provider, or availability.

Keep live codes, customer details, phone numbers, provider quotations, and redemption records outside this public repository in approved private storage.

## Architecture and infrastructure guardrails

- Preserve the existing Supabase project and its data. Do not create a replacement project, migrate data, or apply database migrations without an explicit, reviewed change plan.
- Do not add Render dependencies or paid third-party services as fallback infrastructure.
- Keep WhatsApp manual-only unless a new approved design explicitly changes this requirement.
- Keep Telegram bot/channel/group destinations documented and verified; never expose bot tokens.
- Secrets belong in the host's secret environment settings, never in source, logs, fixtures, screenshots, or Git history.
- Never put a Supabase service-role key or private provider credential in browser code.
- Do not send real customer messages, create discount codes, or change live integrations during tests.

## Engineering workflow

1. Inspect the current default branch and related open PRs before editing.
2. Confirm the change fits the product scope and has a concrete user or operational benefit.
3. Create a focused branch: `feat/<topic>-YYYYMMDD`, `fix/<topic>-YYYYMMDD`, `docs/<topic>-YYYYMMDD`, or `test/<topic>-YYYYMMDD`.
4. Make the smallest coherent change. Do not combine unrelated refactors.
5. Add or update automated tests and documentation for behavior changes.
6. Run offline/unit tests and build checks. Do not use production data or send real messages.
7. Open a PR with scope, risk, tests run, rollback notes, and any required environment changes.
8. Merge only after review and passing checks. Production deployment, Supabase writes/migrations, and external messaging remain separately gated by explicit owner approval.

## Definition of done

- The diff is limited to the stated task.
- Existing user-facing scope and data-integrity requirements are preserved.
- No secrets, live customer data, or invented provider information are included.
- Relevant tests pass; limitations are reported rather than hidden.
- Documentation and rollback guidance match the actual implementation.
- The PR states clearly whether it changes source, database, infrastructure, or deployment behavior.
