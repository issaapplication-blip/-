import { Elysia } from "elysia";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";

const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();
const MAX_WEBHOOK_BODY = 512_000;

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  "Cache-Control": "no-store",
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const verifyMetaSignature = async (body: string, signature: string | null) => {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
  return timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(signature));
};

const extractIncomingMessages = (payload: any) => {
  const messages: Array<{ from: string; id: string; text?: string; type: string; timestamp?: string }> = [];
  for (const entry of payload?.entry ?? []) for (const change of entry?.changes ?? []) for (const message of change?.value?.messages ?? []) {
    messages.push({ from: String(message.from ?? ""), id: String(message.id ?? ""), text: typeof message.text?.body === "string" ? message.text.body : undefined, type: String(message.type ?? "unknown"), timestamp: message.timestamp ? String(message.timestamp) : undefined });
  }
  return messages;
};

const requireAdminToken = (request: Request) => {
  const adminToken = process.env.RAFIQ_ADMIN_ACTION_TOKEN;
  return Boolean(adminToken && request.headers.get("x-rafig-admin-token") === adminToken);
};

const sendWhatsAppText = async (to: string, body: string) => {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const apiVersion = process.env.META_GRAPH_API_VERSION ?? "v23.0";
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp Cloud API server configuration is incomplete");
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta WhatsApp API error (${response.status})`);
  return result;
};

const app = new Elysia()
  .onAfterHandle(({ response }) => {
    if (response instanceof Response) for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  })
  .get("/health", () => ({ ok: true, service: "rafig-whatsapp-gateway", startedAt }))
  .get("/api/status", () => ({ ok: true, platform: "RAFIQ | رفيق", mode: "meta-cloud-api-ready", whatsappSending: process.env.WHATSAPP_SENDING_ENABLED === "true", whatsappAutoReply: process.env.RAFIQ_WHATSAPP_AUTO_REPLY === "true", whatsappWebhookConfigured: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET), whatsappOutboundConfigured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID), openAIConfigured: Boolean(process.env.OPENAI_API_KEY), agentModel: process.env.RAFIQ_AGENT_MODEL ?? "gpt-5.6-luna", proactiveMessagesRequireApproval: true }))
  .get("/api/whatsapp/webhook", ({ query, set }) => {
    const mode = query["hub.mode"], token = query["hub.verify_token"], challenge = query["hub.challenge"], verifyToken = process.env.META_VERIFY_TOKEN;
    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) return challenge;
    set.status = 403;
    return { ok: false, error: "webhook verification failed" };
  })
  .post("/api/whatsapp/webhook", async ({ request, set }) => {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_WEBHOOK_BODY) { set.status = 413; return { ok: false, error: "payload too large" }; }
    const body = await request.text();
    if (body.length > MAX_WEBHOOK_BODY) { set.status = 413; return { ok: false, error: "payload too large" }; }
    if (!(await verifyMetaSignature(body, request.headers.get("x-hub-signature-256")))) { set.status = 401; return { ok: false, error: "invalid webhook signature" }; }
    let payload: any;
    try { payload = JSON.parse(body); } catch { set.status = 400; return { ok: false, error: "invalid json" }; }
    if (payload?.object !== "whatsapp_business_account") { set.status = 400; return { ok: false, error: "invalid webhook object" }; }
    const messages = extractIncomingMessages(payload);
    const results: Array<{ id: string; status: string }> = [];
    for (const message of messages) {
      if (!message.text) { results.push({ id: message.id, status: "ignored_non_text" }); continue; }
      try {
        const result = await draftAgentReply(message.text);
        console.info(JSON.stringify({ event: "rafig.agent.draft", messageId: message.id, model: result.model }));
        if (process.env.RAFIQ_WHATSAPP_AUTO_REPLY === "true" && process.env.WHATSAPP_SENDING_ENABLED === "true") {
          try { const outbound = await sendWhatsAppText(message.from, result.reply); console.info(JSON.stringify({ event: "whatsapp.auto_reply", status: "sent", messageId: message.id, recipient: "redacted", providerMessageId: outbound?.messages?.[0]?.id ?? null })); results.push({ id: message.id, status: "auto_replied" }); }
          catch (error) { console.error(JSON.stringify({ event: "whatsapp.auto_reply", status: "failed", messageId: message.id, error: error instanceof Error ? error.message : "unknown" })); results.push({ id: message.id, status: "draft_ready_send_failed" }); }
        } else results.push({ id: message.id, status: "draft_ready" });
      } catch (error) { console.error(JSON.stringify({ event: "rafig.agent.draft", messageId: message.id, status: "failed", error: error instanceof Error ? error.message : "unknown" })); results.push({ id: message.id, status: "draft_failed" }); }
    }
    return { ok: true, received: messages.length, results };
  })
  .post("/api/agent/draft", async ({ request, set }) => {
    if (!requireAdminToken(request)) { set.status = 401; return { ok: false, error: "unauthorized" }; }
    let input: any; try { input = await request.json(); } catch { set.status = 400; return { ok: false, error: "invalid json" }; }
    const message = typeof input?.message === "string" ? input.message.trim() : "";
    if (!message || message.length > 8000) { set.status = 400; return { ok: false, error: "invalid message" }; }
    try { const result = await draftAgentReply(message, typeof input?.language === "string" ? input.language : undefined); return { ok: true, draft: result.reply, model: result.model, humanApprovalRequired: true }; }
    catch { set.status = 502; return { ok: false, error: "agent provider request failed" }; }
  })
  .post("/api/agent/outreach-draft", async ({ request, set }) => {
    if (!requireAdminToken(request)) { set.status = 401; return { ok: false, error: "unauthorized" }; }
    let input: any; try { input = await request.json(); } catch { set.status = 400; return { ok: false, error: "invalid json" }; }
    const target = input?.target;
    if (target !== "laboratory" && target !== "medical_equipment_supplier" && target !== "radiology_center") { set.status = 400; return { ok: false, error: "invalid outreach target" }; }
    const institutionName = typeof input?.institutionName === "string" ? input.institutionName.trim() : "";
    const language = typeof input?.language === "string" ? input.language.trim() : "";
    if (institutionName.length > 200 || language.length > 40) { set.status = 400; return { ok: false, error: "invalid input" }; }
    try { const result = await draftInstitutionOutreach(target, institutionName, language || undefined); return { ok: true, target, institutionName: institutionName || null, draft: result.reply, model: result.model, humanApprovalRequired: true, sendingPerformed: false }; }
    catch { set.status = 502; return { ok: false, error: "agent provider request failed" }; }
  })
  .post("/api/whatsapp/send-text", async ({ request, set }) => {
    if (process.env.WHATSAPP_SENDING_ENABLED !== "true") { set.status = 503; return { ok: false, error: "WhatsApp sending is disabled" }; }
    if (!requireAdminToken(request)) { set.status = 401; return { ok: false, error: "unauthorized" }; }
    let input: any; try { input = await request.json(); } catch { set.status = 400; return { ok: false, error: "invalid json" }; }
    const to = typeof input?.to === "string" ? input.to.trim() : "";
    const body = typeof input?.body === "string" ? input.body.trim() : "";
    if (!to || !/^\d{8,15}$/.test(to) || !body || body.length > 4096) { set.status = 400; return { ok: false, error: "invalid recipient or message" }; }
    if (input?.humanApproved !== true) { set.status = 409; return { ok: false, error: "human approval required" }; }
    try { const result = await sendWhatsAppText(to, body); return { ok: true, messageId: result?.messages?.[0]?.id ?? null }; }
    catch (error) { console.error(JSON.stringify({ event: "whatsapp.outbound", status: "failed", error: error instanceof Error ? error.message : "unknown" })); set.status = 502; return { ok: false, error: "WhatsApp provider request failed" }; }
  })
  .get("/", () => new Response(Bun.file("public/index.html")))
  .get("/rafig-approved-logo.jpg", () => new Response(Bun.file("public/rafig-approved-logo.jpg"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } }))
  .get("/rafig-approved-logo-192.jpg", () => new Response(Bun.file("public/rafig-approved-logo-192.jpg"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } }))
  .get("/rafig-logo.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .get("/rafig-final-logo-20260908.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .get("/manifest.webmanifest", () => new Response(Bun.file("public/manifest.webmanifest"), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }))
  .get("/sw.js", () => new Response(Bun.file("public/sw.js"), { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-cache" } }))
  .get("/favicon.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .listen(port);

console.log(`RAFIQ server listening on ${app.server?.hostname}:${app.server?.port}`);
