import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configuredSiteOrigin = (Deno.env.get("RAFIQ_PUBLIC_SITE_URL") || "").trim().replace(/\/+$/, "");
const allowedOrigins = new Set(["https://rafiq-lebanon.pages.dev", "https://issaapplication-blip.github.io", configuredSiteOrigin]
  .filter((origin) => Boolean(origin) && origin !== "https://rafiq-o6qd.onrender.com" && origin.startsWith("https://")));
const MAX_BODY_BYTES = 64 * 1024;
const types = new Set(["CV + Cover Letter"]);
const encoder = new TextEncoder();
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
const allowedHostnames = new Set(Array.from(allowedOrigins, (origin) => new URL(origin).hostname.toLowerCase()));

class HttpError extends Error {
  constructor(public status: number, public code: string, public retryAfter?: number) { super(code); }
}
const corsHeaders = (req: Request) => {
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
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", ...extra } });

function clientIp(req: Request): string {
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean).at(-1) || "";
  const ip = (direct || forwarded).trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new HttpError(503, "client_ip_unavailable");
  return ip;
}
async function rateKey(req: Request): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("rafig-public-intake:" + clientIp(req)));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function rateAllowed(req: Request, scope: string, limit: number, seconds: number): Promise<boolean> {
  const { data, error } = await sb.rpc("consume_rafig_public_rate_limit", {
    p_key_hash: await rateKey(req), p_scope: scope, p_limit: limit, p_window_seconds: seconds,
  });
  if (error) throw new HttpError(503, "rate_limit_unavailable");
  return data === true;
}
async function verifyTurnstile(req: Request, token: unknown, expectedAction: string): Promise<void> {
  if (!TURNSTILE_SECRET) throw new HttpError(503, "verification_unavailable");
  const responseToken = typeof token === "string" ? token.trim() : "";
  if (!responseToken || responseToken.length > 2048) throw new HttpError(400, "verification_required");
  let result: any;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: responseToken, remoteip: clientIp(req), idempotency_key: crypto.randomUUID() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("siteverify_http_error");
    result = await response.json();
  } catch {
    throw new HttpError(503, "verification_unavailable");
  }
  const hostname = String(result?.hostname || "").toLowerCase();
  if (result?.success !== true || !allowedHostnames.has(hostname) || result?.action !== expectedAction) {
    throw new HttpError(403, "verification_failed");
  }
}

async function readBounded(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "payload_too_large");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(req, 403, { ok: false, error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(req, 503, { ok: false, error: "service_unavailable" });
  if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return json(req, 415, { ok: false, error: "json_required" });
  }

  try {
    const raw = await readBounded(req, MAX_BODY_BYTES);
    let body: any;
    try { body = JSON.parse(new TextDecoder().decode(raw)); }
    catch { throw new HttpError(400, "invalid_json"); }

    if (!await rateAllowed(req, "application_intake_10m", 5, 600) ||
        !await rateAllowed(req, "application_intake_24h", 20, 86400)) {
      throw new HttpError(429, "rate_limited", 600);
    }

    if (body?.website) return json(req, 200, { ok: true });
    await verifyTurnstile(req, body?.turnstile_token ?? body?.["cf-turnstile-response"], "public_application_intake");
    const application_type = String(body?.application_type || "").trim();
    const payload = body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
    if (!types.has(application_type)) throw new HttpError(400, "invalid_application_type");
    if (JSON.stringify(payload).length > 30000) throw new HttpError(413, "payload_too_large");

    if (application_type === "CV + Cover Letter") {
      if (String(payload.payment_method || "") !== "Whish Money") throw new HttpError(400, "cv_payment_must_use_whish_money");
      if (!String(payload.payment_reference || "").trim()) throw new HttpError(400, "cv_payment_reference_required");
      payload.payment_status = "pending_verification";
      payload.payment_required = true;
    }

    const applicant_name = String(payload.name || [payload.first, payload.last].filter(Boolean).join(" ") || "").trim().slice(0, 200);
    const phone = String(payload.phone || "").trim().slice(0, 50);
    const area = String(payload.area || payload.preferred_location || payload.care_location || "").trim().slice(0, 200);
    if (!applicant_name || !phone) throw new HttpError(400, "name_and_phone_required");

    const token = crypto.randomUUID() + "-" + crypto.randomUUID();
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))), (b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + 7200000).toISOString();
    const { data, error } = await sb.from("application_intakes").insert({
      application_type, applicant_name, phone, area, payload, source: "platform",
      upload_token_hash: tokenHash, upload_token_expires_at: expires,
    }).select("id,application_number,application_type,status,created_at").single();
    if (error || !data) throw new HttpError(500, "intake_save_failed");

    const agent_reply = `تم استلام طلب CV رقم ${data.application_number}. الطلب بانتظار تأكيد Whish Money من الإدارة ولا يبدأ العمل قبل التأكيد.`;
    await sb.from("application_intakes").update({ agent_reply }).eq("id", data.id);

    return json(req, 201, {
      ok: true,
      application: { ...data, agent_reply },
      upload_token: token,
      upload_token_expires_at: expires,
    });
  } catch (error) {
    const e = error instanceof HttpError ? error : new HttpError(500, "request_failed");
    return json(req, e.status, { ok: false, error: e.code }, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
  }
});
