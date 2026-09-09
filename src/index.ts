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

const injectRafiqEnhancements = (html: string) => {
  const enhancement = `<script>
(function(){
  const FINANCE="96170600157";
  const CV_PRICE="$20";
  const gateId="rafig-cv-payment-gate";
  const css=document.createElement("style");
  css.textContent=\`#rafig-prices{margin:24px 0}#rafig-prices .price-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}#rafig-prices .price-card{border:1px solid var(--line);border-radius:18px;padding:18px;background:#fff;box-shadow:0 8px 25px rgba(23,55,45,.04)}#rafig-prices .price-card strong{display:block;color:var(--green);font-size:21px;margin-bottom:6px}#rafig-prices .price-card span{display:block;color:var(--muted);line-height:1.7;font-size:13px}#rafig-install{display:none}#\${gateId}{position:fixed;inset:0;z-index:9999;background:rgba(23,55,45,.45);padding:18px;align-items:center;justify-content:center}#\${gateId}.show{display:flex}#\${gateId} .box{max-width:520px;width:100%;background:#fff;border-radius:22px;padding:22px;box-shadow:0 20px 70px rgba(0,0,0,.25)}#\${gateId} h3{margin-top:0;color:var(--green)}#\${gateId} .pay{background:var(--cream);border:1px solid #ead7a8;border-radius:14px;padding:14px;line-height:1.9;margin:12px 0}#\${gateId} .confirm{display:flex;gap:8px;align-items:flex-start;margin:14px 0;font-weight:800}#\${gateId} .actions{display:flex;gap:8px;flex-wrap:wrap}#\${gateId} button,#\${gateId} a{flex:1;min-width:140px}\`;
  document.head.appendChild(css);

  document.querySelectorAll("img").forEach(function(img){
    if((img.getAttribute("alt")||"").toLowerCase().includes("rafiq") || (img.getAttribute("src")||"").includes("rafig-approved-logo")) img.setAttribute("src","/rafig-logo.svg?v=16");
  });

  const main=document.querySelector("main");
  if(main && !document.getElementById("rafig-prices")){
    const section=document.createElement("section");
    section.id="rafig-prices";
    section.innerHTML='<div class="section-title"><h2>الأسعار</h2><p>أسعار إرشادية واضحة قبل إرسال طلب الرعاية.</p></div><div class="price-grid"><div class="price-card"><strong>$30–35</strong><span>رعاية مسن — 11 ساعة نهار أو ليل / حسب الاتفاق.</span></div><div class="price-card"><strong>$45</strong><span>رعاية مسن — 24 ساعة ضمن ترتيب أسبوعي مستمر.</span></div><div class="price-card"><strong>$50–55</strong><span>رعاية مسن — 24 ساعة حسب الحالة والترتيب.</span></div><div class="price-card"><strong>$40–50</strong><span>تمريض منزلي — 11 ساعة، بحسب الحالة والخدمات الطبية المطلوبة.</span></div></div>';
    const join=document.getElementById("join");
    if(join) main.insertBefore(section,join); else main.prepend(section);
  }

  const cta=document.querySelector(".cta");
  if(cta && !document.getElementById("rafig-install")){
    const b=document.createElement("button");
    b.id="rafig-install"; b.className="btn outline"; b.type="button"; b.textContent="📲 تثبيت التطبيق";
    cta.appendChild(b);
    let deferred=null;
    window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();deferred=e;b.style.display="inline-flex";});
    b.addEventListener("click",async function(){
      if(deferred){deferred.prompt();await deferred.userChoice.catch(function(){});deferred=null;b.style.display="none";return;}
      const iOS=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
      if(iOS) alert("لتثبيت RAFIQ على iPhone/iPad: اضغط مشاركة ثم Add to Home Screen / إضافة إلى الشاشة الرئيسية.");
      else alert("إذا لم يظهر خيار التثبيت، افتح قائمة المتصفح واختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.");
    });
    window.addEventListener("appinstalled",function(){b.style.display="none";});
  }

  if(!document.getElementById(gateId)){
    const gate=document.createElement("div"); gate.id=gateId;
    gate.innerHTML='<div class="box"><h3>تأكيد دفع خدمة CV</h3><p>قيمة خدمة إعداد السيرة الذاتية الاحترافية هي <strong>'+CV_PRICE+'</strong>.</p><div class="pay"><strong>الدفع عبر Whish Money</strong><br>رقم المنصة: <span dir="ltr">0096170600157</span><br>بعد إتمام التحويل، احتفظ بإثبات الدفع وأرسله إلى RAFIQ للمراجعة.</div><label class="confirm"><input id="rafig-payment-confirmed" type="checkbox"> أؤكد أنني أتممت دفع قيمة خدمة CV وأوافق على بدء إعداد السيرة الذاتية بعد مراجعة الدفع.</label><div class="actions"><a class="btn primary" href="https://wa.me/'+FINANCE+'?text=أريد%20تأكيد%20دفع%20خدمة%20CV" target="_blank" rel="noopener">إرسال إثبات الدفع</a><button id="rafig-start-cv" class="btn gold" type="button">متابعة إنشاء CV</button><button id="rafig-cancel-cv" class="btn outline" type="button">إلغاء</button></div></div>';
    document.body.appendChild(gate);
    let pendingForm=null;
    function closeGate(){gate.classList.remove("show");pendingForm=null;}
    document.getElementById("rafig-cancel-cv").onclick=closeGate;
    document.getElementById("rafig-start-cv").onclick=function(){
      const ok=document.getElementById("rafig-payment-confirmed").checked;
      if(!ok){alert("يرجى تأكيد إتمام الدفع أولاً.");return;}
      if(pendingForm){pendingForm.dataset.paymentConfirmed="true";closeGate();pendingForm.requestSubmit();}
    };
    document.addEventListener("submit",function(e){
      const form=e.target;
      if(!(form instanceof HTMLFormElement)) return;
      const type=(form.getAttribute("data-type")||"").toLowerCase();
      if(type.includes("cv") && form.dataset.paymentConfirmed!=="true"){
        e.preventDefault(); e.stopImmediatePropagation(); pendingForm=form; gate.classList.add("show");
      }
    },true);
  }
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function(){});
})();
</script>`;
  return html.replace("</body>", enhancement + "</body>");
};

