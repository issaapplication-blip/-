# RAFIQ agent v7 recovery note — 2026-10-14

- Live Supabase function: `rafiq-agent`
- Live version confirmed after deployment: v7
- JWT verification remains enabled (`verify_jwt=true`)
- Source copied from the live v7 function into this branch so the deployed source is version-controlled.
- Improvements in v7: 10-second provider timeouts; optional Gemini/OpenAI provider selection using configured model names; Arabic normalization and service-specific fallback replies; conversation read/write errors are surfaced; escalation records are only created on transition to an open escalation; bounded input validation.
- WhatsApp automatic replies were not enabled or changed by this deployment.
- No Supabase secrets were changed.
- Verification limitation: source deployment succeeded and the function is ACTIVE, but no end-to-end Telegram invocation or automated Deno test run was performed in this operation. Telegram webhook update-level idempotency still requires a separate migration/handler change; the existing app has a message_id context check for ordinary messages but not a durable update_id claim for every Telegram update type.
