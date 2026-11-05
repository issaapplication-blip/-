import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const WEBHOOK_SECRET = (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "").trim();
const MANAGER_CHAT_IDS = Array.from(new Set((Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((x) => x.trim()).filter(Boolean)));
const MAX_BODY_BYTES = 512 * 1024;
const CLOUDFLARE_ACCOUNT_ID = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "").trim();
const CLOUDFLARE_API_TOKEN = (Deno.env.get("CLOUDFLARE_API_TOKEN") || "").trim();
const CLOUDFLARE_AI_MODEL = (Deno.env.get("CLOUDFLARE_AI_MODEL") || "@cf/meta/llama-3.2-3b-instruct").trim();
const SIGNATURE = "— فريق رفيق | RAFIQ 🇱🇧";
const BOT_USERNAME = "@RAFIQ_Care_Bot";
const BOT_PUBLIC_URL = "https://t.me/RAFIQ_Care_Bot";
const BOT_DESCRIPTION = "رفيق | RAFIQ — رعاية منزلية آمنة لكبار السن والمرضى في لبنان.";

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
    return "للمتابعة الإدارية: WhatsApp ‏+961 81 506 299. البوت الأساسي: " + BOT_USERNAME + " — " + BOT_PUBLIC_URL + ". الردود الآلية على WhatsApp ما زالت متوقفة إلى حين اجتياز اختبار منفصل.";
  }
  return "";
}

function normalizeArabicDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function redactPhones(text: string): string {
  return normalizeArabicDigits(text)
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
            { role: "system", content: "أنت مساعد خدمة العملاء للبوت الرسمي " + BOT_DESCRIPTION + " (" + BOT_USERNAME + " — " + BOT_PUBLIC_URL + "). أجب بالعربية بشكل واضح ومفيد عن الخدمات فقط. لا تشخّص ولا تصف أدوية ولا تغيّر علاجًا. لا تخترع سعرًا أو توفرًا أو حجزًا أو ترخيصًا. لا تطلب كلمات مرور أو رموز تحقق أو بيانات صحية تفصيلية أو رقم هاتف. في الطوارئ، اطلب التواصل فورًا مع خدمات الطوارئ أو الفريق الطبي. عند الحاجة إلى ترتيب خدمة، وجّه العميل إلى /request. إذا لم تعرف، قل بوضوح إن الإدارة ستراجع السؤال." },
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

async function getRequestStatus(sessionId: string): Promise<string | null> {
  const { data, error } = await db!.from("rafiq_telegram_request_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error("telegram_request_state_read_failed");
  return typeof data?.status === "string" ? data.status : null;
}

async function getCancelledSessions(chatId: string) {
  const sessions: any[] = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const { data, error } = await db!.from("rafiq_telegram_request_sessions")
      .select("id,request_id,service_type,area,schedule,notes,status")
      .eq("chat_id", chatId)
      .eq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("telegram_cancelled_session_read_failed");
    const page = data || [];
    sessions.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return sessions;
}

async function notifyManagersOfCancellation(session: any): Promise<{ total: number; pending: number }> {
  const { data: deliveries, error } = await db!.from("rafiq_telegram_manager_deliveries")
    .select("manager_chat_id,cancellation_notice_status,cancellation_notice_lease_expires_at")
    .eq("request_id", session.request_id)
    .eq("status", "sent");
  if (error) throw new Error("telegram_manager_cancellation_read_failed");

  for (const delivery of deliveries || []) {
    if (delivery.cancellation_notice_status === "sent") continue;
    const now = new Date().toISOString();
    let claimQuery = db!.from("rafiq_telegram_manager_deliveries")
      .update({
        cancellation_notice_status: "sending",
        cancellation_notice_lease_expires_at: new Date(Date.now() + 120000).toISOString(),
        cancellation_notice_error: null,
        updated_at: now,
      })
      .eq("request_id", session.request_id)
      .eq("manager_chat_id", delivery.manager_chat_id)
      .eq("status", "sent");

    if (delivery.cancellation_notice_status === "sending") {
      if (!delivery.cancellation_notice_lease_expires_at ||
          Date.parse(delivery.cancellation_notice_lease_expires_at) > Date.now()) continue;
      claimQuery = claimQuery.eq("cancellation_notice_status", "sending")
        .lt("cancellation_notice_lease_expires_at", now);
    } else {
      if (!["pending", "failed"].includes(delivery.cancellation_notice_status)) continue;
      claimQuery = claimQuery.eq("cancellation_notice_status", delivery.cancellation_notice_status);
    }

    const { data: claimed, error: claimError } = await claimQuery
      .select("manager_chat_id")
      .maybeSingle();
    if (claimError) throw new Error("telegram_manager_cancellation_claim_failed");
    if (!claimed) continue;

    try {
      await sendText(
        delivery.manager_chat_id,
        "⚠️ إلغاء طلب RAFIQ " + session.request_id +
          "\nألغى العميل الطلب. يرجى عدم بدء أي إجراء أو متابعة هذا الطلب."
      );
      const { error: saveError } = await db!.from("rafiq_telegram_manager_deliveries")
        .update({
          cancellation_notice_status: "sent",
          cancellation_notice_lease_expires_at: null,
          cancellation_notice_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", session.request_id)
        .eq("manager_chat_id", delivery.manager_chat_id)
        .eq("cancellation_notice_status", "sending");
      if (saveError) throw new Error("telegram_manager_cancellation_receipt_failed");
    } catch (sendError) {
      const { error: saveError } = await db!.from("rafiq_telegram_manager_deliveries")
        .update({
          cancellation_notice_status: "failed",
          cancellation_notice_lease_expires_at: null,
          cancellation_notice_error: String(sendError).slice(0, 160),
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", session.request_id)
        .eq("manager_chat_id", delivery.manager_chat_id)
        .eq("cancellation_notice_status", "sending");
      if (saveError) throw new Error("telegram_manager_cancellation_failure_save_failed");
      console.error(JSON.stringify({
        event: "telegram_manager_cancellation_notice_failed",
        request_id: session.request_id,
        manager_chat_id: delivery.manager_chat_id,
      }));
    }
  }

  const { data: finalReceipts, error: finalReceiptError } = await db!.from("rafiq_telegram_manager_deliveries")
    .select("manager_chat_id,cancellation_notice_status")
    .eq("request_id", session.request_id)
    .eq("status", "sent");
  if (finalReceiptError) throw new Error("telegram_manager_cancellation_status_read_failed");
  const finalRows = finalReceipts || [];
  return {
    total: finalRows.length,
    pending: finalRows.filter((row: any) => row.cancellation_notice_status !== "sent").length,
  };
}

async function deliverManagerNotifications(
  session: any,
  chatId: string,
  userId: string,
  notes: string | null,
): Promise<boolean> {
  if (MANAGER_CHAT_IDS.length === 0) {
    await sendText(chatId, "حُفظت تفاصيل طلبك، لكن قناة مراجعة الإدارة غير مهيأة حاليًا. لم يُرسل الطلب إلى الإدارة بعد. يرجى المحاولة لاحقًا باستخدام /retry أو التواصل مع الإدارة عبر WhatsApp ‏+961 81 506 299.");
    console.error(JSON.stringify({ event: "telegram_manager_destinations_missing", request_id: session.request_id }));
    return true;
  }

  const destinations = MANAGER_CHAT_IDS.map((manager_chat_id) => ({
    request_id: session.request_id,
    manager_chat_id,
  }));
  const { error: prepareError } = await db!.from("rafiq_telegram_manager_deliveries")
    .upsert(destinations, { onConflict: "request_id,manager_chat_id", ignoreDuplicates: true });
  if (prepareError) throw new Error("telegram_manager_delivery_prepare_failed");

  const summary = [
    "📝 طلب رعاية جديد على RAFIQ",
    "الطلب: " + session.request_id + " (استخدم رقم الطلب لمنع تكرار المعالجة)",
    "الخدمة: " + (serviceNames[session.service_type] || session.service_type),
    "المنطقة: " + session.area,
    "الدوام: " + session.schedule,
    "تفاصيل: " + (notes || "لم تُذكر"),
    "Chat ID: " + chatId,
    "Telegram User ID: " + userId,
  ].join("\n");

  for (const managerId of MANAGER_CHAT_IDS) {
    const requestStatus = await getRequestStatus(session.id);
    if (requestStatus !== "collecting") {
      if (requestStatus === "cancelled") await notifyManagersOfCancellation(session);
      return true;
    }

    const { data: delivery, error: readError } = await db!.from("rafiq_telegram_manager_deliveries")
      .select("status,attempts,lease_expires_at,cancellation_notice_status,cancellation_notice_lease_expires_at")
      .eq("request_id", session.request_id)
      .eq("manager_chat_id", managerId)
      .maybeSingle();
    if (readError || !delivery) throw new Error("telegram_manager_delivery_read_failed");
    if (delivery.status === "sent") continue;

    const now = new Date().toISOString();
    if (delivery.status === "sending" &&
        delivery.lease_expires_at &&
        Date.parse(delivery.lease_expires_at) > Date.now()) {
      continue;
    }

    let claimQuery = db!.from("rafiq_telegram_manager_deliveries")
      .update({
        status: "sending",
        attempts: Number(delivery.attempts || 0) + 1,
        lease_expires_at: new Date(Date.now() + 120000).toISOString(),
        updated_at: now,
        last_error: null,
      })
      .eq("request_id", session.request_id)
      .eq("manager_chat_id", managerId)
      .eq("status", delivery.status);
    if (delivery.status === "sending") {
      if (!delivery.lease_expires_at) continue;
      claimQuery = claimQuery.lt("lease_expires_at", now);
    }
    const { data: claimed, error: claimError } = await claimQuery.select("request_id").maybeSingle();
    if (claimError) throw new Error("telegram_manager_delivery_claim_failed");
    if (!claimed) continue;

    let sent: any;
    try {
      sent = await sendText(managerId, summary);
    } catch (sendError) {
      const reason = String(sendError).slice(0, 120);
      const { error: failedSaveError } = await db!.from("rafiq_telegram_manager_deliveries")
        .update({
          status: "failed",
          lease_expires_at: null,
          last_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", session.request_id)
        .eq("manager_chat_id", managerId)
        .eq("status", "sending");
      if (failedSaveError) throw new Error("telegram_manager_delivery_failure_save_failed");
      console.error(JSON.stringify({
        event: "telegram_manager_notice_failed",
        request_id: session.request_id,
        manager_chat_id: managerId,
        error: reason,
      }));
      continue;
    }

    const { error: sentSaveError } = await db!.from("rafiq_telegram_manager_deliveries")
      .update({
        status: "sent",
        telegram_message_id: Number.isSafeInteger(sent?.result?.message_id) ? sent.result.message_id : null,
        lease_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", session.request_id)
      .eq("manager_chat_id", managerId)
      .eq("status", "sending");
    if (sentSaveError) throw new Error("telegram_manager_delivery_receipt_save_failed");
  }

  const finalRequestStatus = await getRequestStatus(session.id);
  if (finalRequestStatus !== "collecting") {
    if (finalRequestStatus === "cancelled") await notifyManagersOfCancellation(session);
    return true;
  }

  const { data: deliveries, error: deliveriesError } = await db!.from("rafiq_telegram_manager_deliveries")
    .select("manager_chat_id,status")
    .eq("request_id", session.request_id)
    .in("manager_chat_id", MANAGER_CHAT_IDS);
  if (deliveriesError) throw new Error("telegram_manager_delivery_status_read_failed");
  const allDelivered = MANAGER_CHAT_IDS.every((managerId) =>
    (deliveries || []).some((row: any) => row.manager_chat_id === managerId && row.status === "sent")
  );
  if (!allDelivered) {
    await sendText(chatId, "حُفظ طلبك وتفاصيله، لكن لم يكتمل وصول إشعار الإدارة بعد. لم نؤكد الإرسال. أرسل /retry لإعادة محاولة الإشعارات المتبقية دون إعادة كتابة التفاصيل.");
    return true;
  }

  const { data: submitted, error: submitError } = await db!.from("rafiq_telegram_request_sessions")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("status", "collecting")
    .select("id")
    .maybeSingle();
  if (submitError) throw new Error("telegram_request_submit_failed");
  if (!submitted) {
    const { data: current, error: currentError } = await db!.from("rafiq_telegram_request_sessions")
      .select("status")
      .eq("id", session.id)
      .maybeSingle();
    if (currentError) throw new Error("telegram_request_state_read_failed");
    if (current?.status === "cancelled") {
      await notifyManagersOfCancellation(session);
      await sendText(chatId, "تم إلغاء هذا الطلب، لذلك لم نرسل تأكيدًا بتقديمه إلى الإدارة.");
    }
    return true;
  }

  await sendText(chatId, "✅ وصل طلبك إلى قناة مراجعة الإدارة بالرقم " + session.request_id + ". ستراجع الإدارة التفاصيل وتؤكد التوفر؛ لا يُعد هذا تأكيدًا لحجز الخدمة.");
  return true;
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

  const retryRequested = /^\/retry$/i.test(text.trim());
  if (session.notes !== null && session.notes !== undefined) {
    if (!retryRequested) {
      await sendText(chatId, "تم حفظ التفاصيل بالفعل. أرسل /retry لإعادة محاولة إشعارات الإدارة دون استبدال التفاصيل، أو /stop لإلغاء الطلب.");
      return true;
    }
    return deliverManagerNotifications(session, chatId, userId, String(session.notes));
  }

  const notes = text.trim().toLowerCase() === "/skip" ? "" : text.slice(0, 1000);
  const { data: saved, error: notesSaveError } = await db!.from("rafiq_telegram_request_sessions").update({
    notes, updated_at: new Date().toISOString(),
  }).eq("id", session.id).eq("status", "collecting").select("id").maybeSingle();
  if (notesSaveError) throw new Error("telegram_request_notes_save_failed");
  if (!saved) {
    await sendText(chatId, "لم يعد هذا الطلب قيد الاستكمال. أرسل /request لبدء طلب جديد عند الحاجة.");
    return true;
  }

  return deliverManagerNotifications(session, chatId, userId, notes || null);
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
    await sendText(chatId, "أهلًا بك في " + BOT_DESCRIPTION + "\n\n" + BOT_USERNAME + "\n" + BOT_PUBLIC_URL + "\n\nخدماتنا: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، والعلاج الفيزيائي المنزلي.\n\n/services — الخدمات\n/request — تسجيل طلب تراجعه الإدارة\n/stop — إلغاء الطلب الجاري
/retry — إعادة محاولة الإرسال أو تنبيه الإلغاء");
    return;
  }
  if (command === "/services") {
    await sendText(chatId, "خدمات رفيق الأساسية:", serviceKeyboard);
    return;
  }
  if (command === "/stop") {
    const session = await getActiveSession(String(chatId));
    if (session) {
      const { data: cancelled, error } = await db!.from("rafiq_telegram_request_sessions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "collecting")
        .select("id")
        .maybeSingle();
      if (error) throw new Error("telegram_request_cancel_failed");
      if (cancelled) {
        const notices = await notifyManagersOfCancellation(session);
        if (notices.pending > 0) {
          await sendText(chatId, "تم حفظ إلغاء طلبك، لكن تعذّر تأكيد وصول تنبيه الإلغاء إلى جميع المديرين. أرسل /retry لإعادة المحاولة.");
          return;
        }
      }
    }
    await sendText(chatId, "تم إيقاف الطلب الجاري. يمكنك بدء طلب جديد عبر /request. إذا لم يكتمل تنبيه الإدارة، أرسل /retry.");
    return;
  }
  if (command === "/retry" && !(await getActiveSession(String(chatId)))) {
    const cancelledSessions = await getCancelledSessions(String(chatId));
    if (cancelledSessions.length > 0) {
      let totalNotices = 0;
      let pendingNotices = 0;
      for (const cancelledSession of cancelledSessions) {
        const notices = await notifyManagersOfCancellation(cancelledSession);
        totalNotices += notices.total;
        pendingNotices += notices.pending;
      }
      if (totalNotices === 0) {
        await sendText(chatId, "تم إلغاء الطلبات السابقة، ولم يكن هناك إشعار سابق للمديرين يحتاج إلى إعادة إرسال.");
      } else if (pendingNotices > 0) {
        await sendText(chatId, "لا يزال هناك " + pendingNotices + " تنبيه إلغاء لم يصل إلى الإدارة عبر الطلبات السابقة. يمكنك إرسال /retry للمحاولة مجددًا.");
      } else {
        await sendText(chatId, "✅ تم تأكيد وصول جميع تنبيهات الإلغاء المعلّقة إلى المديرين الذين استلموا الطلبات الأصلية.");
      }
      return;
    }
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
      language: "ar", status: "collecting",
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
