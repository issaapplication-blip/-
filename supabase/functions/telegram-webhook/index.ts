import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const WEBHOOK_SECRET = (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "").trim();
const MANAGER_CHAT_IDS = (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((x) => x.trim()).filter(Boolean);
const MAX_BODY_BYTES = 512 * 1024;
const CLOUDFLARE_ACCOUNT_ID = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "").trim();
const CLOUDFLARE_API_TOKEN = (Deno.env.get("CLOUDFLARE_API_TOKEN") || "").trim();
const CLOUDFLARE_AI_MODEL = (Deno.env.get("CLOUDFLARE_AI_MODEL") || "@cf/meta/llama-3.1-8b-instruct-fp8-fast").trim();
const SIGNATURE = "— فريق رفيق | RAFIQ 🇱🇧";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(JSON.stringify({ event: "telegram_webhook_missing_supabase_configuration" }));
}

const db = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function safeEqual(a: string, b: string): boolean {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length || aa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function signed(text: string): string {
  return text.includes(SIGNATURE) ? text : text + "\n\n" + SIGNATURE;
}

async function telegram(method: string, payload: Record<string, unknown>) {
  if (!BOT_TOKEN) throw new Error("telegram_bot_token_missing");
  const response = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok !== true) {
    throw new Error("telegram_api_" + response.status + "_" + String(result?.error_code || "failure"));
  }
  return result;
}

async function sendText(chatId: string | number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: signed(text),
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function normalize(text: string): string {
  return text.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function faq(text: string): string {
  const t = normalize(text);
  if (/(طوارئ|طواري|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t)) {
    return "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.";
  }
  if (/(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t)) {
    return "لا يوجد سعر موحّد أستطيع تأكيده. تتحدد التكلفة بحسب الخدمة والمنطقة والدوام واحتياجات الحالة وتوفر مقدم الخدمة؛ وتؤكد الإدارة السعر قبل أي اتفاق. اكتب /request لبدء طلب مراجعة.";
  }
  if (/(تمريض|ممرض|ممرضة|حقن|ضماد|جرح)/.test(t)) {
    return "يساعد رفيق في تنظيم طلب التمريض المنزلي. يمكن للإدارة مراجعة المنطقة والمهمة المطلوبة وتأكيد التوفر. اكتب /request لبدء الطلب.";
  }
  if (/(فيزيائي|طبيعي|فيزيو|physio)/.test(t)) {
    return "يساعد رفيق في تنظيم طلب العلاج الفيزيائي المنزلي؛ وتُراجع ملاءمة الخدمة والتوفر من الفريق المختص. اكتب /request لبدء الطلب.";
  }
  if (/(مسن|كبار السن|كبير السن|والدي|والدتي|جدتي|جدي|مرافق|رعايه منزليه)/.test(t)) {
    return "رفيق ينظم طلبات رعاية كبار السن داخل المنزل، نهارًا أو ليلًا أو بنظام الإقامة بحسب التوفر. اكتب /request لبدء طلب تراجعه الإدارة.";
  }
  if (/(مريض|مريضة|بعد المستشفى|بعد عملية|رعاية المريض)/.test(t)) {
    return "رفيق يساعد في تنظيم طلب رعاية منزلية للمريض، وتراجع الإدارة احتياجات الحالة من دون تقديم تشخيص أو استبدال الفريق الطبي. اكتب /request لبدء الطلب.";
  }
  if (/(منطقة|وين|اين|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت)/.test(t)) {
    return "نستقبل طلبات من مناطق لبنان، ويُراجع التوفر لكل خدمة ومنطقة على حدة. اكتب /request وحدد المنطقة المطلوبة.";
  }
  if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام|رقم الاداره)/.test(t)) {
    return "للمتابعة الإدارية: WhatsApp ‏+961 81 506 299. ويمكنك متابعة بوت رفيق: https://t.me/RAFIQ_Care_Bot. الردود الآلية على WhatsApp ما زالت متوقفة إلى حين اجتياز اختبار منفصل.";
  }
  return "";
}