const app = new Elysia()
  .onAfterHandle(({ response }) => {
    if (response instanceof Response) for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  })
  .get("/health", () => ({ ok: true, service: "rafig-whatsapp-gateway", startedAt }))
  .get("/api/status", () => ({ ok: true, platform: "RAFIQ | رفيق", mode: "meta-cloud-api-ready", whatsappSending: process.env.WHATSAPP_SENDING_ENABLED === "true", whatsappAutoReply: process.env.RAFIQ_WHATSAPP_AUTO_REPLY === "true", whatsappWebhookConfigured: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET), whatsappOutboundConfigured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID), openAIConfigured: Boolean(process.env.OPENAI_API_KEY), agentModel: process.env.RAFIQ_AGENT_MODEL ?? "gpt-5.6-luna", channelMode: "agent-draft-admin-publish", proactiveMessagesRequireApproval: true }))
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
  .post("/api/channel/draft", async ({ request, set }) => {
    if (!requireAdminToken(request)) { set.status = 401; return { ok: false, error: "unauthorized" }; }
    let input: any; try { input = await request.json(); } catch { set.status = 400; return { ok: false, error: "invalid json" }; }
    const topic = typeof input?.topic === "string" ? input.topic.trim() : "";
    const language = typeof input?.language === "string" ? input.language.trim() : "ar";
    if (!topic || topic.length > 4000 || language.length > 40) { set.status = 400; return { ok: false, error: "invalid topic or language" }; }
    try {
      const result = await draftAgentReply(`Prepare a public WhatsApp Channel post for the official RAFIQ | رفيق channel.\nLanguage: ${language}\nTopic: ${topic}\nAudience: families, caregivers, nurses, healthcare institutions, laboratories, medical equipment suppliers, and radiology centers.\nThe post must be informative, professional, concise, and suitable for a public one-way channel. Do not claim that a partnership, booking, payment, referral, approval, or service has already happened unless explicitly stated in the topic. Do not expose private information. Return only the ready-to-review channel post.`);
      return { ok: true, draft: result.reply, model: result.model, channel: "RAFIQ official WhatsApp Channel", publishMode: "manual-admin", humanApprovalRequired: true, sendingPerformed: false };
    } catch { set.status = 502; return { ok: false, error: "agent provider request failed" }; }
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
  .get("/", async () => new Response(injectRafiqEnhancements(await Bun.file("public/index.html").text()), { headers: { "Content-Type": "text/html; charset=utf-8" } }))
  .get("/rafig-approved-logo.jpg", () => new Response(Bun.file("public/rafig-approved-logo.jpg"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } }))
  .get("/rafig-approved-logo-192.jpg", () => new Response(Bun.file("public/rafig-approved-logo-192.jpg"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } }))
  .get("/rafig-logo.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .get("/rafig-final-logo-20260908.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .get("/manifest.webmanifest", () => new Response(Bun.file("public/manifest.webmanifest"), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }))
  .get("/sw.js", () => new Response(Bun.file("public/sw.js"), { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-cache" } }))
  .get("/favicon.svg", () => new Response(Bun.file("public/rafig-approved-logo.svg"), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } }))
  .listen(port);

console.log(`RAFIQ server listening on ${app.server?.hostname}:${app.server?.port}`);