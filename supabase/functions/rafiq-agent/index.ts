import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { answerFromKnowledge } from "../_shared/rafiq-knowledge.ts";

const ALLOWED_ORIGINS = (Deno.env.get("RAFIQ_ALLOWED_ORIGINS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.includes(origin);
}
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    ...(origin && ALLOWED_ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
const jsonHeaders = (req: Request) => ({ ...corsHeaders(req), "Content-Type": "application/json" });
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceKey) throw new Error("Supabase server configuration is incomplete");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isServiceCaller(req: Request): boolean {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!SERVICE_KEY || token.length !== SERVICE_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ SERVICE_KEY.charCodeAt(i);
  return diff === 0;
}

type ChatMessage = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; context: ChatMessage[]; language: string | null; escalation_state: string | null };

const normalizeArabic = (value: string) => value
  .normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ؤ/g, "و")
  .replace(/ئ/g, "ي")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const fallback = (message: string, language?: string | null) =>
  answerFromKnowledge(message, language).reply;

async function getConversation(channel: string, externalId: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from("rafiq_conversations")
    .select("id,context,language,escalation_state")
    .eq("channel", channel)
    .eq("external_conversation_id", externalId)
    .maybeSingle();
  if (error) throw new Error("conversation_read_failed: " + error.message);
  if (!data) return null;
  return { ...data, context: Array.isArray(data.context) ? data.context : [] } as Conversation;
}

async function saveConversation(
  channel: string, externalId: string, phone: string | null, language: string,
  context: ChatMessage[], escalationState: string,
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("rafiq_conversations").upsert({
    channel, external_conversation_id: externalId, customer_phone: phone, language,
    context: context.slice(-12), escalation_state: escalationState,
    last_message_at: now, updated_at: now,
  }, { onConflict: "channel,external_conversation_id" }).select("id").single();
  if (error || !data?.id) throw new Error("conversation_save_failed: " + (error?.message ?? "missing id"));
  return String(data.id);
}

async function createEscalation(conversationId: string, reason: string, payload: Record<string, unknown>) {
  const { error } = await supabase.from("whatsapp_pending_approvals").insert({
    conversation_id: conversationId, reason, status: "open", payload,
  });
  if (error) throw new Error("escalation_create_failed: " + error.message);
}

const systemPrompt = `أنت وكيل استقبال لمنصة RAFIQ | رفيق في لبنان.
أجب بإيجاز ووضوح وبنبرة إنسانية محترمة. العربية هي اللغة الافتراضية؛ أجب بالإنجليزية أو الفرنسية إذا كانت لغة السائل.
المعرفة المؤكدة: الخدمات الحالية هي رعاية كبار السن، رعاية المرضى، التمريض المنزلي، والعلاج الفيزيائي المنزلي. تُراجع الإدارة كل طلب وتؤكد التوفر.
يمكن لمقدمي الرعاية والممرضين والمعالجين الفيزيائيين والأطباء المؤهلين تقديم طلب انضمام عبر الصفحة المناسبة. الإرسال لا يعني القبول؛ تتحقق الإدارة من المعلومات والوثائق.
تقديم طلب الانضمام إلى شبكة مقدمي الخدمات مجاني. لا توجد رسوم لتقديم الطلب أو مراجعته. لا تطلب المال ولا تقترح تحويله.
طلبات الأسر تُرسل عبر نموذج طلب رعاية لأهلي. لا يوجد سعر أو وقت توفر نهائي مؤكد؛ الإدارة توضح التفاصيل قبل أي اتفاق.
بيانات الطلبات خاصة ولا تُعرض للعامة؛ لا تطلب كلمات مرور أو رموز تحقق أو تفاصيل طبية غير ضرورية.
لا يوجد وكيل على WhatsApp إطلاقاً. رسائل WhatsApp الواردة تُحوّل إلى المدير في Telegram فقط، والمدير يرد يدوياً من WhatsApp.
إذا لم تعرف، قل بوضوح: لا أعرف الإجابة المؤكدة، وأحل السؤال إلى الإدارة. لا تخمّن.
ممنوع التشخيص أو النصائح الطبية أو وصف الأدوية أو الجرعات أو تعديل العلاج. في الخطر الفوري وجّه إلى خدمات الطوارئ المحلية فوراً، ولا تؤخر طلب المساعدة.
لا تخترع خدمات أو أسعاراً أو توفراً أو قبولاً أو تعاقداً أو مواعيد رد. لا تدّعِ استلام طلب إلا إذا نجح حفظه فعلياً.`;

function extractOpenAIText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output ?? []) for (const c of item?.content ?? []) {
    if (typeof c?.text === "string") parts.push(c.text);
  }
  return parts.join("\n").trim();
}

async function callOpenAI(message: string, context: ChatMessage[]): Promise<string | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const model = (Deno.env.get("RAFIQ_AGENT_MODEL") || Deno.env.get("OPENAI_MODEL") || "").trim();
  if (!model) {
    console.error(JSON.stringify({ event: "rafiq_agent_model_missing", provider: "openai" }));
    return null;
  }
  const input = [
    { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
    ...context.slice(-10).map((x) => ({ role: x.role, content: [{ type: "input_text", text: x.content }] })),
    { role: "user", content: [{ type: "input_text", text: message }] },
  ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ model, input, max_output_tokens: 650 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({ event: "rafiq_agent_provider_error", provider: "openai", status: response.status, detail: String(payload?.error?.code || payload?.error?.type || "provider_error").slice(0, 100) }));
    return null;
  }
  return extractOpenAIText(payload) || null;
}

