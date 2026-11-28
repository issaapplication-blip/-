import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configuredSiteOrigin = (Deno.env.get("RAFIQ_PUBLIC_SITE_URL") || "").trim().replace(/\/+$/, "");
const allowedOrigins = new Set(["https://rafiq-lebanon.pages.dev", "https://issaapplication-blip.github.io", configuredSiteOrigin]
  .filter((origin) => Boolean(origin) && origin !== "https://rafiq-o6qd.onrender.com" && origin.startsWith("https://")));
const MAX_BODY_BYTES = 4096;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(public status: number, public code: string, public retryAfter?: number) { super(code); }
}
const headers = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
};
const json = (req: Request, status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers(req), "Content-Type": "application/json; charset=utf-8", ...extra } });

function clientIp(req: Request): string {
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean).at(-1) || "";
  const ip = (direct || forwarded).trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new HttpError(503, "client_ip_unavailable");
  return ip;
}
async function visitorHash(req: Request): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("rafig-pwa-install:" + clientIp(req)));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function readBounded(req: Request): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, "payload_too_large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function rateAllowed(req: Request, scope: string, limit: number, seconds: number): Promise<boolean> {
  const { data, error } = await sb.rpc("consume_rafig_public_rate_limit", {
    p_key_hash: await visitorHash(req), p_scope: scope, p_limit: limit, p_window_seconds: seconds,
  });
  if (error) throw new HttpError(503, "rate_limit_unavailable");
  return data === true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(req, 403, { ok: false, error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(req, 503, { ok: false, error: "service_unavailable" });
  if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) return json(req, 415, { ok: false, error: "json_required" });

  try {
    const raw = await readBounded(req);
    let body: any;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, "invalid_json"); }

    if (!await rateAllowed(req, "pwa_install_10m", 10, 600) ||
        !await rateAllowed(req, "pwa_install_24h", 50, 86400)) throw new HttpError(429, "rate_limited", 600);

    const installationId = String(body?.p_installation_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) {
      throw new HttpError(400, "invalid_installation_id");
    }
    const { data, error } = await sb.rpc("record_pwa_install", {
      p_installation_id: installationId,
      p_user_agent: String(body?.p_user_agent || "").slice(0, 512),
      p_platform: String(body?.p_platform || "").slice(0, 120),
      p_language: String(body?.p_language || "").slice(0, 32),
      p_app_version: String(body?.p_app_version || "").slice(0, 64),
      p_source_path: String(body?.p_source_path || "").slice(0, 240),
    });
    if (error) throw new HttpError(503, "telemetry_unavailable");
    return json(req, 200, { ok: true, created: data?.created === true });
  } catch (error) {
    const e = error instanceof HttpError ? error : new HttpError(500, "request_failed");
    return json(req, e.status, { ok: false, error: e.code }, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
  }
});
