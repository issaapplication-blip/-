const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

// Legacy Cloudflare D1 Telegram receiver is intentionally retired.
// The only supported production receiver is the existing Supabase Edge Function.
export const onRequestGet = (): Response =>
  json(410, { ok: false, error: "telegram_cloudflare_d1_webhook_retired", active_receiver: "supabase/functions/v1/telegram-webhook" });

export const onRequestPost = (): Response =>
  json(410, { ok: false, error: "telegram_cloudflare_d1_webhook_retired", active_receiver: "supabase/functions/v1/telegram-webhook" });
