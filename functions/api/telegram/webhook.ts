type DBStatement = {
  bind: (...values: unknown[]) => DBStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
interface D1Like { prepare(sql: string): DBStatement; }
interface Env {
  RAFIQ_DB?: D1Like;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_MANAGER_CHAT_IDS?: string;
}
type Context = { request: Request; env: Env };

const SIGNATURE = "— فريق رفيق | RAFIQ 🇱🇧";
const SERVICES: Record<string, string> = {
  elderly: "رعاية كبار السن", patient: "رعاية المرضى",
  nurse: "التمريض المنزلي", physio: "العلاج الفيزيائي المنزلي",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
export function constantTimeSecretMatch(expected: string, provided: string): boolean {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  if (a.length < 32 || a.length > 256 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export function normalizeTelegramText(value: string): string {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
function managerIds(value?: string): string[] {
  return Array.from(new Set((value || "").split(",").map(x => x.trim()).filter(x => /^-?\d+$/.test(x))));
}
function signed(text: string): string { return text.includes(SIGNATURE) ? text : text + "\n\n" + SIGNATURE; }

async function telegram(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("telegram_bot_token_missing");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; error_code?: number };
  if (!response.ok || result.ok !== true) throw new Error("telegram_api_failure_" + String(result.error_code || response.status));
  return result;
}
async function sendText(env: Env, id: string | number, text: string, markup?: Record<string, unknown>): Promise<void> {
  await telegram(env, "sendMessage", {
    chat_id: id, text: signed(text), disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}
function keyboard(): Record<string, unknown> {
  return { inline_keyboard: [
    [{ text: "رعاية كبار السن", callback_data: "reqsvc:elderly" }, { text: "رعاية المرضى", callback_data: "reqsvc:patient" }],
    [{ text: "التمريض المنزلي", callback_data: "reqsvc:nurse" }, { text: "العلاج الفيزيائي", callback_data: "reqsvc:physio" }],
  ] };
}
function faq(text: string): string {
  const t = normalizeTelegramText(text);
  if (/(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(t))
    return "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.";
  if (/(سعر|تكلف|كم|اسعار|الاسعار|price|cost)/.test(t))
    return "لا يوجد سعر موحّد يمكنني تأكيده. تتحدد التكلفة بحسب الخدمة والمنطقة والدوام والتوفر؛ وتؤكد الإدارة السعر قبل أي اتفاق. اكتب /request لبدء طلب تراجعه الإدارة.";
  if (/(تمريض|ممرض|ممرضة|حقن|ضماد|جرح)/.test(t))
    return "يساعد رفيق في تنظيم طلب التمريض المنزلي، وتراجع الإدارة المنطقة والمهمة والتوفر. اكتب /request لبدء الطلب.";
  if (/(فيزيائي|طبيعي|فيزيو|physio)/.test(t))
    return "يساعد رفيق في تنظيم طلب العلاج الفيزيائي المنزلي؛ وتراجع الإدارة ملاءمة الخدمة والتوفر. اكتب /request لبدء الطلب.";
  if (/(مسن|كبار السن|كبير السن|والدي|والدتي|جدتي|جدي|مرافق|رعايه منزليه)/.test(t))
    return "ينظم رفيق طلبات رعاية كبار السن داخل المنزل، نهارًا أو ليلًا أو بنظام الإقامة بحسب التوفر. اكتب /request لبدء طلب تراجعه الإدارة.";
  if (/(مريض|مريضة|بعد المستشفى|بعد عملية|رعاية المريض)/.test(t))
    return "يساعد رفيق في تنظيم طلب رعاية منزلية للمريض، وتراجع الإدارة الاحتياجات دون تقديم تشخيص أو استبدال الفريق الطبي. اكتب /request لبدء الطلب.";
  if (/(منطقة|وين|اين|تغطية|لبنان|طرابلس|الضنيه|ضنيه|زغرتا|الكوره|البترون|بيروت)/.test(t))
    return "نستقبل طلبات من مناطق لبنان، ويُراجع التوفر لكل خدمة ومنطقة على حدة. اكتب /request وحدد المنطقة المطلوبة.";
  if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام)/.test(t))
    return "للمتابعة الإدارية: WhatsApp +961 81 506 299. بوت رفيق: https://t.me/RAFIQ_Care_Bot. الردود الآلية على WhatsApp متوقفة إلى حين اجتياز اختبار منفصل.";
  return "أهلًا بك في رفيق. أستطيع مساعدتك بالمعلومات العامة عن رعاية كبار السن والمرضى والتمريض المنزلي والعلاج الفيزيائي. اكتب /services للخدمات أو /request لتقديم طلب تراجعه الإدارة.";
}
async function claim(db: D1Like, id: number): Promise<"claimed" | "completed" | "busy"> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    "INSERT INTO telegram_update_receipts(update_id,status,attempts,created_at,updated_at) VALUES(?,'processing',1,?,?) " +
    "ON CONFLICT(update_id) DO UPDATE SET status='processing',attempts=attempts+1,updated_at=excluded.updated_at " +
    "WHERE telegram_update_receipts.status='failed' OR (telegram_update_receipts.status='processing' AND telegram_update_receipts.updated_at < excluded.updated_at - 120)"
  ).bind(id, now, now).run();
  if ((result.meta?.changes || 0) > 0) return "claimed";
  const row = await db.prepare("SELECT status FROM telegram_update_receipts WHERE update_id=?").bind(id).first<{status:string}>();
  return row?.status === "completed" ? "completed" : "busy";
}
async function mark(db: D1Like, id: number, status: "completed" | "failed"): Promise<void> {
  await db.prepare("UPDATE telegram_update_receipts SET status=?,updated_at=? WHERE update_id=?")
    .bind(status, Math.floor(Date.now() / 1000), id).run();
}
async function allowRate(db: D1Like, chatId: string): Promise<boolean> {
  const start = Math.floor(Date.now() / 60000) * 60;
  await db.prepare(
    "INSERT INTO telegram_rate_limits(chat_id,window_start,request_count) VALUES(?,?,1) " +
    "ON CONFLICT(chat_id) DO UPDATE SET request_count=CASE WHEN telegram_rate_limits.window_start=excluded.window_start THEN telegram_rate_limits.request_count+1 ELSE 1 END,window_start=excluded.window_start"
  ).bind(chatId, start).run();
  const row = await db.prepare("SELECT request_count FROM telegram_rate_limits WHERE chat_id=?").bind(chatId).first<{request_count:number}>();
  return Number(row?.request_count || 0) <= 12;
}
async function beginRequest(env: Env, db: D1Like, chatId: string): Promise<void> {
  if (!managerIds(env.TELEGRAM_MANAGER_CHAT_IDS).length) {
    await sendText(env, chatId, "تسجيل الطلبات متوقف مؤقتًا حتى تكتمل إعدادات فريق الإدارة. يمكنك الاستفسار عبر /services.");
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const requestId = "RFQ-TG-" + new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  await db.prepare(
    "INSERT INTO telegram_request_sessions(chat_id,request_id,step,created_at,updated_at) VALUES(?,?,'service',?,?) " +
    "ON CONFLICT(chat_id) DO UPDATE SET request_id=excluded.request_id,step='service',service=NULL,area=NULL,schedule=NULL,created_at=excluded.created_at,updated_at=excluded.updated_at"
  ).bind(chatId, requestId, now, now).run();
  await sendText(env, chatId, "📝 بدأنا طلبًا جديدًا لدى RAFIQ. رقم الطلب: " + requestId + "\n\nاختر الخدمة المطلوبة:", keyboard());
}
async function deliverRequest(env: Env, db: D1Like, chatId: string): Promise<void> {
  const s = await db.prepare("SELECT request_id,service,area,schedule FROM telegram_request_sessions WHERE chat_id=? AND step='notify'")
    .bind(chatId).first<{request_id:string;service:string;area:string;schedule:string}>();
  if (!s) return;
  const managers = managerIds(env.TELEGRAM_MANAGER_CHAT_IDS);
  if (!managers.length) throw new Error("telegram_manager_chat_ids_missing");
  await db.prepare(
    "INSERT OR IGNORE INTO telegram_requests(request_id,chat_id,service,area,schedule,status,created_at) VALUES(?,?,?,?,?,'new',?)"
  ).bind(s.request_id,chatId,s.service,s.area,s.schedule,Math.floor(Date.now()/1000)).run();
  for (const managerId of managers) {
    const alreadySent = await db.prepare("SELECT request_id FROM telegram_request_notifications WHERE request_id=? AND manager_chat_id=?")
      .bind(s.request_id,managerId).first();
    if (alreadySent) continue;
    await sendText(env, managerId, [
      "📝 طلب رعاية جديد — RAFIQ", "رقم الطلب: " + s.request_id,
      "الخدمة: " + (SERVICES[s.service] || s.service), "المنطقة: " + s.area,
      "الدوام: " + s.schedule, "Telegram chat ID: " + chatId, "الحالة: جديد — بانتظار مراجعة الإدارة",
    ].join("\n"));
    await db.prepare("INSERT OR IGNORE INTO telegram_request_notifications(request_id,manager_chat_id,sent_at) VALUES(?,?,?)")
      .bind(s.request_id,managerId,Math.floor(Date.now()/1000)).run();
  }
  await sendText(env, chatId, "✅ استلم رفيق طلبك بالرقم " + s.request_id + ". ستراجع الإدارة التفاصيل والتوفر. هذا إشعار باستلام الطلب وليس تأكيدًا لحجز الخدمة.");
  await db.prepare("DELETE FROM telegram_request_sessions WHERE chat_id=? AND request_id=?").bind(chatId,s.request_id).run();
}
async function processCallback(env: Env, db: D1Like, cb: any): Promise<void> {
  const id = String(cb?.id || "");
  const chatId = cb?.message?.chat?.id;
  if (!id) return;
  if (!chatId || cb.message?.chat?.type !== "private") {
    await telegram(env,"answerCallbackQuery",{callback_query_id:id}); return;
  }
  const service = String(cb.data || "").replace(/^reqsvc:/,"");
  if (!SERVICES[service] || !String(cb.data || "").startsWith("reqsvc:")) {
    await telegram(env,"answerCallbackQuery",{callback_query_id:id,text:"اختيار غير صالح"}); return;
  }
  const chat = String(chatId);
  const session = await db.prepare("SELECT step FROM telegram_request_sessions WHERE chat_id=?").bind(chat).first<{step:string}>();
  if (!session || session.step !== "service") {
    await telegram(env,"answerCallbackQuery",{callback_query_id:id,text:"ابدأ طلبًا جديدًا عبر /request"}); return;
  }
  await db.prepare("UPDATE telegram_request_sessions SET service=?,step='area',updated_at=? WHERE chat_id=?")
    .bind(service,Math.floor(Date.now()/1000),chat).run();
  await telegram(env,"answerCallbackQuery",{callback_query_id:id});
  await sendText(env,chat,"تم اختيار " + SERVICES[service] + ". ما المنطقة أو المدينة المطلوبة؟");
}
async function processMessage(env: Env, db: D1Like, message: any): Promise<void> {
  const chatId = String(message.chat.id);
  const text = typeof message.text === "string" ? message.text.trim().slice(0,1200) : "";
  if (!text) { await sendText(env,chatId,"اكتب سؤالك أو استخدم /services و/request. لا ترسل كلمات مرور أو رموز تحقق."); return; }
  const command = text.toLowerCase().split(/\s+/)[0].split("@")[0];
  if (command === "/start" || command === "/help") {
    await sendText(env,chatId,"أهلًا بك في RAFIQ | رفيق 🇱🇧\n\nنصل بالحب والأمان لرعاية العائلة.\n\nخدماتنا: رعاية كبار السن، رعاية المرضى، التمريض المنزلي، والعلاج الفيزيائي المنزلي.\n\n/services — الخدمات\n/request — تقديم طلب تراجعه الإدارة\n/stop — إلغاء الطلب الجاري"); return;
  }
  if (command === "/services") { await sendText(env,chatId,"خدمات رفيق الأساسية:",keyboard()); return; }
  if (command === "/stop") {
    await db.prepare("DELETE FROM telegram_request_sessions WHERE chat_id=?").bind(chatId).run();
    await sendText(env,chatId,"تم إيقاف الطلب الجاري. يمكنك بدء طلب جديد عبر /request."); return;
  }
  if (command === "/request") { await beginRequest(env,db,chatId); return; }

  const session = await db.prepare("SELECT step FROM telegram_request_sessions WHERE chat_id=?").bind(chatId).first<{step:string}>();
  if (session?.step === "notify") { await deliverRequest(env,db,chatId); return; }
  if (session?.step === "area") {
    await db.prepare("UPDATE telegram_request_sessions SET area=?,step='schedule',updated_at=? WHERE chat_id=?")
      .bind(text.slice(0,120),Math.floor(Date.now()/1000),chatId).run();
    await sendText(env,chatId,"ما نظام الدوام المطلوب؟ (نهاري، ليلي، أو إقامة)"); return;
  }
  if (session?.step === "schedule") {
    await db.prepare("UPDATE telegram_request_sessions SET schedule=?,step='notify',updated_at=? WHERE chat_id=?")
      .bind(text.slice(0,120),Math.floor(Date.now()/1000),chatId).run();
    await deliverRequest(env,db,chatId); return;
  }
  await sendText(env,chatId,faq(text));
}
async function processUpdate(env: Env, db: D1Like, update: any): Promise<void> {
  if (update?.callback_query) {
    const callbackChat = update.callback_query?.message?.chat;
    if (callbackChat?.type === 'private' && callbackChat.id !== undefined && !(await allowRate(db, String(callbackChat.id)))) {
      await telegram(env, 'answerCallbackQuery', { callback_query_id: String(update.callback_query.id || ''), text: 'يرجى المحاولة بعد قليل.' });
      return;
    }
    await processCallback(env,db,update.callback_query);
    return;
  }
  const m = update?.message;
  if (!m || m.chat?.type !== "private" || m.from?.is_bot) return;
  if (!(await allowRate(db,String(m.chat.id)))) return;
  await processMessage(env,db,m);
}
export const onRequestGet = (): Response => json(200,{ok:true,service:"RAFIQ Telegram webhook",method:"POST"});
export const onRequestPost = async ({request,env}: Context): Promise<Response> => {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  const secret = (env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const db = env.RAFIQ_DB;
  if (!token || !db || !/^[A-Za-z0-9_-]{32,256}$/.test(secret))
    return json(503,{ok:false,error:"webhook_configuration_incomplete"});
  if (!constantTimeSecretMatch(secret,request.headers.get("x-telegram-bot-api-secret-token") || ""))
    return json(401,{ok:false,error:"unauthorized"});
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 256*1024) return json(413,{ok:false,error:"payload_too_large"});
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256*1024) return json(413,{ok:false,error:"payload_too_large"});
  let update: any;
  try { update = JSON.parse(raw); } catch { return json(200,{ok:true,status:"invalid_json_ignored"}); }
  const id = update?.update_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0)
    return json(200,{ok:true,status:"invalid_update_ignored"});
  try {
    const state = await claim(db,id);
    if (state === "completed") return json(200,{ok:true,status:"duplicate_completed"});
    if (state === "busy") return json(503,{ok:false,error:"update_in_progress_retry"});
    await processUpdate(env,db,update);
    await mark(db,id,"completed");
    return json(200,{ok:true,status:"processed"});
  } catch (error) {
    await mark(db,id,"failed").catch(() => undefined);
    console.error(JSON.stringify({event:"rafig_telegram_webhook_failed",update_id:id,reason:String(error).slice(0,120)}));
    return json(503,{ok:false,error:"processing_failed_retry"});
  }
};
