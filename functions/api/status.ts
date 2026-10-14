export const onRequestGet = () => Response.json(
  { ok: true, service: "RAFIQ", hosting: "Cloudflare Pages + Supabase Edge Functions" },
  { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
);
