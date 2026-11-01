import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY);
const TELEGRAM_BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const TELEGRAM_MANAGER_CHAT_IDS = (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function readLimitedBody(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } catch {
    return null;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function verifySignature(body: string, header: string | null) {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = "sha256=" + hex(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(body)
  ));
  return timingSafeEqual(expected, header);
}

// WhatsApp is an owner-operated inbox only. The RAFIQ AI agent never handles WhatsApp messages.
// The owner reads the forwarded question and sends any WhatsApp reply manually from WhatsApp.
function relayText(msg: { from: string; type: string; text: string; profileName: string; mediaId: string },): string {
  const sender = "+" + msg.from.replace(/^\+/, "");
  const body = msg.text || "[رسالة غير نصية: " + (msg.type || "unknown") + "]";
  const media = msg.mediaId ? "\nمعرّف الوسائط: " + msg.mediaId : "";
  return [
    "📩 رسالة WhatsApp جديدة إلى RAFIQ",
    "المرسل: " + sender + (msg.profileName ? " (" + msg.profileName.slice(0, 60) + ")" : ""),
    "النوع: " + (msg.type || "unknown"),
    "",
    body.slice(0, 2600) + media,
    "",
    "هذه الرسالة للمالك فقط. الوكيل يعمل على Telegram فقط؛ اقرأ السؤال وأرسل جوابك يدوياً من WhatsApp.",
  ].join("\n").slice(0, 3800);
}

async function relayToOwner(text: string, phone: string): Promise<number> {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_MANAGER_CHAT_IDS.length === 0) {
    throw new Error("telegram_owner_relay_not_configured");
  }
  let delivered = 0;
  for (const chatId of TELEGRAM_MANAGER_CHAT_IDS) {
    try {
      const response = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: "فتح محادثة WhatsApp", url: "https://wa.me/" + phone.replace(/\D/g, "") }]] },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.ok === true) delivered++;
    } catch {
      // Continue to the remaining owner chats; never log tokens, phone numbers or message content.
    }
  }
  if (delivered === 0) throw new Error("telegram_owner_relay_failed");
  return delivered;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token && timingSafeEqual(token, expected) && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { ...cors, Allow: "GET, POST, OPTIONS" } });
  }

  const maxBodyBytes = 512000;
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > maxBodyBytes) return new Response("Payload Too Large", { status: 413, headers: cors });
  const bodyBytes = await readLimitedBody(req, maxBodyBytes);
  if (bodyBytes === null) return new Response("Payload Too Large", { status: 413, headers: cors });
  const body = new TextDecoder().decode(bodyBytes);

  if (!(await verifySignature(body, req.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401, headers: cors });
  }

  try {
    const payload = JSON.parse(body);
    if (payload?.object !== "whatsapp_business_account") {
      return Response.json({ ok: true, ignored: true }, { headers: cors });
    }

    const statuses: Array<{ id: string; status: string; payload: unknown }> = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        for (const status of change?.value?.statuses || []) {
          if (status?.id && status?.status) {
            statuses.push({ id: String(status.id), status: String(status.status), payload: status });
          }
        }
      }
    }
    for (const status of statuses) {
      const { error } = await db.from("whatsapp_outbound_messages")
        .update({ status: status.status, payload: status.payload })
        .eq("provider", "meta")
        .eq("provider_message_id", status.id);
      if (error) console.error("outbound status update failed", error.message);
    }

    const messages = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const names: Record<string, string> = {};
        for (const contact of change?.value?.contacts || []) {
          if (contact?.wa_id) names[String(contact.wa_id)] = String(contact?.profile?.name || "");
        }
        for (const msg of change?.value?.messages || []) {
          const mediaId = String(msg?.image?.id || msg?.document?.id || msg?.audio?.id || msg?.video?.id || msg?.sticker?.id || "");
          const location = msg?.location;
          messages.push({
            id: String(msg.id || ""),
            from: String(msg.from || ""),
            profileName: names[String(msg.from || "")] || "",
            type: String(msg.type || ""),
            mediaId,
            text: typeof msg?.text?.body === "string" ? msg.text.body.trim()
              : typeof msg?.image?.caption === "string" ? msg.image.caption.trim()
              : typeof msg?.document?.caption === "string" ? msg.document.caption.trim()
              : typeof msg?.document?.filename === "string" ? "Document: " + msg.document.filename.slice(0, 160)
              : typeof location?.latitude === "number" && typeof location?.longitude === "number"
                ? "Location: " + location.latitude + ", " + location.longitude
              : typeof msg?.interactive?.button_reply?.title === "string" ? msg.interactive.button_reply.title
              : typeof msg?.interactive?.list_reply?.title === "string" ? msg.interactive.list_reply.title
              : typeof msg?.button?.text === "string" ? msg.button.text
              : ""
          });
        }
      }
    }

    for (const msg of messages) {
      if (!msg.id || !msg.from) continue;

      const insert = await db.from("whatsapp_inbound_events").insert({
        provider: "meta",
        provider_message_id: msg.id,
        from_phone: msg.from,
        message_type: msg.type,
        text_body: msg.text || null,
        payload,
        processing_status: "received"
      });

      if (insert.error) {
        if (insert.error.code === "23505") continue;
        console.error("inbound insert failed", insert.error.message);
        continue;
      }

      // WhatsApp messages are relayed to the configured owner Telegram chat(s) only.
      // No agent invocation and no outbound WhatsApp API call exists in this handler.
      try {
        const notice = relayText(msg);
        await relayToOwner(notice, msg.from);
        await db.from("whatsapp_inbound_events")
          .update({ processing_status: "forwarded_to_owner", processed_at: new Date().toISOString(), error_message: null })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
      } catch {
        console.error("WhatsApp owner relay failed; message retained for manual review.");
        await db.from("whatsapp_inbound_events")
          .update({ processing_status: "failed", error_message: "telegram_owner_relay_failed" })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
      }
    }

    return Response.json({ ok: true, received: messages.length, statuses: statuses.length }, { headers: cors });
  } catch (error) {
    console.error("webhook parse/processing error", String(error));
    return Response.json({ ok: false }, { status: 200, headers: cors });
  }
});
