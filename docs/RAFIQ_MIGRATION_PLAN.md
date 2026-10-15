# RAFIQ migration plan

## Target architecture
- Frontend/PWA: Cloudflare Pages free plan, built by `bash ops/build-cloudflare-pages.sh` into `dist/`.
- Candidate API: Hugging Face Spaces Docker SDK, Bun 1.3.10/Elysia on port 7860.
- Data: retain existing Supabase project `qmuxaehrahfsnabyjens`; no data migration.
- Render: retired; `render.yaml` removed. No paid plan is enabled by this change.

## Order of operations
1. Commit reviewed container/PWA/docs changes to GitHub `main`.
2. Confirm Hugging Face Space is configured to build from the updated repository (a GitHub commit alone does not deploy a separately hosted Space).
3. Configure required server secrets privately; leave WhatsApp, marketing, broadcasts and automatic webhook registration off.
4. Build and verify `GET /health` and `GET /api/status`; inspect startup logs without exposing secrets.
5. Verify backend Supabase connectivity using least-privilege credentials and read-only checks.
6. Create/connect Cloudflare Pages, configure documented variables, run build, and obtain the actual assigned URL.
7. Test public routes and admin denial/RLS behavior.
8. Only after the candidate Telegram route is verified, decide whether to cut over from the current Supabase Edge Function. Preserve rollback details.

## Rollback
- Revert the migration commit if a source regression is found.
- Do not reactivate a paid service.
- Keep Supabase tables, data, secrets and current Telegram Edge Function untouched during rollback.
