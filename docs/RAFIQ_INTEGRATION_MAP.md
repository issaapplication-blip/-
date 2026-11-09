# RAFIQ integration map

Audit date: 2026-10-15.

| Integration | Current code/documented endpoint | Status / safety |
|---|---|---|
| Web API | Bun + Elysia in `src/index.ts`; container port 7860 | Code configured; new hosted runtime not verified |
| Health | `GET /health`; status `GET /api/status` | Implemented in source; must be tested after deployment |
| Supabase REST | Existing project `qmuxaehrahfsnabyjens` | Live schema access blocked for this session |
| Telegram existing webhook | `https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/telegram-webhook` | Existing rollout document reports Edge Function v5 ACTIVE; fresh live verification unavailable |
| Candidate backend Telegram route | `/api/telegram/webhook` | Do not register until deployed, health-checked, secret configured, and tested |
| WhatsApp | Existing WhatsApp number and channel | Manual app/channel use only; no API or automatic posting |
| Meta Cloud API / Kapso | Retired from runtime source | No account access, API calls, webhook processing, or automatic sending |
| Cloudflare Pages | `ops/build-cloudflare-pages.sh`, `functions/` | Build path documented; actual Pages URL not available yet |
| Hugging Face Spaces | Docker SDK, port 7860 | Repository connection/deployment not verified |

## Environment and secret rules
- `PORT=7860`, `NODE_ENV=production`.
- Server-only credentials belong in hosting secret settings, not source control.
- Supabase public/anon key may be used client-side only where intended and with RLS; never use `service_role` in browser code.
- Telegram secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; do not paste into chat or commit.
- Optional Workers AI credentials are documented in the Telegram recovery file; never log their values.
- Do not configure Meta or Kapso credentials. WhatsApp remains manual-only.

Keep the existing Supabase Telegram webhook until the candidate backend is deployed, verifies Telegram's secret header, and passes an isolated test.
