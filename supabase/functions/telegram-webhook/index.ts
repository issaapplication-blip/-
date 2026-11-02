import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { answerFromKnowledge } from "../_shared/rafiq-knowledge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const WEBHOOK_SECRET = (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "").trim();
const MANAGER_CHAT_IDS = [...new Set((Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((x) => x.trim()).filter((x) => /^-?\\d+$/.test(x)))];
const MANAGER_CHAT_IDS_INVALID = (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
  .split(",").map((x) => x.trim()).filter(Boolean).some((x) => !/^-?\\d+$/.test(x));
const MAX_BODY_BYTES = 512 * 1024;
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
  return answerFromKnowledge(text).reply;
}

async function generateFaqReply(text: string): Promise<string> {
  return faq(text);
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
  if (!db || !BOT_TOKEN || WEBHOOK_SECRET.length < 32 || MANAGER_CHAT_IDS.length === 0 || MANAGER_CHAT_IDS_INVALID) {
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
