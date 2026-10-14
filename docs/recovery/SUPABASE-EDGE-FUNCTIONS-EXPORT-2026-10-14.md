# RAFIQ — Live Supabase Edge Function source recovery

- Export date: 2026-10-14
- Project ref: `qmuxaehrahfsnabyjens`
- Method: read-only retrieval through the connected Supabase project tools
- Target branch: `recovery/supabase-edge-functions-20261014`
- Production was not modified; no function was deployed by this recovery operation.
- These files are recovered source snapshots, not proof that the repository versions are equivalent or that a redeploy is safe.
- Do not deploy until each function is reviewed against its current production version, secrets/config are inventoried, and staging tests pass.

| Function | Live version | verify_jwt | Live source SHA-256 metadata | Recovered path |
|---|---:|---:|---|---|
| `public-application-intake` | 6 | false | `53878633cf86d451f4d288af4a07cd8d43e4354dd728088108c50b5427ddb348` | `supabase/functions/public-application-intake/index.ts` |
| `public-application-upload` | 5 | false | `71d21a83c9ada044b964bfa39c4f3837b1f4561a54bf42acdd08f6de934b0efa` | `supabase/functions/public-application-upload/index.ts` |
| `meta-whatsapp-webhook` | 3 | false | `4a6e9f8daedc3e146bbfb1bdceafbd75087de0859aff02caa59f43bc40b0645e` | `supabase/functions/meta-whatsapp-webhook/index.ts` |
| `rafiq-agent` | 6 | true | `9d4b3dc8011ec3f079af3892780c9db3160fde9d4ee25d0ea7dcee93e5a00fdb` | `supabase/functions/rafiq-agent/index.ts` |
| `public-intake` | 1 | true | `ce97ec73deb7b78eb6fdbd7832b3dae02c80bad9cfe2a9dd4356038240341b39` | `supabase/functions/public-intake/index.ts` |

## Important notes

- `public-application-intake`, `public-application-upload`, and `meta-whatsapp-webhook` currently have JWT verification disabled at the Edge Function gateway; their request-level validation must be reviewed before any deployment.
- `rafiq-agent` and `public-intake` currently have JWT verification enabled.
- This export contains source files only. It does not export project secrets, Storage objects, database contents, Auth users, schedules, or all project configuration.
- No automated WhatsApp message was sent. No webhook URL or DNS was changed.
