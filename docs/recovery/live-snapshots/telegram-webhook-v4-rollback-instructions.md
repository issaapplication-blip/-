# Telegram webhook live v4 rollback snapshot

Captured from Supabase project `qmuxaehrahfsnabyjens` immediately before a reversible rollout on 2026-10-15.

- Function: `telegram-webhook`
- Live version captured: `4`
- `verify_jwt=false`; application-level Telegram secret validation is implemented in the code.
- Source SHA-256 reported by Supabase: `ec3592705fb6c61dfaff3656990a8463567403e2d23a091a9dd899587241450e`
- Snapshot: `docs/recovery/live-snapshots/telegram-webhook-v4-live-20261015.ts`
- No secret values are included; the source reads secrets from the Supabase function environment.

## Rollback
In Supabase Dashboard → Edge Functions → `telegram-webhook`, redeploy the snapshot source as `index.ts` while preserving `verify_jwt=false` and the existing secret settings. This restores the exact captured v4 handler. Do not delete the newer version or change bot/webhook registration as part of rollback.
