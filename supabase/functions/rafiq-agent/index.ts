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



function generateReply(message: string, language: string): { reply: string; mode: string; intent: string; matched: boolean } {
  const result = answerFromKnowledge(message, language);
  return { reply: result.reply, mode: "knowledge", intent: result.intent, matched: result.matched };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return originAllowed(req) ? new Response(null, { status: 204, headers: corsHeaders(req) }) : Response.json({ error: "origin_not_allowed" }, { status: 403 });
  if (!originAllowed(req)) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: jsonHeaders(req) });

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
    const preferredLanguage = typeof body.locale === "string" && body.locale.trim() ? body.locale.trim().slice(0, 12) : null;
    const knowledge = answerFromKnowledge(message, preferredLanguage);
    const language = knowledge.language;

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
    const emergency = knowledge.intent === "emergency";
    const needsHuman = emergency || !knowledge.matched || knowledge.intent === "complaint" || /(ادارة|موظف|بشري|موافقة|اعتماد|اريد شخص|اريد التحدث مع|كلموني|اتصلوا بي)/.test(normalized);
    const alreadyEscalated = existing?.escalation_state === "open";
    const escalationState = needsHuman ? "open" : (existing?.escalation_state || "none");
    const savedConversationId = await saveConversation(channel, conversationId, phone, language, nextContext, escalationState);

    if (needsHuman && !alreadyEscalated) {
      await createEscalation(savedConversationId, emergency ? "medical_emergency" : (!knowledge.matched ? "unknown_question" : "human_assistance"), {
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