function redactPhones(text: string): string {
  return text
    .replace(/(?:\+?961[\s().-]*0?[\s().-]*[1-9](?:[\s().-]*\d){6,7})/g, "[رقم محجوب]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[رقم محجوب]")
    .slice(0, 1500);
}
async function generateFaqReply(text: string): Promise<string> {
  const known = faq(text);
  if (known) return known;
  // Workers AI Free allocation is bounded; if it is absent or unavailable, retain guided mode.
  // Only the text is sent. We never transmit Telegram chat/user IDs, request-session data, or phone numbers.
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return "أستطيع مساعدتك بالمعلومات العامة عن خدمات رفيق، لكن لم أفهم السؤال بدقة. هل تسأل عن رعاية المسنين أو المرضى أو التمريض المنزلي أو العلاج الفيزيائي؟ ويمكنك كتابة /request لبدء طلب تراجعه الإدارة.";
  }
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(CLOUDFLARE_ACCOUNT_ID) + "/ai/run/" + encodeURIComponent(CLOUDFLARE_AI_MODEL),
      {
        method: "POST",
        headers: { "authorization": "Bearer " + CLOUDFLARE_API_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "أنت مساعد خدمة العملاء لمنصة RAFIQ للرعاية المنزلية في لبنان. أجب بالعربية بشكل واضح ومفيد عن الخدمات فقط. لا تشخّص ولا تصف أدوية ولا تغيّر علاجًا. لا تخترع سعرًا أو توفرًا أو حجزًا أو ترخيصًا. لا تطلب كلمات مرور أو رموز تحقق أو بيانات صحية تفصيلية أو رقم هاتف. في الطوارئ، اطلب التواصل فورًا مع خدمات الطوارئ أو الفريق الطبي. عند الحاجة إلى ترتيب خدمة، وجّه العميل إلى /request. إذا لم تعرف، قل بوضوح إن الإدارة ستراجع السؤال." },
            { role: "user", content: redactPhones(text) }
          ],
          max_tokens: 350,
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(9000)
      }
    );
    if (!response.ok) {
      console.error(JSON.stringify({ event: "telegram_ai_provider_unavailable", status: response.status }));
      return "أستطيع مساعدتك بالمعلومات العامة عن خدمات رفيق. إذا كان سؤالك عن طلب رعاية، اكتب /request؛ وستراجع الإدارة التفاصيل والتوفر.";
    }
    const payload = await response.json().catch(() => ({}));
    const answer = typeof payload?.result?.response === "string" ? payload.result.response.trim() : "";
    if (!answer || payload?.success === false) {
      return "أستطيع مساعدتك بالمعلومات العامة عن خدمات رفيق. إذا كان سؤالك عن طلب رعاية، اكتب /request؛ وستراجع الإدارة التفاصيل والتوفر.";
    }
    return answer.slice(0, 3000);
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_ai_provider_error", reason: String(error).slice(0, 100) }));
    return "أستطيع مساعدتك بالمعلومات العامة عن خدمات رفيق. إذا كان سؤالك عن طلب رعاية، اكتب /request؛ وستراجع الإدارة التفاصيل والتوفر.";
  }
}

const serviceKeyboard = {
  inline_keyboard: [
    [{ text: "رعاية كبار السن", callback_data: "reqsvc:elderly" }, { text: "رعاية المرضى", callback_data: "reqsvc:patient" }],
    [{ text: "التمريض المنزلي", callback_data: "reqsvc:nurse" }, { text: "العلاج الفيزيائي", callback_data: "reqsvc:physio" }],
  ],
};

const serviceNames: Record<string, string> = {
  elderly: "رعاية كبار السن",
  patient: "رعاية المرضى",
  nurse: "التمريض المنزلي",
  physio: "العلاج الفيزيائي المنزلي",
};

async function getActiveSession(chatId: string) {
  const { data, error } = await db!.from("rafiq_telegram_request_sessions")
    .select("id,request_id,service_type,area,schedule,notes,status")
    .eq("chat_id", chatId).eq("status", "collecting")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("telegram_request_session_read_failed");
  return data;
}

