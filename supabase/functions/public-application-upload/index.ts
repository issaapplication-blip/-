import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const configuredSiteOrigin = (Deno.env.get("RAFIQ_PUBLIC_SITE_URL") || "").trim().replace(/\/+$/, "");
const allowedOrigins = new Set(["https://rafiq-lebanon.pages.dev", "https://issaapplication-blip.github.io", configuredSiteOrigin]
  .filter((origin) => Boolean(origin) && origin !== "https://rafiq-o6qd.onrender.com" && origin.startsWith("https://")));
const MAX_BODY_BYTES = 35 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 30 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const mime = new Set([
  "application/pdf", "image/jpeg", "image/png", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const categories = new Set(["cv", "payment_proof"]);
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
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("rafig-public-upload:" + clientIp(req)));
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
const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
function containsAscii(bytes: Uint8Array, value: string): boolean {
  const needle = encoder.encode(value);
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
async function validateFile(file: File): Promise<Uint8Array> {
  if (!mime.has(file.type)) throw new HttpError(415, "unsupported_file_type");
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new HttpError(413, "file_size_invalid");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let valid = false;
  if (file.type === "application/pdf") valid = startsWith(bytes, [0x25,0x50,0x44,0x46,0x2d]);
  else if (file.type === "image/jpeg") valid = startsWith(bytes, [0xff,0xd8,0xff]);
  else if (file.type === "image/png") valid = startsWith(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  else if (file.type === "application/msword") valid = startsWith(bytes, [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    valid = startsWith(bytes, [0x50,0x4b,0x03,0x04]) &&
      containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "word/document.xml");
  }
  if (!valid) throw new HttpError(415, "file_content_mismatch");
  return bytes;
}
function safeFileName(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-180) || "document";
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json(req, 403, { ok: false, error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(req, 503, { ok: false, error: "service_unavailable" });
  if (!(req.headers.get("content-type") || "").toLowerCase().includes("multipart/form-data")) {
    return json(req, 415, { ok: false, error: "multipart_required" });
  }

  const storagePaths: string[] = [];
  const savedIds: string[] = [];
  let reservationId: string | null = null;
  try {
    if (!await rateAllowed(req, "application_upload_10m", 15, 600) ||
        !await rateAllowed(req, "application_upload_24h", 60, 86400)) {
      throw new HttpError(429, "rate_limited", 600);
    }

    const raw = await readBounded(req, MAX_BODY_BYTES);
    const formRequest = new Request(req.url, { method: "POST", headers: req.headers, body: raw });
    const form = await formRequest.formData();
    const intakeId = String(form.get("intake_id") || "");
    const token = String(form.get("upload_token") || "");
    await verifyTurnstile(req, form.get("cf-turnstile-response") || form.get("turnstile_token"), "public_application_upload");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intakeId) || token.length < 40 || token.length > 200) {
      throw new HttpError(400, "invalid_upload_credentials");
    }

    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: intake, error: intakeError } = await sb.from("application_intakes")
      .select("id,application_type,status,upload_token_hash,upload_token_expires_at").eq("id", intakeId).single();
    if (intakeError || !intake) throw new HttpError(404, "invalid_intake");
    if (intake.application_type !== "CV + Cover Letter" || !["pending","review"].includes(intake.status)) {
      throw new HttpError(403, "upload_window_closed");
    }
    if (!intake.upload_token_hash || !constantTimeEqual(intake.upload_token_hash, tokenHash)) {
      throw new HttpError(403, "invalid_upload_token");
    }
    if (!intake.upload_token_expires_at || new Date(intake.upload_token_expires_at).getTime() <= Date.now()) {
      throw new HttpError(403, "upload_token_expired");
    }

    const rawFiles = form.getAll("files");
    const files = rawFiles.filter((value): value is File => value instanceof File);
    const categoriesForFiles = form.getAll("document_category").map(String);
    if (files.length !== rawFiles.length || files.length < 1 || files.length > 8 || categoriesForFiles.length !== files.length) {
      throw new HttpError(400, "invalid_file_set");
    }

    const prepared: { file: File; bytes: Uint8Array; category: string; safeName: string }[] = [];
    let totalBytes = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_FILE_BYTES) throw new HttpError(413, "total_file_size_exceeded");
      const category = categoriesForFiles[i];
      if (!categories.has(category)) throw new HttpError(400, "invalid_document_category");
      const bytes = await validateFile(file);
      prepared.push({ file, bytes, category, safeName: safeFileName(file.name) });
    }

    const { data: reservation, error: reservationError } = await sb.rpc("reserve_rafig_upload_slots", {
      p_intake_id: intakeId, p_slots: files.length,
    });
    if (reservationError) throw new HttpError(503, "upload_reservation_unavailable");
    if (typeof reservation !== "string" || !reservation) throw new HttpError(409, "file_limit_reached");
    reservationId = reservation;

    const saved = [];
    for (const item of prepared) {
      const path = `intake/${intakeId}/${crypto.randomUUID()}-${item.safeName}`;
      const blob = new Blob([item.bytes], { type: item.file.type });
      const { error: uploadError } = await sb.storage.from("private_documents").upload(path, blob, {
        contentType: item.file.type, upsert: false,
      });
      if (uploadError) throw new HttpError(500, "file_storage_failed");
      storagePaths.push(path);

      const { data: row, error: rowError } = await sb.from("application_intake_files").insert({
        intake_id: intakeId, storage_path: path, file_name: item.safeName,
        mime_type: item.file.type, file_size: item.file.size, document_category: item.category,
      }).select("id,file_name,storage_path,document_category,verification_status").single();
      if (rowError || !row) throw new HttpError(500, "file_record_failed");
      savedIds.push(row.id);
      saved.push(row);
    }

    await sb.rpc("release_rafig_upload_slots", { p_reservation_id: reservationId });
    reservationId = null;
    return json(req, 201, { ok: true, files: saved });
  } catch (error) {
    if (savedIds.length) await sb.from("application_intake_files").delete().in("id", savedIds);
    if (storagePaths.length) await sb.storage.from("private_documents").remove(storagePaths);
    if (reservationId) await sb.rpc("release_rafig_upload_slots", { p_reservation_id: reservationId });
    const e = error instanceof HttpError ? error : new HttpError(500, "upload_failed");
    return json(req, e.status, { ok: false, error: e.code }, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {});
  }
});
