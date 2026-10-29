import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-hub-signature-256, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY);
const WHATSAPP_AUTOREPLY_ENABLED = false; // Keep disabled until a separately reviewed re-enable change.

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

async function sendWhatsAppText(to: string, body: string) {
  const token = Deno.env.get("META_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
  const version = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
  if (!token || !phoneNumberId) throw new Error("META WhatsApp credentials are not configured");

  const r = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body }
      })
    }
  );
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta send failed: ${r.status}`);
  return payload;
}

async function runAgent(phone: string, message: string) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/rafiq-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      channel: "whatsapp",
      conversation_id: `meta:${phone}`,
      external_conversation_id: `meta:${phone}`,
      phone,
      locale: "ar"
    })
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`rafiq-agent failed: ${r.status}`);
  return String(payload.reply || "");
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

    const messages = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        for (const msg of change?.value?.messages || []) {
          messages.push({
            id: String(msg.id || ""),
            from: String(msg.from || ""),
            type: String(msg.type || ""),
            text: typeof msg?.text?.body === "string" ? msg.text.body.trim() : ""
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

      if (!msg.text) {
        await db.from("whatsapp_inbound_events")
          .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
        continue;
      }

      if (!WHATSAPP_AUTOREPLY_ENABLED) {
        await db.from("whatsapp_inbound_events")
          .update({ error_message: "Automatic WhatsApp replies are disabled; pending manual review." })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
        continue;
      }

      try {
        const reply = await runAgent(msg.from, msg.text);
        if (!reply) throw new Error("Agent returned empty reply");

        const outbound = await sendWhatsAppText(msg.from, reply);
        const outboundId = outbound?.messages?.[0]?.id || null;

        await db.from("whatsapp_outbound_messages").insert({
          provider: "meta",
          provider_message_id: outboundId,
          to_phone: msg.from,
          body: reply,
          status: "sent",
          payload: outbound
        });

        await db.from("whatsapp_inbound_events")
          .update({ processing_status: "processed", processed_at: new Date().toISOString() })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
      } catch (error) {
        console.error("message processing failed", String(error));
        await db.from("whatsapp_inbound_events")
          .update({ processing_status: "failed", error_message: String(error).slice(0,500) })
          .eq("provider", "meta")
          .eq("provider_message_id", msg.id);
        // Return 200 after persistence so Meta does not create an uncontrolled duplicate storm.
        // The failed event remains visible for human retry/review.
      }
    }

    return Response.json({ ok: true, received: messages.length }, { headers: cors });
  } catch (error) {
    console.error("webhook parse/processing error", String(error));
    return Response.json({ ok: false }, { status: 200, headers: cors });
  }
});
