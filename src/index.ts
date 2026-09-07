import { Elysia } from "elysia";

const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  "Cache-Control": "no-store",
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyMetaSignature = async (body: string, signature: string | null) => {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
  return timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature));
};

const extractIncomingMessages = (payload: any) => {
  const messages: Array<{ from: string; id: string; text?: string; type: string; timestamp?: string }> = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const message of change?.value?.messages ?? []) {
        messages.push({
          from: String(message.from ?? ""),
          id: String(message.id ?? ""),
          text: typeof message.text?.body === "string" ? message.text.body : undefined,
          type: String(message.type ?? "unknown"),
          timestamp: message.timestamp ? String(message.timestamp) : undefined,
        });
      }
    }
  }
  return messages;
};

const app = new Elysia()
  .onAfterHandle(({ response }) => {
    if (response instanceof Response) {
      for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    }
  })
  .get("/health", () => ({ ok: true, service: "rafig-whatsapp-gateway", startedAt }))
  .get("/api/status", () => ({
    ok: true,
    platform: "RAFIQ | رفيق",
    mode: "meta-cloud-api-ready",
    whatsappSending: process.env.WHATSAPP_SENDING_ENABLED === "true",
    whatsappWebhookConfigured: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
    humanApprovalRequired: true,
  }))
  .get("/api/whatsapp/webhook", ({ query, set }) => {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const verifyToken = process.env.META_VERIFY_TOKEN;

    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      set.status = 200;
      return challenge;
    }

    set.status = 403;
    return { ok: false, error: "webhook verification failed" };
  })
  .post("/api/whatsapp/webhook", async ({ request, set }) => {
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!(await verifyMetaSignature(body, signature))) {
      set.status = 401;
      return { ok: false, error: "invalid webhook signature" };
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch {
      set.status = 400;
      return { ok: false, error: "invalid json" };
    }

    const messages = extractIncomingMessages(payload);
    console.info(JSON.stringify({
      event: "whatsapp.inbound",
      count: messages.length,
      messages: messages.map((message) => ({ id: message.id, type: message.type })),
    }));

    return { ok: true, received: messages.length };
  })
  .get("/", () => new Response(Bun.file("public/index.html")))
  .listen(port);

console.log(`RAFIQ server listening on ${app.server?.hostname}:${app.server?.port}`);
