import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || "").trim();
const WEBHOOK_SECRET = (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "").trim();
const MAX_BODY_BYTES = 512 * 1024;
const CLOUDFLARE_ACCOUNT_ID = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "").trim();
const CLOUDFLARE_API_TOKEN = (Deno.env.get("CLOUDFLARE_API_TOKEN") || "").trim();
const CLOUDFLARE_AI_MODEL = (Deno.env.get("CLOUDFLARE_AI_MODEL") || "@cf/meta/llama-3.1-8b-instruct").trim();
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

const SERVICE_ITEMS: Record<string,string> = {
  labs: "المختبرات الطبية",
  imaging: "مراكز الأشعة والتصوير الطبي",
  physio: "مراكز العلاج الفيزيائي",
  equipment_sale: "مراكز بيع المعدات الطبية",
  equipment_rent: "مراكز تأجير المعدات الطبية",
};
const AREA_ITEMS = ["طرابلس","الضنية","زغرتا","الكورة","البترون","بيروت","باقي لبنان"];
const serviceKeyboard = {
  inline_keyboard: [
    [{ text: "🧪 المختبرات الطبية", callback_data: "dir:labs" }],
    [{ text: "🩻 الأشعة والتصوير الطبي", callback_data: "dir:imaging" }],
    [{ text: "🧑‍🦽 العلاج الفيزيائي", callback_data: "dir:physio" }],
    [{ text: "🦽 بيع المعدات الطبية", callback_data: "dir:equipment_sale" }],
    [{ text: "🦽 تأجير المعدات الطبية", callback_data: "dir:equipment_rent" }],
    [{ text: "📍 المناطق", callback_data: "dir:areas" }],
  ],
};
function faq(text: string): string {
  const t = normalize(text);
  if (/(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t)) {
    return "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.";
  }
  if (/(خصم|تخفيض|كود|رمز|قسيمه|قسيمة|discount|coupon)/.test(t)) {
    return "لا أستطيع تأكيد خصم أو إصدار كود قبل اعتماد المركز وقيمة الخصم وشروطه من إدارة RAFIQ. سيظهر فقط العرض الذي تمت الموافقة عليه رسميًا.";
  }
  if (/(مختبر|تحاليل|فحوص|laborator)/.test(t)) return "فئة المختبرات الطبية ضمن دليل رفيق. ستُعرض بيانات المراكز بعد مراجعتها واعتمادها من الإدارة.";
  if (/(اشعه|أشعة|تصوير|رنين|طبقي|radiolog|imaging)/.test(t)) return "فئة مراكز الأشعة والتصوير الطبي ضمن دليل رفيق. لن يظهر أي مركز قبل اعتماد بياناته من الإدارة.";
  if (/(فيزيائي|طبيعي|فيزيو|physio)/.test(t)) return "فئة مراكز العلاج الفيزيائي ضمن دليل رفيق. ستُنشر المراكز المعتمدة فقط.";
  if (/(معدات|كرسي|سرير طبي|جهاز طبي|بيع|تأجير)/.test(t)) return "يشمل دليل رفيق مراكز بيع المعدات الطبية وتأجيرها. تُعرض بيانات المركز بعد موافقة الإدارة.";
  if (/(منطقه|منطقة|وين|اين|تغطيه|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت)/.test(t)) {
    return "مناطق الدليل: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت، وباقي لبنان. ظهور أي مركز مرتبط باعتماد الإدارة.";
  }
  if (/(واتساب|whatsapp|تواصل|رقم الاداره)/.test(t)) {
    return "للتواصل الإداري: +961 81 506 299. قناة Telegram: https://t.me/+a7CDblNyGKw1Yjg8\nقناة WhatsApp: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K";
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
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
    return "أهلًا بك في RAFIQ 🇱🇧. يمكنك اختيار نوع الخدمة أو المنطقة من القائمة. لا يستقبل البوت طلبات تقديم أو ملفات، ولا يؤكد خصمًا أو كودًا قبل موافقة الإدارة.";
  }
  try {
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(CLOUDFLARE_ACCOUNT_ID) + "/ai/run/" + encodeURIComponent(CLOUDFLARE_AI_MODEL),
      {
        method: "POST",
        headers: { "authorization": "Bearer " + CLOUDFLARE_API_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "أنت مساعد معلومات ودليل خدمات لمنصة RAFIQ في لبنان. أجب عن المختبرات الطبية، مراكز الأشعة والتصوير، مراكز العلاج الفيزيائي، مراكز بيع وتأجير المعدات الطبية، ومناطق الخدمة: طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت وباقي لبنان. لا تجمع بيانات شخصية، ولا تفتح طلبات، ولا تقبل ملفات أو طلبات انتساب، ولا تنشئ حجوزات. لا تخترع أسماء مراكز أو أسعارًا أو خصومات أو أكوادًا أو توفرًا. أكد أن المراكز والعروض لا تظهر إلا بعد اعتماد الإدارة. المريض يدفع للمركز مباشرة. لا تستقبل RAFIQ أموال العملاء. أجب باختصار، ولا توجه المستخدم إلى /request." },
            { role: "user", content: redactPhones(text) }
          ],
          max_tokens: 300,
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(9000)
      }
    );
    if (!response.ok) return "أستطيع شرح فئات دليل رفيق ومناطقه. اختر الخدمة من القائمة، وسيظهر فقط المركز الذي اعتمدته الإدارة.";
    const payload = await response.json().catch(() => ({}));
    const answer = typeof payload?.result?.response === "string" ? payload.result.response.trim() : "";
    if (!answer || payload?.success === false) return "اختر نوع الخدمة أو المنطقة من القائمة. لا تظهر المراكز أو الخصومات إلا بعد اعتماد الإدارة.";
    return answer.slice(0, 2000);
  } catch (error) {
    console.error(JSON.stringify({ event: "telegram_ai_provider_error", reason: String(error).slice(0, 100) }));
    return "اختر نوع الخدمة أو المنطقة من القائمة. لا تظهر المراكز أو الخصومات إلا بعد اعتماد الإدارة.";
  }
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
    await telegram("answerCallbackQuery", { callback_query_id: callback.id });
    if (data === "dir:areas") {
      await sendText(chatId, "المناطق التي يغطيها دليل RAFIQ:\n" + AREA_ITEMS.map((x) => "• " + x).join("\n") + "\n\nتظهر المراكز بعد اعتمادها من الإدارة.");
      return;
    }
    if (data.startsWith("dir:") && SERVICE_ITEMS[data.slice(4)]) {
      const label = SERVICE_ITEMS[data.slice(4)];
      await sendText(chatId, "اخترت: " + label + ".\n\nتُعرض المراكز بعد مراجعتها واعتمادها من إدارة RAFIQ. لا يوجد اسم مركز أو خصم أو كود مؤكد قبل الاعتماد.");
      return;
    }
    return;
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  if (chatId === undefined || message?.chat?.type !== "private") return;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!text) {
    await sendText(chatId, "اكتب سؤالك أو اختر نوع الخدمة من القائمة. لا ترسل بيانات شخصية أو مستندات.");
    return;
  }
  const command = text.toLowerCase().split(/\s+/)[0];
  if (command === "/start" || command === "/help") {
    await sendText(chatId, "أهلًا بك في RAFIQ | رفيق 🇱🇧\n\nنصل بالحب والأمان لرعاية العائلة.\n\nهذا البوت دليل معلومات للمختبرات الطبية، مراكز الأشعة والتصوير، مراكز العلاج الفيزيائي، ومراكز بيع وتأجير المعدات الطبية.\n\nلا يستقبل البوت طلبات تقديم أو ملفات. المراكز والعروض والخصومات لا تُنشر إلا بعد موافقة الإدارة.\n\nقناة Telegram: https://t.me/+a7CDblNyGKw1Yjg8\nقناة WhatsApp: https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K\nWhatsApp الإدارة: +961 81 506 299", serviceKeyboard);
    return;
  }
  if (command === "/services" || command === "/directory") {
    await sendText(chatId, "اختر فئة الدليل:", serviceKeyboard);
    return;
  }
  if (command === "/areas") {
    await sendText(chatId, "مناطق الدليل:\n" + AREA_ITEMS.map((x) => "• " + x).join("\n"));
    return;
  }
  if (command === "/request" || command === "/stop" || command === "/apply" || command === "/register") {
    await sendText(chatId, "تم إيقاف مسار الطلبات والتقديم عبر البوت. استخدم /services لتصفح فئات دليل RAFIQ أو /areas لعرض المناطق.");
    return;
  }
  await sendText(chatId, await generateFaqReply(text), serviceKeyboard);
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
