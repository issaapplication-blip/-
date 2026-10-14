import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const fallback = (message: string) => {
  const m = message.toLowerCase();
  if (/طوارئ|اختناق|ألم صدر|نزيف شديد|فقدان وعي|جلطة|تشنج/.test(m)) {
    return "إذا كانت هناك حالة طارئة أو خطر فوري، تواصل فورًا مع خدمات الطوارئ المحلية أو الطبيب/الفريق الطبي المعالج. لا تؤخر الرعاية العاجلة بانتظار RAFIQ.";
  }
  if (/سعر|تكلفة|كم/.test(m)) {
    return "أساعدك في ترتيب الطلب، لكن السعر النهائي يتحدد بعد معرفة المنطقة، عدد الساعات، نوع الخدمة، احتياجات الحالة وتوفر مقدم الخدمة.";
  }
  return "مرحبًا بك في RAFIQ | رفيق. أستطيع مساعدتك في رعاية المسنين والمرضى، التمريض المنزلي والعلاج الفيزيائي. اكتب المنطقة + العمر + الدوام المطلوب + احتياجات الحالة لنبدأ.";
};

async function getConversation(channel: string, externalId: string) {
  const { data } = await supabase
    .from("rafiq_conversations")
    .select("id,context,language,escalation_state")
    .eq("channel", channel)
    .eq("external_conversation_id", externalId)
    .maybeSingle();
  return data;
}

async function saveConversation(
  channel: string,
  externalId: string,
  phone: string | null,
  language: string | null,
  context: Array<{role:string;content:string}>,
  escalationState: string
) {
  await supabase.from("rafiq_conversations").upsert({
    channel,
    external_conversation_id: externalId,
    customer_phone: phone,
    language,
    context: context.slice(-12),
    escalation_state: escalationState,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "channel,external_conversation_id" });
}

async function createEscalation(conversationId: string | null, reason: string, payload: unknown) {
  await supabase.from("whatsapp_pending_approvals").insert({
    conversation_id: conversationId,
    reason,
    status: "open",
    payload
  });
}

async function callOpenAI(message: string, context: Array<{role:string;content:string}>) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const model = Deno.env.get("RAFIQ_AGENT_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";
  const system = `أنت وكيل خدمة العملاء والاستقبال لمنصة RAFIQ | رفيق للرعاية المنزلية في لبنان.
مهمتك فهم حاجة العميل، طرح السؤال التالي الضروري فقط، وتنظيم طلب الرعاية.
الخدمات: رعاية المسنين، رعاية المرضى، التمريض المنزلي، العلاج الفيزيائي.
لا تشخّص، لا تصف أدوية، لا تغيّر جرعات أو علاجًا، ولا تستبدل الطبيب.
لا تخترع أسعارًا أو توفرًا أو موافقة أو تعيينًا.
القرار النهائي في قبول مقدم الخدمة، المطابقة، السعر والتوفر للإدارة البشرية.
في الطوارئ وجّه فورًا إلى الطوارئ/الطبيب ولا تؤخر الرعاية.
استخدم العربية الواضحة والدافئة، واحتفظ بالسياق السابق ولا تكرر أسئلة أُجيب عنها.
عند اكتمال المعلومات: لخّص الطلب واذكر أن الإدارة ستراجعه وتؤكد التفاصيل.`;

  const input = [
    { role: "system", content: [{ type: "input_text", text: system }] },
    ...context.slice(-10).map(x => ({ role: x.role, content: [{ type: "input_text", text: x.content }] })),
    { role: "user", content: [{ type: "input_text", text: message.slice(0,1500) }] }
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input, max_output_tokens: 650 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload.output || []) for (const c of item.content || []) if (typeof c.text === "string") parts.push(c.text);
  return parts.join("\n").trim() || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: cors });

  try {
    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message || message.length > 1500) {
      return Response.json({ reply: "اكتب سؤالك بوضوح وبحد أقصى 1500 حرف." }, { status: 400, headers: cors });
    }

    const channel = String(body?.channel || "web");
    const externalId = String(body?.conversation_id || body?.external_conversation_id || crypto.randomUUID());
    const phone = typeof body?.phone === "string" ? body.phone : null;
    const language = typeof body?.locale === "string" ? body.locale : "ar";

    const existing = await getConversation(channel, externalId);
    const context = Array.isArray(existing?.context) ? existing.context : [];
    const reply = await callOpenAI(message, context) || fallback(message);

    const nextContext = [
      ...context,
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ].slice(-12);

    const needsHuman = /إدارة|موظف|بشري|طوارئ|موافقة|اعتماد|شكوى/.test(message);
    const escalationState = needsHuman ? "open" : (existing?.escalation_state || "none");

    await saveConversation(channel, externalId, phone, language, nextContext, escalationState);

    if (needsHuman) {
      await createEscalation(existing?.id || null, /طوارئ/.test(message) ? "medical_emergency" : "human_assistance", {
        channel, external_conversation_id: externalId, message
      });
    }

    return Response.json({
      reply,
      mode: Deno.env.get("OPENAI_API_KEY") ? "ai" : "guided",
      conversation_id: externalId,
      escalated: needsHuman
    }, { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("rafiq-agent error", String(error));
    return Response.json({
      reply: "تعذر معالجة الطلب حاليًا. يمكنك متابعة طلب الرعاية عبر المنصة أو WhatsApp RAFIQ."
    }, { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
