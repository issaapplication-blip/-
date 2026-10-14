import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...cors, "Content-Type": "application/json" };
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceKey) throw new Error("Supabase server configuration is incomplete");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

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

const fallback = (message: string) => {
  const m = normalizeArabic(message);
  if (/(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة|جلطة)/.test(m)) {
    return "إذا كانت هناك حالة طارئة أو خطر فوري، اتصل فورًا بخدمات الطوارئ المحلية أو بالفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار رفيق.";
  }
  if (/(ممرض|ممرضة|تمريض|حقن|ضماد|غيار|جرح)/.test(m)) {
    return "يمكن لرفيق مساعدتك في تنظيم طلب التمريض المنزلي. في أي مدينة أو منطقة تحتاج إلى الخدمة، وما المهمة التمريضية المطلوبة؟ سيؤكد الفريق المختص ملاءمة الخدمة والتوفر.";
  }
  if (/(علاج فيزيائي|علاج طبيعي|فيزيو|physio)/.test(m)) {
    return "يساعد رفيق في تنظيم طلب العلاج الفيزيائي المنزلي. ما المدينة أو المنطقة، وهل الطلب بعد إصابة أو عملية أو لحاجة أخرى؟ يراجع الفريق التفاصيل ويؤكد التوفر.";
  }
  if (/(مسن|كبير السن|كبار السن|والدي|والدتي|جدتي|جدي|رعاية منزلية|مرافق)/.test(m)) {
    return "أكيد، يساعد رفيق في تنظيم رعاية المسنين داخل المنزل. ما المدينة أو المنطقة، وهل تحتاجون إلى رعاية نهارية أم ليلية أم إقامة؟";
  }
  if (/(مريض|مريضة|بعد المستشفى|بعد عملية|رعاية المريض)/.test(m)) {
    return "أستطيع مساعدتك في ترتيب طلب رعاية منزلية للمريض. ما المدينة أو المنطقة، وهل يحتاج إلى مساعدة يومية أم تمريض متخصص أم علاج فيزيائي؟";
  }
  if (/(سعر|تكلفة|كم|اسعار|الاسعار|price|cost)/.test(m)) {
    return "تتحدد التكلفة بعد معرفة المنطقة، ونوع الخدمة، والدوام، واحتياجات الحالة، وتوفر مقدم الخدمة. لا أريد إعطاءك سعرًا غير مؤكد. ما الخدمة والمنطقة المطلوبتان؟";
  }
  if (/(مناطق|منطقة|وين|اين|تغطية|لبنان)/.test(m)) {
    return "نستقبل طلبات من مختلف مناطق لبنان، وتُراجع كل حالة بحسب المنطقة والخدمة المطلوبة. ما المدينة أو المنطقة التي تريد الخدمة فيها؟";
  }
  if (/(تواصل|واتساب|whatsapp|telegram|تلغرام|تيليجرام|رقم الادارة)/.test(m)) {
    return "يمكنك التواصل مع إدارة رفيق عبر WhatsApp على الرقم +961 81 506 299. كما يمكنك استخدام بوت Telegram: https://t.me/RAFIQ_Care_Bot. لا يُرسل هذا الوكيل رسائل WhatsApp تلقائيًا.";
  }
  return "مرحبًا بك في RAFIQ | رفيق 🌿 أساعدك في رعاية المسنين والمرضى، والتمريض المنزلي، والعلاج الفيزيائي. أخبرني باحتياجك بكلماتك، وسأسألك عن المعلومة التالية الضرورية فقط.";
};

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

const systemPrompt = `أنت وكيل خدمة العملاء والاستقبال لمنصة RAFIQ | رفيق للرعاية المنزلية في لبنان.
أجب مباشرة عن سؤال العميل ولا تستبدل الإجابة بقائمة عامة عن الخدمات.
الخدمات: رعاية المسنين، رعاية المرضى، التمريض المنزلي، العلاج الفيزيائي.
افهم اللهجات العربية والأخطاء الإملائية البسيطة، واستخدم سياق المحادثة ولا تكرر الأسئلة التي أُجيب عنها.
اسأل سؤالًا واحدًا ضروريًا في كل مرة، واحتفظ بالمعلومات التي يذكرها العميل.
لا تشخّص ولا تصف أدوية ولا تغيّر جرعات أو علاجًا ولا تستبدل الطبيب.
لا تخترع أسعارًا أو توفرًا أو موافقة أو تعيينًا أو ترخيصًا.
القرار النهائي في قبول مقدم الخدمة والمطابقة والسعر والتوفر للإدارة البشرية.
في الطوارئ وجّه فورًا إلى خدمات الطوارئ المحلية أو الفريق الطبي ولا تؤخر الرعاية.
عند اكتمال المعلومات، لخّص الطلب واذكر أن الإدارة ستراجعه وتؤكد التفاصيل.
لا تدّعِ أن الطلب أُرسل إلى الإدارة إلا إذا نجح حفظه فعليًا.`;

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

async function generateReply(message: string, context: ChatMessage[]): Promise<{ reply: string; mode: string }> {
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
  return { reply: fallback(message), mode: "guided" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: jsonHeaders });

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "invalid_json", reply: "تعذّر قراءة الطلب. أعد إرسال رسالتك." }, { status: 400, headers: jsonHeaders });
    }
    const rawMessage = typeof body.message === "string" ? body.message : "";
    const message = rawMessage.normalize("NFKC").trim();
    if (!message || message.length > 1500) {
      return Response.json({ error: "invalid_message", reply: "اكتب سؤالك بوضوح وبحد أقصى 1500 حرف." }, { status: 400, headers: jsonHeaders });
    }
    const channelRaw = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "web";
    const channel = ["web", "telegram", "whatsapp"].includes(channelRaw) ? channelRaw : "web";
    const externalIdRaw = body.conversation_id ?? body.external_conversation_id;
    const externalId = typeof externalIdRaw === "string" ? externalIdRaw.trim() : "";
    const conversationId = externalId || crypto.randomUUID();
    if (conversationId.length > 200) {
      return Response.json({ error: "invalid_conversation_id" }, { status: 400, headers: jsonHeaders });
    }
    const phone = typeof body.phone === "string" ? body.phone.slice(0, 40) : null;
    const language = typeof body.locale === "string" && body.locale.trim() ? body.locale.trim().slice(0, 12) : "ar";

    const existing = await getConversation(channel, conversationId);
    const context = (existing?.context ?? []).filter((x: any) =>
      x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string"
    ).slice(-10);
    const generated = await generateReply(message, context);
    const nextContext: ChatMessage[] = [
      ...context,
      { role: "user", content: message },
      { role: "assistant", content: generated.reply },
    ].slice(-12);

    const normalized = normalizeArabic(message);
    const emergency = /(طوارئ|اختناق|ضيق تنفس|الم صدر|نزيف شديد|فقدان وعي|جلطه|تشنج|سكتة)/.test(normalized);
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
    }, { headers: jsonHeaders });
  } catch (error) {
    console.error(JSON.stringify({ event: "rafiq_agent_error", error: String(error).slice(0, 240) }));
    return Response.json({
      error: "agent_processing_failed",
      reply: "تعذّر معالجة الطلب حاليًا. يمكنك إعادة المحاولة أو التواصل مع إدارة رفيق عبر WhatsApp على +961 81 506 299. لا توجد ردود WhatsApp تلقائية مفعّلة.",
    }, { status: 500, headers: jsonHeaders });
  }
});