async function processRequestMessage(chatId: string, userId: string, text: string): Promise<boolean> {
  const session = await getActiveSession(chatId);
  if (!session) return false;

  if (!session.service_type) {
    await sendText(chatId, "اختر الخدمة المطلوبة:", serviceKeyboard);
    return true;
  }
  if (!session.area) {
    const { error } = await db!.from("rafiq_telegram_request_sessions").update({ area: text.slice(0, 180), updated_at: new Date().toISOString() }).eq("id", session.id);
    if (error) throw new Error("telegram_request_area_save_failed");
    await sendText(chatId, "في أي وقت أو نظام دوام تحتاجون الخدمة؟ (نهاري، ليلي، أو إقامة)");
    return true;
  }
  if (!session.schedule) {
    const { error } = await db!.from("rafiq_telegram_request_sessions").update({ schedule: text.slice(0, 180), updated_at: new Date().toISOString() }).eq("id", session.id);
    if (error) throw new Error("telegram_request_schedule_save_failed");
    await sendText(chatId, "هل توجد تفاصيل إضافية تريد أن تطّلع عليها الإدارة؟ اكتبها أو أرسل /skip.");
    return true;
  }

  const notes = text.trim().toLowerCase() === "/skip" ? null : text.slice(0, 1000);
  const { error } = await db!.from("rafiq_telegram_request_sessions").update({
    notes, status: "submitted", updated_at: new Date().toISOString(),
  }).eq("id", session.id).eq("status", "collecting");
  if (error) throw new Error("telegram_request_submit_failed");

  const summary = [
    "📝 طلب رعاية جديد على RAFIQ",
    "الطلب: " + session.request_id,
    "الخدمة: " + (serviceNames[session.service_type] || session.service_type),
    "المنطقة: " + session.area,
    "الدوام: " + session.schedule,
    "تفاصيل: " + (notes || "لم تُذكر"),
    "Chat ID: " + chatId,
    "Telegram User ID: " + userId,
  ].join("\n");
  for (const managerId of MANAGER_CHAT_IDS) {
    try { await sendText(managerId, summary); }
    catch (error) { console.error(JSON.stringify({ event: "telegram_manager_notice_failed", error: String(error).slice(0, 120) })); }
  }
  await sendText(chatId, "✅ تم حفظ طلبك لدى رفيق بالرقم " + session.request_id + ". ستراجع الإدارة التفاصيل وتؤكد التوفر؛ لا يُعد هذا تأكيدًا لحجز الخدمة.");
  return true;
}

async function processUpdate(update: any) {
  const callback = update?.callback_query;
  if (callback) {
    const data = String(callback.data || "");
    const chatId = callback.message?.chat?.id;
    if (!chatId || callback.message?.chat?.type !== "private") {
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      return;
    }
    if (data.startsWith("reqsvc:")) {
      const key = data.slice("reqsvc:".length);
      if (!serviceNames[key]) {
        await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "اختيار غير صالح" });
        return;
      }
      const session = await getActiveSession(String(chatId));
      if (!session) {
        await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "ابدأ طلبًا جديدًا عبر /request" });
        return;
      }
      const { error } = await db!.from("rafiq_telegram_request_sessions").update({ service_type: key, updated_at: new Date().toISOString() }).eq("id", session.id);
      if (error) throw new Error("telegram_request_service_save_failed");
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      await sendText(chatId, "تم اختيار " + serviceNames[key] + ". ما المنطقة أو المدينة المطلوبة؟");
      return;
    }
    await telegram("answerCallbackQuery", { callback_query_id: callback.id });
    return;
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  if (chatId === undefined || message?.chat?.type !== "private") return;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) {
    await sendText(chatId, "يمكنك كتابة سؤالك أو استخدام /services و/request. لا ترسل كلمات مرور أو رموز تحقق.");
    return;
  }
  const command = text.toLowerCase().split(/\s+/)[0];
  const userId = String(message.from?.id || chatId);

  if (command === "/start" || command === "/help") {
    await sendText(chatId, "أهلًا بك في RAFIQ | رفيق 🇱🇧\n\nخدماتنا: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، والعلاج الفيزيائي المنزلي.\n\n/services — الخدمات\n/request — تسجيل طلب تراجعه الإدارة\n/stop — إلغاء الطلب الجاري");
    return;
  }
  if (command === "/services") {
    await sendText(chatId, "خدمات رفيق الأساسية:", serviceKeyboard);
    return;
  }
  if (command === "/stop") {
    const session = await getActiveSession(String(chatId));
    if (session) {
      const { error } = await db!.from("rafiq_telegram_request_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", session.id);
      if (error) throw new Error("telegram_request_cancel_failed");
    }
    await sendText(chatId, "تم إيقاف الطلب الجاري. يمكنك بدء طلب جديد في أي وقت عبر /request.");
    return;
  }
  if (command === "/request") {
    const existing = await getActiveSession(String(chatId));
    if (existing) {
      await sendText(chatId, "لديك طلب جارٍ بالرقم " + existing.request_id + ". أكمل الإجابات المطلوبة أو أرسل /stop لإلغائه.");
      return;
    }
    const requestId = "RFQ-TG-" + new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    const { error } = await db!.from("rafiq_telegram_request_sessions").insert({
      request_id: requestId, chat_id: String(chatId), telegram_user_id: userId,
      language: "ar", status: "collecting", is_test: false,
    });
    if (error) throw new Error("telegram_request_start_failed");
    await sendText(chatId, "📝 بدأنا طلب رعاية. رقم الطلب: " + requestId + "\n\nاختر الخدمة المطلوبة:", serviceKeyboard);
    return;
  }

  if (await processRequestMessage(String(chatId), userId, text)) return;
  await sendText(chatId, await generateFaqReply(text));
}

