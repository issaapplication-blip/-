import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
const SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const VERIFY_TOKEN = (Deno.env.get("META_VERIFY_TOKEN") || "").trim();
const APP_SECRET = (Deno.env.get("META_APP_SECRET") || "").trim();
const TELEGRAM_BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const MANAGER_CHAT_IDS = [...new Set((Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((value) => value.trim()).filter((value) => /^-?\d+$/.test(value)))];
const MANAGER_IDS_INVALID = (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean).some((value) => !/^-?\d+$/.test(value));
const MAX_BODY_BYTES = 512 * 1024;

const db = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length || left.length === 0) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!APP_SECRET || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected.toLowerCase(), signature.toLowerCase());
}

async function sendTelegramManagerMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || MANAGER_CHAT_IDS.length === 0 || MANAGER_IDS_INVALID) {
    throw new Error("telegram_manager_delivery_not_configured");
  }
  const safeText = text.length > 3800 ? text.slice(0, 3800) + "\n… [تم اختصار الرسالة]" : text;
  const failures: string[] = [];
  for (const chatId of MANAGER_CHAT_IDS) {
    try {
      const response = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: safeText, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok !== true) failures.push(String(result?.error_code || response.status));
    } catch {
      failures.push("telegram_transport_error");
    }
  }
  if (failures.length) throw new Error("telegram_manager_delivery_failed:" + failures.join(","));
}

type InboundMessage = {
  id: string;
  from: string;
  type: string;
  text: string;
  timestamp: string;
};

function extractMessages(payload: any): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const id = typeof message?.id === "string" ? message.id.trim() : "";
        const from = typeof message?.from === "string" ? message.from.trim() : "";
        if (!id || !from) continue;
        messages.push({
          id,
          from,
          type: typeof message?.type === "string" ? message.type : "unknown",
          text: typeof message?.text?.body === "string" ? message.text.body.trim() : "",
          timestamp: typeof message?.timestamp === "string" ? message.timestamp : "",
        });
      }
    }
  }
  return messages;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode") || "";
    const supplied = url.searchParams.get("hub.verify_token") || "";
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && safeEqual(supplied, VERIFY_TOKEN) && challenge !== null) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST, OPTIONS" } });
  if (!db || !SUPABASE_URL || !SERVICE_KEY || !APP_SECRET || !VERIFY_TOKEN || !TELEGRAM_BOT_TOKEN || MANAGER_CHAT_IDS.length === 0 || MANAGER_IDS_INVALID) {
    return json(503, { ok: false, error: "relay_configuration_incomplete" });
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return new Response("Payload Too Large", { status: 413 });
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return new Response("Payload Too Large", { status: 413 });
  if (!(await verifySignature(rawBody, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }
  if (payload?.object !== "whatsapp_business_account") return json(200, { ok: true, ignored: true });

  const messages = extractMessages(payload);
  let received = 0;
  let forwarded = 0;
  let duplicates = 0;
  let failed = 0;

  for (const message of messages) {
    received++;
    const inserted = await db.from("whatsapp_inbound_events").insert({
      provider: "meta",
      provider_message_id: message.id,
      from_phone: message.from,
      message_type: message.type,
      text_body: message.text || null,
      payload: { timestamp: message.timestamp, type: message.type },
      processing_status: "received",
    });

    if (inserted.error?.code === "23505") {
      duplicates++;
      continue;
    }
    if (inserted.error) {
      failed++;
      console.error(JSON.stringify({ event: "whatsapp_inbound_store_failed", code: inserted.error.code || "db_error" }));
      continue;
    }

    if (!message.text) {
      const notice = [
        "رسالة WhatsApp واردة (محتوى غير نصي)",
        "المرسل: +" + message.from,
        "النوع: " + message.type,
        "معرّف الرسالة: " + message.id,
        "يرجى مراجعتها يدويًا في سجل الوارد.",
      ].join("\n");
      try {
        await sendTelegramManagerMessage(notice);
        await db.from("whatsapp_inbound_events").update({
          processing_status: "forwarded_to_manager",
          processed_at: new Date().toISOString(),
        }).eq("provider", "meta").eq("provider_message_id", message.id);
        forwarded++;
      } catch {
        failed++;
        await db.from("whatsapp_inbound_events").update({
          processing_status: "failed",
          error_message: "telegram_manager_delivery_failed",
        }).eq("provider", "meta").eq("provider_message_id", message.id);
      }
      continue;
    }

    const managerText = [
      "📩 رسالة WhatsApp واردة — تحتاج إلى رد يدوي",
      "رقم المرسل: +" + message.from,
      "نص الرسالة:",
      message.text,
      "معرّف الرسالة: " + message.id,
      "تنبيه: لم يتم استدعاء أي وكيل، ولم يُرسل أي رد إلى WhatsApp.",
    ].join("\n");

    try {
      await sendTelegramManagerMessage(managerText);
      const updated = await db.from("whatsapp_inbound_events").update({
        processing_status: "forwarded_to_manager",
        processed_at: new Date().toISOString(),
        error_message: null,
      }).eq("provider", "meta").eq("provider_message_id", message.id);
      if (updated.error) throw new Error("inbound_status_update_failed");
      forwarded++;
    } catch (error) {
      failed++;
      await db.from("whatsapp_inbound_events").update({
        processing_status: "failed",
        error_message: String(error).slice(0, 240),
      }).eq("provider", "meta").eq("provider_message_id", message.id);
      console.error(JSON.stringify({ event: "whatsapp_manager_relay_failed", message_id: message.id }));
    }
  }

  return json(200, { ok: true, received, forwarded, duplicates, failed });
});