async function callGemini(message: string, context: ChatMessage[]): Promise<string | null> {
  const key = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!key) return null;
  const model = (Deno.env.get("RAFIQ_GEMINI_MODEL") || "").trim();
  if (!model) {
    console.error(JSON.stringify({ event: "rafiq_agent_model_missing", provider: "gemini" }));
    return null;
  }
  const contents = [
    ...context.slice(-10).map((x) => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.content }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 650, temperature: 0.3 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({ event: "rafiq_agent_provider_error", provider: "gemini", status: response.status, detail: String(payload?.error?.status || "provider_error").slice(0, 100) }));
    return null;
  }
  const reply = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part: any) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean).join("\n").trim();
  return reply || null;
}

async function generateReply(message: string, context: ChatMessage[], language: string): Promise<{ reply: string; mode: string }> {
  const provider = (Deno.env.get("RAFIQ_AGENT_PROVIDER") || "").trim().toLowerCase();
  if (provider === "gemini") {
    const reply = await callGemini(message, context);
    if (reply) return { reply, mode: "gemini" };
  } else if (provider === "openai") {
    const reply = await callOpenAI(message, context);
    if (reply) return { reply, mode: "openai" };
  } else {
    const gemini = await callGemini(message, context);
    if (gemini) return { reply: gemini, mode: "gemini" };
    const openai = await callOpenAI(message, context);
    if (openai) return { reply: openai, mode: "openai" };
  }
  return { reply: fallback(message, language), mode: "guided" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return originAllowed(req) ? new Response(null, { status: 204, headers: corsHeaders(req) }) : Response.json({ error: "origin_not_allowed" }, { status: 403 });
  if (!originAllowed(req)) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: jsonHeaders(req)(req) });

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "invalid_json", reply: "تعذّر قراءة الطلب. أعد إرسال رسالتك." }, { status: 400, headers: jsonHeaders(req) });
    }
    const rawMessage = typeof body.message === "string" ? body.message : "";
    const message = rawMessage.normalize("NFKC").trim();
    if (!message || message.length > 1500) {
      return Response.json({ error: "invalid_message", reply: "اكتب سؤالك بوضوح وبحد أقصى 1500 حرف." }, { status: 400, headers: jsonHeaders(req) });
    }
    // The gateway's verify_jwt accepts the public anon key too. Only the exact
    // server-side service-role bearer may select a private channel, phone, or meta:* id.
    const trusted = isServiceCaller(req);
    const channelRaw = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "web";
    if (trusted && channelRaw === "whatsapp") return Response.json({ error: "whatsapp_agent_disabled" }, { status: 403, headers: jsonHeaders(req) });
    const requestedChannel = ["web", "telegram"].includes(channelRaw) ? channelRaw : "web";
    const externalIdRaw = body.conversation_id ?? body.external_conversation_id;
    const requestedId = typeof externalIdRaw === "string" ? externalIdRaw.trim() : "";
    const channel = trusted ? requestedChannel : "web";
    const conversationId = trusted
      ? (requestedId || crypto.randomUUID())
      : (UUID_RE.test(requestedId) ? requestedId : crypto.randomUUID());
    if (conversationId.length > 200) {
      return Response.json({ error: "invalid_conversation_id" }, { status: 400, headers: jsonHeaders(req) });
    }
    const phone = trusted && typeof body.phone === "string" ? body.phone.slice(0, 40) : null;
    const language = typeof body.locale === "string" && body.locale.trim() ? body.locale.trim().slice(0, 12) : "ar";

    const existing = await getConversation(channel, conversationId);
    const context = (existing?.context ?? []).filter((x: any) =>
      x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string"
    ).slice(-10);
    const generated = await generateReply(message, context, language);
    const nextContext: ChatMessage[] = [
      ...context,
      { role: "user", content: message },
      { role: "assistant", content: generated.reply },
    ].slice(-12);

    const normalized = normalizeArabic(message);
    const emergency = /(طوارئ|طواري|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(normalized);
    const needsHuman = emergency || /(ادارة|موظف|بشري|موافقة|اعتماد|شكوى|اريد شخص|اريد التحدث مع|كلموني|اتصلوا بي)/.test(normalized);
    const alreadyEscalated = existing?.escalation_state === "open";
    const escalationState = needsHuman ? "open" : (existing?.escalation_state || "none");
    const savedConversationId = await saveConversation(channel, conversationId, phone, language, nextContext, escalationState);

    if (needsHuman && !alreadyEscalated) {
      await createEscalation(savedConversationId, emergency ? "medical_emergency" : "human_assistance", {
        channel, external_conversation_id: conversationId, message,
      });
    }

    return Response.json({
      reply: generated.reply,
      mode: generated.mode,
      conversation_id: conversationId,
      escalated: needsHuman || alreadyEscalated,
    }, { headers: jsonHeaders(req) });
  } catch (error) {
    console.error(JSON.stringify({ event: "rafiq_agent_error", error: String(error).slice(0, 240) }));
    return Response.json({
      error: "agent_processing_failed",
      reply: fallback("سؤال غير معروف", "ar"),
    }, { status: 500, headers: jsonHeaders(req) });
  }
});
