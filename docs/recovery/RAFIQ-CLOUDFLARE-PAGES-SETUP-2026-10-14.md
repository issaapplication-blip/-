# Cloudflare Pages rollout (free plan, existing Supabase)

## Git integration settings
- Repository: `issaapplication-blip/-`
- Production branch: `main`
- Build command: `bash ops/build-cloudflare-pages.sh`
- Build output directory: `dist`
- Root directory: repository root
- The Functions directory is `functions/` at the repository root.
- Use the Pages project's assigned `https://<project>.pages.dev` origin for `RAFIQ_PUBLIC_BASE_URL`; don't set it to the suspended Render URL.

## Pages Functions environment variables
Configure for Production and Preview as appropriate:
- `RAFIQ_PUBLIC_BASE_URL`: exact final HTTPS origin, e.g. the assigned `https://<project>.pages.dev`.
- `SUPABASE_URL`: `https://qmuxaehrahfsnabyjens.supabase.co`.
- `SUPABASE_ANON_KEY`: the **legacy anon JWT key** from the existing Supabase project API settings. It is public by design, but keep configuration out of Git. Do NOT use the service-role key.
- Under Settings > Bindings > Add > Workers AI, create binding named `AI`. It's optional: without it, the chat uses local guided responses. The code uses `@cf/meta/llama-3.1-8b-instruct`, which is listed in Cloudflare's Workers AI documentation. Workers AI has a 10,000-neuron daily free allocation on the Free plan; exceeding it stops inference rather than automatically charging on Workers Free. See https://developers.cloudflare.com/workers-ai/platform/pricing/ and https://developers.cloudflare.com/workers-ai/platform/data-usage/.

## API routes supplied here
- `POST /api/public/intake` and `POST /api/public/institution-intake`: same-origin proxy to the current `public-intake` Edge Function, using only the legacy anon JWT; service credentials remain server-side in Supabase.
- `POST /api/agent/chat`: short Arabic guided response with optional Workers AI. Phone numbers are redacted before inference; it avoids AI for emergency/price questions and returns safe guided fallbacks.
- `GET /api/status`: static health response.
- `/admin.html`: static page, but the panel itself now requires `is_admin()` plus an active admin profile; protected data/write access remains enforced by Supabase RLS and guarded RPCs.

## Deliberately excluded
- `public/auto-reply.mjs` is excluded from the deployed static output.
- No Supabase service-role key, Meta/WhatsApp token, or Telegram bot token belongs in Cloudflare's frontend or Git.
- WhatsApp automatic replies remain disabled.
- The static bundle changes canonical, Open Graph, sitemap, robots, and admin redirect URLs to the selected Pages origin during build.

## Deployment blocker
A Cloudflare account owner must authenticate to the Cloudflare Dashboard, create/connect the Pages project, authorize GitHub and configure the variables/binding above. No browser login/profile is connected in the current tool session, so no Pages URL exists yet. Do not put any password/token in chat.

## Local/CI validation
```bash
RAFIQ_PUBLIC_BASE_URL=https://rafiq-preview.pages.dev bash ops/build-cloudflare-pages.sh
```
The output in `dist/` is disposable; the script recreates it and is intended for CI/build use.