async function markUpdate(updateId: number, status: "completed" | "failed", errorMessage?: string) {
  const patch: Record<string, unknown> = {
    status, updated_at: new Date().toISOString(),
    ...(status === "completed" ? { completed_at: new Date().toISOString(), last_error: null } : { last_error: (errorMessage || "processing_failed").slice(0, 300) }),
  };
  const { error } = await db!.from("telegram_update_receipts").update(patch).eq("update_id", updateId);
  if (error) throw new Error("telegram_update_receipt_write_failed");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!db || !BOT_TOKEN || WEBHOOK_SECRET.length < 32) {
    return json(503, { error: "webhook_configuration_incomplete" });
  }
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!safeEqual(receivedSecret, WEBHOOK_SECRET)) return json(401, { error: "unauthorized" });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
  let update: any;
  try { update = JSON.parse(raw); } catch { return json(200, { ok: true, status: "invalid_json_ignored" }); }

  const updateId = update?.update_id;
  if (typeof updateId !== "number" || !Number.isSafeInteger(updateId) || updateId < 0) {
    return json(200, { ok: true, status: "invalid_update_ignored" });
  }

  try {
    const { data, error } = await db.rpc("claim_telegram_update", { p_update_id: updateId, p_lease_seconds: 120 });
    if (error) throw new Error("telegram_update_claim_failed");
    const claim = Array.isArray(data) ? data[0] : data;
    if (!claim || typeof claim.claimed !== "boolean") throw new Error("telegram_update_claim_invalid");
    if (claim.claimed === false && claim.current_status === "completed") return json(200, { ok: true, status: "duplicate_completed" });
    if (claim.claimed === false && claim.current_status === "processing") return json(503, { error: "update_in_progress_retry" });
    if (claim.claimed !== true) return json(503, { error: "update_claim_unavailable" });

    const rateChat = String(update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id ?? "");
    if (rateChat) {
      const { data: allowed, error: rateError } = await db.rpc("consume_telegram_rate_limit", {
        p_chat_id: rateChat, p_window_seconds: 60, p_max_requests: 10,
      });
      if (rateError) throw new Error("telegram_rate_limit_failed");
      if (allowed !== true) {
        await markUpdate(updateId, "completed");
        return json(200, { ok: true, status: "rate_limited" });
      }
    }

    await processUpdate(update);
    await markUpdate(updateId, "completed");
    return json(200, { ok: true, status: "processed" });
  } catch (error) {
    const reason = String(error).slice(0, 300);
    await markUpdate(updateId, "failed", reason).catch(() => {});
    console.error(JSON.stringify({ event: "telegram_webhook_processing_failed", update_id: updateId, reason: reason.slice(0, 140) }));
    return json(503, { error: "processing_failed_retry" });
  }
});
