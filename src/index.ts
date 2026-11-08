import { applySecurityHeaders } from "./http-cache-policy";
import { classifyTelegramUpdateClaim, parseTelegramUpdateId } from "./telegram-update-dedup";
import { Elysia } from "elysia";
import { answerRafiqKnowledge } from "./rafiq-service-knowledge";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";
import { rafiqFallback } from "./rafiq-local-agent";
import { telegramConfigured, telegramGetWebhookInfo, telegramSendText, telegramSendPhoto, telegramAnswerCallbackQuery, telegramSetWebhook, telegramWebhookSecret, verifyTelegramWebhookSecret } from "./telegram";
import { sendMessage } from "./messaging-service";
import { RAFIQ_CONFIG } from "./rafiq-config";
import QRCode from "qrcode";
import { RAFIQ_TELEGRAM_BOT, RAFIQ_TELEGRAM_CHANNEL, RAFIQ_WEBSITE, RAFIQ_WHATSAPP, RAFIQ_WHATSAPP_CHANNEL, RAFIQ_WHATSAPP_NUMBER, rafiqRequiresHumanReply } from "./rafiq-service-knowledge";

const port = Number(process.env.PORT ?? 7860);
const startedAt = new Date().toISOString();
const effectiveAgentModel = () => {
  const provider = (process.env.RAFIQ_AGENT_PROVIDER ?? "gemini").trim().toLowerCase();
  if (provider === "gemini") return (process.env.RAFIQ_GEMINI_MODEL ?? "gemini-3.6-flash").trim();
  return (process.env.RAFIQ_AGENT_MODEL ?? "not-configured").trim() || "not-configured";
};
const CARE_KEYWORD_RE = /رعاية|مسن|رعاية منزلية|تمريض|\bkareh\b|\bnurse\b/i;
const CARE_SESSION_TTL_MS = 30 * 60 * 1000;
const careSessions = new Map<string, { updatedAt: number; messages: string[] }>();
const TELEGRAM_ANNOUNCEMENT_KEY = "rafig-family-launch-2026-10";
const TELEGRAM_ONBOARDING_KEY = "rafig-telegram-channel-bot-invite-2026-10";
const RAFIQ_TELEGRAM_INVITE = `${RAFIQ_TELEGRAM_BOT}?start=rafiq`;
const TELEGRAM_ONBOARDING_MESSAGE = [
  "👋 أهلًا بكم من رفيق | RAFIQ 🇱🇧",
  "يسرّنا أن نعرّفكم رسميًا بخدمة رفيق للرعاية المنزلية في لبنان.",
  "",
  "يمكنكم استخدام بوت رفيق للسؤال عن الخدمات أو كتابة طلبكم مباشرة:",
  "🤖 بوت رفيق: " + RAFIQ_TELEGRAM_BOT,
  "🔗 رابط الدعوة: " + RAFIQ_TELEGRAM_INVITE,
  "",
  "ولمتابعة الإعلانات والأخبار والتحديثات:",
  "📢 قناة رفيق: " + RAFIQ_TELEGRAM_CHANNEL,
  "",
  "إذا احتجتم إلى متابعة إدارية أو معلومات حساسة، يمكنكم التواصل مع إدارة رفيق عبر WhatsApp: +961 81 506 299",
  "",
  "— فريق رفيق | RAFIQ 🇱🇧"
].join("\n");
const RAFIQ_WHATSAPP_CHANNEL_URL = RAFIQ_WHATSAPP_CHANNEL;
const RAFIQ_TELEGRAM_SIGNATURE = "— فريق رفيق | RAFIQ 🇱🇧";
const telegramSigned = (body: string) => body.includes(RAFIQ_TELEGRAM_SIGNATURE) ? body : `${body}\n\n${RAFIQ_TELEGRAM_SIGNATURE}`;
const telegramLanguage = (message:any) => {
  const code=String(message?.from?.language_code??"").toLowerCase();
  if(code.startsWith("en")) return "en";
  if(code.startsWith("fr")) return "fr";
  if(code.startsWith("it")) return "it";
  if(code.startsWith("de")) return "de";
  const t=String(message?.text??"");
  if(/\b(hello|hi|what|how|services|request|help|contact)\b/i.test(t)) return "en";
  if(/[أ-ي]/.test(t)) return "ar";
  return "ar";
};
const TELEGRAM_BROADCAST_IMAGE = (process.env.TELEGRAM_BROADCAST_IMAGE_URL || `${RAFIQ_WEBSITE}/assets/rafig-logo.png`).trim();
const TELEGRAM_BROADCAST_BUTTON = {inline_keyboard:[[{text:"🌐 منصة RAFIQ",url:RAFIQ_WEBSITE}]]};
const sleep = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const isTelegramBlockedError=(error:any)=>{
  const s=String(error?.telegramDescription||error?.message||"").toLowerCase();
  return Number(error?.telegramStatus)===403 && /(blocked|deactivated|chat not found|forbidden|user is deactivated)/i.test(s);
};
const telegramBroadcastOne=async(recipientId:string,text:string)=>{
  for(let attempt=0;attempt<3;attempt++){
    try{
      return await telegramSendPhoto(recipientId,TELEGRAM_BROADCAST_IMAGE,text,TELEGRAM_BROADCAST_BUTTON);
    }catch(error:any){
      const retryAfter=Number(error?.retryAfter||0);
      if(retryAfter>0){ await sleep(Math.min(retryAfter*1000,10000)); continue; }
      if(Number(error?.telegramStatus)===429){ await sleep(Math.min(1000*(attempt+1),5000)); continue; }
      throw error;
    }
  }
  throw new Error("Telegram broadcast retry limit reached");
};
const telegramBroadcast=async(text:string,testOnly=false)=>{
  const announcementKey="manager-broadcast-"+Date.now();
  const rows=await supabaseServerRest("/rest/v1/rafiq_telegram_subscribers?is_subscribed=eq.true&select=chat_id");
  const subscribers=Array.isArray(rows.body)?rows.body.map((x:any)=>String(x.chat_id)).filter(Boolean):[];
  const targets=await supabaseServerRest("/rest/v1/rafiq_telegram_broadcast_targets?is_active=eq.true&select=chat_id,chat_type");
  const targetIds=Array.isArray(targets.body)?targets.body.map((x:any)=>String(x.chat_id)).filter(Boolean):[];
  const recipients=testOnly ? [String(parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS)[0]||"")].filter(Boolean) : Array.from(new Set([...subscribers,...targetIds]));
  let sent=0,failed=0,blocked=0;
  for(let i=0;i<recipients.length;i++){
    const recipientId=recipients[i];
    try{
      await telegramBroadcastOne(recipientId,text);
      sent++;
      await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?on_conflict=announcement_key%2Crecipient_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({announcement_key:announcementKey,recipient_id:recipientId,status:"sent",sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(()=>{});
    }catch(error:any){
      if(isTelegramBlockedError(error) && !targetIds.includes(recipientId)){
        blocked++;
        await supabaseServerRest("/rest/v1/rafiq_telegram_subscribers?chat_id=eq."+encodeURIComponent(recipientId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_subscribed:false,unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(()=>{});
      }else failed++;
      await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?on_conflict=announcement_key%2Crecipient_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({announcement_key:announcementKey,recipient_id:recipientId,status:"failed",error_message:String(error?.telegramDescription||error?.message||error).slice(0,500),updated_at:new Date().toISOString()})}).catch(()=>{});
    }
    await sleep(50);
  }
  return {sent,failed,blocked,targets:targetIds.length};
};

const forwardWhatsAppToTelegramManager=async(message:any,identity:any,body:string)=>{
  if(process.env.RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING!=="true")return;
  const managerChatIds=parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS);
  if(!managerChatIds.length){console.warn(JSON.stringify({event:"rafig_whatsapp_to_telegram_no_manager_ids"}));return;}
  const messageType=typeof message?.type==="string"?message.type:"text";
  const notice=telegramSigned(["📲 رسالة WhatsApp واردة إلى RAFIQ","","👤 رقم العميل: "+(identity.phone||"غير متوفر"),"💬 نوع الرسالة: "+messageType,"💬 الرسالة:",body||"[رسالة غير نصية]","","🟡 الحالة: بانتظار متابعة المدير","⚠️ لا يوجد رد تلقائي على WhatsApp حاليًا.","يمكن للمدير نسخ الرد المناسب وإرساله يدويًا عبر WhatsApp."].join("\n"));
  for(const managerId of managerChatIds){await telegramSendText(managerId,notice).catch(error=>console.error(JSON.stringify({event:"rafig_whatsapp_to_telegram_send_failed",managerId,error:String(error).slice(0,240)})));}
};
const TELEGRAM_WELCOME = [
  "أهلًا وسهلًا بك في رفيق | RAFIQ 🇱🇧",
  "أنا مساعد رفيق للرعاية المنزلية. يمكنك أن تسألني عن خدمات رفيق أو تكتب طلبك كما تتحدث مع فريقنا.",
  "",
  "👴 رعاية كبار السن\n🏠 رعاية المرضى\n👩‍⚕️ التمريض المنزلي\n🦿 العلاج الفيزيائي المنزلي",
  "",
  "📢 قناة رفيق: " + RAFIQ_TELEGRAM_CHANNEL,
  "🤖 رابط دعوة البوت: " + RAFIQ_TELEGRAM_INVITE,
  "📱 عند الحاجة إلى متابعة إدارية أو معلومات حساسة: WhatsApp +961 81 506 299"
].join("\n");
const TELEGRAM_ANNOUNCEMENT_CUTOFF = "2026-10-05T00:00:00.000Z";
const TELEGRAM_ANNOUNCEMENT = [
  "📣 خبر رفيق | RAFIQ 🇱🇧",
  "نطلق اليوم قناة تواصل مباشرة لمساعدة الأهل في الوصول إلى الرعاية المنزلية بشكل أوضح وأسهل.",
  "",
  "يمكن لرفيق مساعدتكم في:",
  "👴 رعاية كبار السن",
  "🏠 رعاية المرضى داخل المنزل",
  "👩‍⚕️ التمريض المنزلي",
  "🦿 العلاج الفيزيائي المنزلي",
  "",
  "هدفنا أن يكتب الأهل أسئلتهم بكلماتهم الطبيعية، فيجيبهم وكيل رفيق عن المعلومات العامة خطوة بخطوة، وعندما تصبح الحالة بحاجة إلى قرار أو معلومات حساسة تُحال إلى فريق رفيق عبر WhatsApp.",
  "",
  "🤖 بوت Telegram: @RAFIQ_Care_Bot",
  "📢 قناة Telegram: " + RAFIQ_TELEGRAM_CHANNEL,
  "🌐 الموقع: " + RAFIQ_WEBSITE,
  "📱 WhatsApp الرسمي: " + RAFIQ_WHATSAPP_NUMBER + " — " + RAFIQ_WHATSAPP
].join("\n");
const draftInboundReply = async (message: string, senderPhone?: string) => {
  const key = senderPhone?.trim() || "unknown";
  const now = Date.now();
  const previous = careSessions.get(key);
  const active = Boolean(previous && now - previous.updatedAt < CARE_SESSION_TTL_MS);
  const careMode = CARE_KEYWORD_RE.test(message) || active;
  const messages = [...(previous?.messages ?? []), message].slice(-8);
  if (careMode) careSessions.set(key, { updatedAt: now, messages });
  const context = careMode ? [
    "ACTIVE RAFIQ CARE INTAKE: true",
    senderPhone ? `WhatsApp sender number (known contact, confirm it with the customer): ${senderPhone}` : "WhatsApp sender number unavailable.",
    "Recent intake conversation:",
    ...messages.map((item, index) => `${index + 1}. ${item}`),
  ].join("\n") : undefined;
  try {
    return await draftAgentReply(message, undefined, context);
  } catch (error) {
    console.error(JSON.stringify({event:"rafig_agent_provider_failed",reason:String(error).slice(0,160)}));
    return {reply:rafiqFallback(message),model:"rafig-local-fallback"};
  }
};
const MAX_WEBHOOK_BODY = 512_000;
const securityHeaders = {"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: https://images.pexels.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://qmuxaehrahfsnabyjens.supabase.co "};
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "https://qmuxaehrahfsnabyjens.supabase.co").trim().replace(/\/+$/,"");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "").trim();
const supabaseServerRest=async(path:string,init:RequestInit={})=>{
  if(!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration is incomplete");
  const headers=new Headers(init.headers);
  headers.set("apikey",SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Content-Type","application/json");
  headers.set("Authorization","Bearer "+SUPABASE_SERVICE_ROLE_KEY);
  const response=await fetch(SUPABASE_URL+path,{...init,headers});
  const body=await response.json().catch(()=>null);
  return {response,body};
};
const recordInboundEvent=async(message:any,identity:any,provider="kapso")=>{
  const providerMessageId=String(message?.id??"").trim();
  if(!providerMessageId)return null;
  const prevRow=await supabaseServerRest("/rest/v1/whatsapp_inbound_events?provider_message_id=eq."+encodeURIComponent(providerMessageId)+"&select=id,provider,processing_status&order=received_at.desc&limit=1");
  const prev=Array.isArray(prevRow.body)?prevRow.body[0]:null;
  if(prev)return{...prev,duplicate:true};
  const textBody=typeof message?.text?.body==="string"
    ? message.text.body.trim()
    : (typeof message?.kapso?.content==="string"?message.kapso.content.trim():null);
  const r=await supabaseServerRest("/rest/v1/whatsapp_inbound_events?on_conflict=provider%2Cprovider_message_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({
    provider,provider_message_id:providerMessageId,from_phone:identity.phone||null,
    message_type:typeof message?.type==="string"?message.type:"text",text_body:textBody||null,payload:message??{},processing_status:"processing"
  })});
  if(!r.response.ok){const detail=typeof r.body==="string"?r.body:JSON.stringify(r.body??{});throw new Error(`could not persist inbound WhatsApp event (${r.response.status}): ${detail.slice(0,700)}`);}
  return Array.isArray(r.body)?r.body[0]:r.body;
};
const updateInboundEvent=async(providerMessageId:string,status:string,errorMessage?:string,provider="kapso")=>{
  if(!SUPABASE_SERVICE_ROLE_KEY||!providerMessageId)return;
  await supabaseServerRest("/rest/v1/whatsapp_inbound_events?provider=eq."+encodeURIComponent(provider)+"&provider_message_id=eq."+encodeURIComponent(providerMessageId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({processing_status:status,error_message:errorMessage??null,processed_at:new Date().toISOString()})});
};
const recordOutboundMessage=async(toPhone:string,body:string,result:any)=>{
  if(!SUPABASE_SERVICE_ROLE_KEY)return;
  await supabaseServerRest("/rest/v1/whatsapp_outbound_messages",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({provider:"kapso",provider_message_id:result?.messages?.[0]?.id??null,to_phone:toPhone,body,status:"sent",payload:result??{}})});
};

const bearerToken=(request:Request)=>{const h=request.headers.get("authorization")??"";return h.startsWith("Bearer ")?h.slice(7).trim():""};
const supabaseRest=async(path:string,token:string,init:RequestInit={})=>{
  const response=await fetch(SUPABASE_URL+path,{...init,headers:{
    apikey:SUPABASE_PUBLISHABLE_KEY,
    Authorization:"Bearer "+token,
    "Content-Type":"application/json",
    ...(init.headers??{})
  }});
  const body=await response.json().catch(()=>null);
  return {response,body};
};
const requireAdminToken=(request:Request)=>Boolean(process.env.RAFIQ_ADMIN_ACTION_TOKEN&&request.headers.get("x-rafig-admin-token")===process.env.RAFIQ_ADMIN_ACTION_TOKEN);
const PUBLIC_I18N_EXCLUDED = new Set(["public/admin.html","public/dashboard.html","public/barcode.html","public/member.html"]); const RAFIQ_LOGO_STYLE='<style id="rafig-logo-quality">.brand img,.brand-mini img,.hero-logo,.logo,.brand-logo{background:#fff!important;object-fit:contain!important;image-rendering:auto!important;filter:none!important}.brand img,.brand-mini img,.logo,.brand-logo{border-radius:14px!important;padding:6px!important;box-sizing:border-box!important}.hero-logo{display:block;background:#fff!important;border-radius:18px!important;padding:10px!important;box-shadow:0 5px 18px rgba(0,0,0,.08)!important}</style>'; const FILE_CACHE_MAX_BYTES=16*1024*1024; const fileCache=new Map<string,{body:Uint8Array,type:string}>(); let fileCacheBytes=0;
const fileResponse=async(path:string,type:string,cache="no-store")=>{const cached=fileCache.get(path+"|"+type);if(cached)return new Response(cached.body,{status:200,headers:{"Content-Type":type,"Content-Length":String(cached.body.byteLength),"Cache-Control":cache}});const file=Bun.file(path);if(!(await file.exists()))return new Response("Not Found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});let body:any=await file.arrayBuffer();if(type.startsWith("text/html")&&!PUBLIC_I18N_EXCLUDED.has(path)){let html=new TextDecoder().decode(body);if(type.startsWith("text/html")&&!html.includes("id=\"rafig-logo-quality\"")){html=html.includes("</head>")?html.replace("</head>",RAFIQ_LOGO_STYLE+"</head>"):RAFIQ_LOGO_STYLE+html;}if(!html.includes("/css/device.css")){const marker="</head>";const tag='<link rel="stylesheet" href="/css/device.css?v=72">';html=html.includes(marker)?html.replace(marker,tag+marker):tag+html;}if(!html.includes("/i18n.js")){const marker="</body>";const tag='<script src="/i18n.js?v=3" defer></script>';html=html.includes(marker)?html.replace(marker,tag+marker):html+tag;}body=html;}const bytes=typeof body==="string"?new TextEncoder().encode(body):new Uint8Array(body);if(bytes.byteLength<=FILE_CACHE_MAX_BYTES){const key=path+"|"+type;while(fileCacheBytes+bytes.byteLength>FILE_CACHE_MAX_BYTES&&fileCache.size){const first=fileCache.keys().next().value;if(first){const oldEntry=fileCache.get(first);fileCache.delete(first);fileCacheBytes-=oldEntry?.body.byteLength||0}else break}const stored=new Uint8Array(bytes);fileCache.set(key,{body:stored,type});fileCacheBytes+=stored.byteLength;}return new Response(bytes,{status:200,headers:{"Content-Type":type,"Content-Length":String(bytes.byteLength),"Cache-Control":cache}})};
const broadcastTelegramAnnouncement = async (announcementKey: string, body: string, cutoffIso?: string) => {
  if (!telegramConfigured()) throw new Error("Telegram bot is not configured");
  const cutoff = cutoffIso ? `&created_at=lt.${encodeURIComponent(cutoffIso)}` : "";
  const list = await supabaseServerRest("/rest/v1/rafiq_conversations?channel=eq.telegram&external_conversation_id=not.is.null&select=external_conversation_id"+cutoff);
  if (!list.response.ok) throw new Error("could not load Telegram conversations");
  const rawTargets = Array.isArray(list.body) ? list.body : [];
  const targets = [...new Set(rawTargets.map((row:any)=>String(row?.external_conversation_id??"").trim()).filter(Boolean))];
  let sent = 0, skipped = 0, failed = 0;
  for (const recipientId of targets) {
    const existing = await supabaseServerRest(
      "/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(announcementKey)+"&recipient_id=eq."+encodeURIComponent(recipientId)+"&select=status&limit=1"
    );
    const previous = Array.isArray(existing.body) ? existing.body[0] : null;
    if (previous?.status === "sent") { skipped++; continue; }
    await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?on_conflict=announcement_key%2Crecipient_id", {
      method: "POST",
      headers: {"Prefer":"resolution=merge-duplicates,return=minimal"},
      body: JSON.stringify({announcement_key:announcementKey,recipient_id:recipientId,status:"pending",error_message:null})
    });
    try {
      const outbound = await telegramSendText(recipientId, body);
      const messageId = outbound?.result?.message_id ?? null;
      await supabaseServerRest(
        "/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(announcementKey)+"&recipient_id=eq."+encodeURIComponent(recipientId),
        {method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"sent",provider_message_id:messageId,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),error_message:null})}
      );
      sent++;
    } catch (error) {
      await supabaseServerRest(
        "/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(announcementKey)+"&recipient_id=eq."+encodeURIComponent(recipientId),
        {method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"failed",error_message:String(error).slice(0,500),updated_at:new Date().toISOString()})}
      ).catch(()=>{});
      failed++;
    }
  }
  return {announcementKey, targets:targets.length, sent, skipped, failed};
};
const telegramCommandReply = (command: string, language="ar") => {
  const translations:any={
    ar:{
      start:"أهلًا بك في رفيق | RAFIQ 🇱🇧\\nأنا مساعد رفيق للرعاية المنزلية. يمكنك السؤال عن الخدمات أو بدء طلب.\\n\\n/services للخدمات\\n/request لطلب رعاية\\n/help للمساعدة\\n/contact للتواصل",
      services:"خدمات رفيق: رعاية كبار السن، رعاية المرضى داخل المنزل، التمريض المنزلي، والعلاج الفيزيائي المنزلي.",
      request:"سنبدأ طلبك خطوة بخطوة. اختر الخدمة أو اكتب تفاصيل حاجتك.",
      help:"أهلًا بك 🌿 يمكنك كتابة طلبك مباشرة، مثل: أحتاج ممرضة لوالدتي، أو أريد رعاية لكبير سن. سأساعدك خطوة بخطوة في اختيار الخدمة والمنطقة والتفاصيل.\n\nللبدء اضغط /request، ولعرض الخدمات اضغط /services. القرارات الإدارية والمعلومات الحساسة يتابعها فريق رفيق.",
      contact:"للتواصل مع إدارة رفيق: +961 81 506 299"
    },
    en:{
      start:"Welcome to RAFIQ | رفيق 🇱🇧\\nI am RAFIQ's home-care assistant. Ask about our services or start a request.\\n\\n/services Services\\n/request Care request\\n/help Help\\n/contact Contact",
      services:"RAFIQ services: elderly care, in-home patient care, home nursing, and home physiotherapy.",
      request:"We will build your care request step by step. Choose a service or describe what you need.",
      help:"Ask your question naturally. If it requires an administrative decision or sensitive information, the RAFIQ team will handle it.",
      contact:"RAFIQ administration: +961 81 506 299"
    },
    fr:{
      start:"Bienvenue chez RAFIQ | رفيق 🇱🇧\\nJe suis l’assistant de soins à domicile de RAFIQ. Demandez nos services ou commencez une demande.",
      services:"Services RAFIQ : soins aux personnes âgées, soins à domicile des patients, soins infirmiers à domicile et physiothérapie à domicile.",
      request:"Nous allons construire votre demande étape par étape. Choisissez un service ou décrivez votre besoin.",
      help:"Posez votre question naturellement. Les décisions administratives et informations sensibles sont traitées par l’équipe RAFIQ.",
      contact:"Administration RAFIQ : +961 81 506 299"
    },
    it:{
      start:"Benvenuto in RAFIQ | رفيق 🇱🇧\\nSono l’assistente per l’assistenza domiciliare RAFIQ. Chiedi dei servizi o avvia una richiesta.",
      services:"Servizi RAFIQ: assistenza agli anziani, assistenza domiciliare ai pazienti, infermieristica domiciliare e fisioterapia domiciliare.",
      request:"Costruiremo la richiesta passo dopo passo. Scegli un servizio o descrivi ciò di cui hai bisogno.",
      help:"Fai la tua domanda naturalmente. Le decisioni amministrative e le informazioni sensibili vengono gestite dal team RAFIQ.",
      contact:"Amministrazione RAFIQ: +961 81 506 299"
    },
    de:{
      start:"Willkommen bei RAFIQ | رفيق 🇱🇧\\nIch bin der Assistent für häusliche Pflege von RAFIQ. Fragen Sie nach unseren Leistungen oder starten Sie eine Anfrage.",
      services:"RAFIQ-Leistungen: Seniorenbetreuung, häusliche Patientenbetreuung, häusliche Krankenpflege und Physiotherapie zu Hause.",
      request:"Wir erstellen Ihre Pflegeanfrage Schritt für Schritt. Wählen Sie einen Service oder beschreiben Sie Ihren Bedarf.",
      help:"Stellen Sie Ihre Frage natürlich. Administrative Entscheidungen und sensible Informationen werden vom RAFIQ-Team bearbeitet.",
      contact:"RAFIQ-Verwaltung: +961 81 506 299"
    }
  };
  const tr=translations[language]||translations.ar;
  const c = command.trim().toLowerCase().split(" ")[0];
  if (c === "/start") return tr.start;
  if (c === "/services") return tr.services;
  if (c === "/request") return tr.request;
  if (c === "/help") return tr.help;
  if (c === "/contact") return tr.contact;
  if (c === "/cv") return cvMenuText();
  return "";
};
const TELEGRAM_MARKETING_TARGET = () => String(process.env.TELEGRAM_MARKETING_CHAT_ID || "").trim();
const TELEGRAM_MARKETING_ADS = [
  "🌿 RAFIQ | رفيق\\n\\nرعاية كبار السن والمرضى تبدأ بخطوة صحيحة.\\nنقدّم خدمات رعاية كبار السن، رعاية المرضى داخل المنزل، التمريض المنزلي، والعلاج الفيزيائي المنزلي.\\n\\n💚 انضموا إلى مجتمع رفيق وتابعوا خدماتنا ومستجداتنا.\\n👉 https://t.me/+a7CDblNyGkw1Yjg8",
  "💚 عندما تحتاج عائلتك إلى رعاية منزلية، رفيق معكم بخطوات واضحة ومنظمة.\\n\\n👴 كبار السن\\n🏠 المرضى\\n👩‍⚕️ التمريض المنزلي\\n🦿 العلاج الفيزيائي المنزلي\\n\\nانضموا إلى مجتمع رفيق: https://t.me/+a7CDblNyGkw1Yjg8",
  "🌱 رعاية أفضل تبدأ بمعلومة صحيحة واختيار مسار الخدمة المناسب.\\n\\nRAFIQ | رفيق ينظم طلبات الرعاية المنزلية ويتابعها وفق إجراءات المنصة.\\n\\n📲 انضموا: https://t.me/+a7CDblNyGkw1Yjg8",
  "🤝 رفيق معكم خطوة بخطوة: من السؤال، إلى تحديد الخدمة المطلوبة، إلى متابعة الطلب وفق مسار المراجعة.\\n\\nللانضمام إلى مجتمع RAFIQ: https://t.me/+a7CDblNyGkw1Yjg8",
  "📢 مجتمع RAFIQ يكبر بكم.\\n\\nتابعوا الإعلانات والتحديثات المتعلقة بالرعاية المنزلية وشاركونا مع من يحتاج إلى هذه الخدمات.\\n\\n👉 https://t.me/+a7CDblNyGkw1Yjg8",
  "📌 ماذا يقدم رفيق؟\\n\\n👴 رعاية كبار السن\\n🏠 رعاية المرضى داخل المنزل\\n👩‍⚕️ التمريض المنزلي\\n🦿 العلاج الفيزيائي المنزلي\\n\\nللمتابعة والانضمام: https://t.me/+a7CDblNyGkw1Yjg8",
  "👩‍⚕️ لمقدمي الخدمات الصحية والرعاية المنزلية: رفيق يتيح استقبال طلبات الانتساب ومراجعة الملفات ضمن مسار منظم.\\n\\nممرض/ة، مقدم/ة رعاية، أو معالج/ة فيزيائي/ة؟ تابعوا RAFIQ: https://t.me/+a7CDblNyGkw1Yjg8",
  "🏠 للعائلات: لا تبقوا وحدكم أمام احتياجات الرعاية المنزلية.\\n\\nاكتبوا طلبكم بوضوح ليتم التعامل معه وفق الخدمة المطلوبة ومسار المراجعة المناسب.\\n\\n💚 انضموا: https://t.me/+a7CDblNyGkw1Yjg8",
  "🩺 للممرضين ومقدمي الرعاية والمعالجين الفيزيائيين: إذا كنتم ترغبون بالانضمام إلى شبكة رفيق، تابعوا خطوات الانتساب الرسمية.\\n\\n👉 https://t.me/+a7CDblNyGkw1Yjg8",
  "🌟 RAFIQ منصة تجمع العائلات وطلبات الرعاية المنزلية ومقدمي الخدمات ضمن مسار منظم.\\n\\nتابعوا المجتمع لتصلكم الإعلانات والتحديثات الجديدة.\\n\\n📲 https://t.me/+a7CDblNyGkw1Yjg8",
  "🚀 هل تريد الانضمام كمقدم رعاية؟\\n\\nابدأ بالتعرّف إلى رفيق وخدماته، ثم تابع إجراءات الانتساب الرسمية عبر المنصة.\\n\\n👉 https://t.me/+a7CDblNyGkw1Yjg8",
  "👩‍⚕️ ممرض/ة؟ 🦿 معالج/ة فيزيائي/ة؟ 🤝 مقدم/ة رعاية؟\\n\\nرفيق يرحب بطلبات الانتساب ويعمل على مراجعة الملفات وفق الإجراءات المعتمدة.\\n\\nابدأ من هنا: https://t.me/+a7CDblNyGkw1Yjg8",
  "💚 تحتاج عائلتكم إلى رعاية منزلية؟\\n\\nتعرّفوا إلى خدمات رفيق وابدؤوا طلبكم بالمعلومات الأساسية ليتم توجيهكم إلى المسار المناسب.\\n\\n📲 https://t.me/+a7CDblNyGkw1Yjg8",
  "🔔 خطوة واحدة قد تكون بداية الطريق المناسب للرعاية.\\n\\nتابعوا RAFIQ | رفيق لمعرفة الخدمات وتقديم الطلبات ومتابعة الإعلانات الجديدة.\\n\\n👉 https://t.me/+a7CDblNyGkw1Yjg8",
  "🇱🇧 دعوة لكل من يهتم بالرعاية المنزلية في لبنان: عائلات، ممرضون، مقدمو رعاية، ومعالجون فيزيائيون.\\n\\nكونوا جزءًا من مجتمع RAFIQ.\\n\\n💚 https://t.me/+a7CDblNyGkw1Yjg8"
];
let lastTelegramMarketingSlot = "";
const supabaseBroadcastPending=async(key:string,recipientId:string)=>supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?on_conflict=announcement_key%2Crecipient_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({announcement_key:key,recipient_id:recipientId,status:"pending",error_message:null})});
const telegramMarketingTick = async () => {
  if(process.env.TELEGRAM_MARKETING_ENABLED !== "true" || !telegramConfigured()) return;
  const target = TELEGRAM_MARKETING_TARGET();
  const discovered=await supabaseServerRest("/rest/v1/rafiq_telegram_broadcast_targets?is_active=eq.true&select=chat_id");
  const targets=Array.from(new Set([
    ...(target?[target]:[]),
    ...(Array.isArray(discovered.body)?discovered.body.map((x:any)=>String(x.chat_id)).filter(Boolean):[])
  ]));
  if(!targets.length) return;
  const now = new Date();
  const utcMonth=now.getUTCMonth()+1;
  const utcYear=now.getUTCFullYear();
  const utcDate=now.getUTCDate();
  const lastSunday=(year:number,month:number)=>{ const d=new Date(Date.UTC(year,month,0)); return d.getUTCDate()-d.getUTCDay(); };
  const dstStart=new Date(Date.UTC(utcYear,2,lastSunday(utcYear,3),1,0,0));
  const dstEnd=new Date(Date.UTC(utcYear,9,lastSunday(utcYear,10),1,0,0));
  const beirutOffsetHours=(now>=dstStart && now<dstEnd)?3:2;
  const beirutNow=new Date(now.getTime()+beirutOffsetHours*60*60*1000);
  const get=(type:string)=>type==="year"?String(beirutNow.getUTCFullYear()):type==="month"?String(beirutNow.getUTCMonth()+1).padStart(2,"0"):type==="day"?String(beirutNow.getUTCDate()).padStart(2,"0"):type==="hour"?String(beirutNow.getUTCHours()).padStart(2,"0"):String(beirutNow.getUTCMinutes()).padStart(2,"0");
  const date=get("year")+"-"+get("month")+"-"+get("day");
  const minute=get("hour")+":"+get("minute");
  if(minute!=="11:00" && minute!=="19:00") return;
  const slot=date+"T"+minute;
  if(lastTelegramMarketingSlot===slot) return;
  const baseDate=Date.UTC(2026,9,8);
  const dayIndex=Math.max(0,Math.floor((Date.UTC(Number(get("year")),Number(get("month"))-1,Number(get("day")))-baseDate)/86400000));
  const slotIndex=minute==="11:00"?0:1;
  const adIndex=(dayIndex*2+slotIndex)%TELEGRAM_MARKETING_ADS.length;
  const key="rafig-marketing-"+slot;
  try{
    let sentTargets=0;
    for(const targetId of targets){
      try{
        const existing=await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(key)+"&recipient_id=eq."+encodeURIComponent(targetId)+"&select=status&limit=1");
        const previous=Array.isArray(existing.body)?existing.body[0]:null;
        if(previous?.status==="sent") continue;
        await supabaseBroadcastPending(key,targetId);
        const outbound=await telegramBroadcastOne(targetId,TELEGRAM_MARKETING_ADS[adIndex]);
        const messageId=outbound?.result?.message_id??null;
        await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(key)+"&recipient_id=eq."+encodeURIComponent(targetId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"sent",provider_message_id:messageId,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),error_message:null})});
        sentTargets++;
      }catch(error:any){
        await supabaseServerRest("/rest/v1/rafiq_telegram_broadcasts?announcement_key=eq."+encodeURIComponent(key)+"&recipient_id=eq."+encodeURIComponent(targetId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"failed",error_message:String(error?.telegramDescription||error?.message||error).slice(0,500),updated_at:new Date().toISOString()})}).catch(()=>{});
        console.error(JSON.stringify({event:"rafig_telegram_marketing_target_failed",slot,adIndex,target:targetId,error:String(error).slice(0,300)}));
      }
      await sleep(50);
    }
    lastTelegramMarketingSlot=slot;
    console.log(JSON.stringify({event:"rafig_telegram_marketing_sent",slot,adIndex,targets:targets.length,sentTargets}));
  }catch(error){console.error(JSON.stringify({event:"rafig_telegram_marketing_failed",slot,adIndex,target,error:String(error).slice(0,300)}));}
};

const registerTelegramWebhookOnStartup = async () => {
  // Do not let a resumed legacy Render service overwrite the Supabase Edge webhook.
  // Re-register only after an explicit, deliberate environment opt-in.
  if (process.env.RAFIQ_TELEGRAM_AUTO_REGISTER_WEBHOOK !== "true") {
    console.log(JSON.stringify({event:"rafig_telegram_auto_registration_disabled"}));
    return;
  }
  if (!telegramConfigured()) return;
  let base=(process.env.PUBLIC_BASE_URL??"").trim(); while(base.endsWith("/")) base=base.slice(0,-1);
  if (!base || !base.startsWith("https://")) {
    console.error(JSON.stringify({event:"rafig_telegram_webhook_registration_skipped",reason:"PUBLIC_BASE_URL must be set to the intended HTTPS origin"}));
    return;
  }
  const secret=telegramWebhookSecret();
  if (secret.length < 32) {
    console.error(JSON.stringify({event:"rafig_telegram_webhook_registration_skipped",reason:"TELEGRAM_WEBHOOK_SECRET must be at least 32 characters"}));
    return;
  }
  try {
    await telegramSetWebhook(base+"/api/telegram/webhook",secret);
    console.log(JSON.stringify({event:"rafig_telegram_webhook_registered",url:base+"/api/telegram/webhook"}));
  } catch (error) {
    console.error(JSON.stringify({event:"rafig_telegram_webhook_registration_failed",error:String(error).slice(0,200)}));
  }
};
const requireSupabaseAdmin = async (request:Request) => {
  const token=bearerToken(request);
  if(!token)return null;
  const me=await supabaseRest("/auth/v1/user",token,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY}});
  if(!me.response.ok||!me.body?.id)return null;
  const prof=await supabaseRest("/rest/v1/profiles?id=eq."+encodeURIComponent(me.body.id)+"&select=id,role,status&limit=1",token);
  const profile=Array.isArray(prof.body)?prof.body[0]:null;
  if(!prof.response.ok||profile?.role!=="admin"||profile?.status!=="active")return null;
  return {token,userId:me.body.id};
};


const app=new Elysia()
.onAfterHandle(({response})=>{if(response instanceof Response)applySecurityHeaders(response,securityHeaders)})
.get("/health",()=>({status:"ok",service:"rafiq-backend",timestamp:new Date().toISOString()}))
.get("/api/admin/telegram-cv/orders",({set})=>{set.status=410;return{ok:false,error:"CV submission service is retired."}})
.post("/api/admin/telegram-cv/confirm-payment",({set})=>{set.status=410;return{ok:false,error:"CV submission service is retired."}})
.post("/api/admin/telegram-cv/reject-payment",({set})=>{set.status=410;return{ok:false,error:"CV submission service is retired."}})
.post("/api/admin/telegram-cv/deliver",({set})=>{set.status=410;return{ok:false,error:"CV submission service is retired."}})
.get("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.post("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.post("/api/kapso/webhook",({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired."}})
.get("/api/webhooks/webhook/:webhookId",({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired."}})
.post("/api/webhooks/webhook/:webhookId",({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired."}});

const claimTelegramUpdate = async (updateId:number) => {
  const result = await supabaseServerRest("/rest/v1/rpc/claim_telegram_update", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({p_update_id:updateId,p_lease_seconds:120}),
  });
  if (!result.response.ok) throw new Error("telegram_update_claim_failed:"+result.response.status);
  return result.body;
};
const finishTelegramUpdate = async (updateId:number,status:"completed"|"failed",errorMessage?:string) => {
  const now = new Date().toISOString();
  const result = await supabaseServerRest("/rest/v1/telegram_update_receipts?update_id=eq."+String(updateId), {
    method:"PATCH",
    headers:{"Prefer":"return=minimal"},
    body:JSON.stringify({
      status,
      last_error:status==="failed"?(errorMessage||"Telegram update processing failed").slice(0,500):null,
      lease_until:null,
      completed_at:status==="completed"?now:null,
      updated_at:now,
    }),
  });
  if (!result.response.ok) throw new Error("telegram_update_finish_failed:"+result.response.status);
};
const handleTelegramWebhook = async({request,set}:any)=>{
  if(!telegramConfigured()){set.status=503;return{ok:false,error:"Telegram bot is not configured"}}
  if(!verifyTelegramWebhookSecret(request)){set.status=401;return{ok:false,error:"invalid Telegram webhook secret"}}
  const update=await request.json().catch(()=>null) as any;
  if(!update){set.status=400;return{ok:false,error:"invalid Telegram update"}}
  const chatId=update?.message?.chat?.id??update?.callback_query?.message?.chat?.id;
  const chatType=update?.message?.chat?.type??update?.callback_query?.message?.chat?.type;
  if(chatId===undefined||chatType!=="private")return{ok:true,status:"ignored_non_private"};
  const callback=update?.callback_query;
  if(callback?.id)await telegramAnswerCallbackQuery(String(callback.id)).catch(()=>{});
  const rawText=String(update?.message?.text??"").trim();
  const data=String(callback?.data??"");
  const categories=[
    ["🧪 المختبرات الطبية","labs"],
    ["🩻 مراكز الأشعة والتصوير","imaging"],
    ["🧑‍🦽 مراكز العلاج الفيزيائي","physio"],
    ["🦽 بيع المعدات الطبية","equipment_sale"],
    ["🦽 تأجير المعدات الطبية","equipment_rent"],
  ];
  const areas=["طرابلس","الضنية","زغرتا","الكورة","البترون","بيروت","باقي لبنان"];
  const menu={inline_keyboard:[
    [{text:categories[0][0],callback_data:"dir:labs"},{text:categories[1][0],callback_data:"dir:imaging"}],
    [{text:categories[2][0],callback_data:"dir:physio"}],
    [{text:categories[3][0],callback_data:"dir:equipment_sale"},{text:categories[4][0],callback_data:"dir:equipment_rent"}],
    [{text:"📍 المناطق",callback_data:"dir:areas"}]
  ]};
  if(data==="dir:areas"){
    await telegramSendText(chatId,telegramSigned("مناطق دليل RAFIQ:\\n"+areas.map(x=>"• "+x).join("\\n")+"\\n\\nتظهر المراكز بعد اعتمادها من الإدارة."));
    return{ok:true,status:"directory_areas"};
  }
  if(data.startsWith("dir:")){
    const selected=categories.find(x=>x[1]===data.slice(4));
    if(selected)await telegramSendText(chatId,telegramSigned("الفئة: "+selected[0]+"\\n\\nسيتم عرض المراكز بعد مراجعتها واعتمادها من إدارة RAFIQ. لا يوجد خصم أو كود مؤكد قبل موافقة الإدارة."));
    return{ok:true,status:"directory_category"};
  }
  const command=rawText.toLowerCase().split(/\\s+/)[0];
  if(command==="/start"||command==="/help"||command==="/services"||command==="/directory"){
    await telegramSendText(chatId,telegramSigned("أهلًا بك في RAFIQ | رفيق 🇱🇧\\nنصل بالحب والأمان لرعاية العائلة.\\n\\nدليل المراكز: المختبرات الطبية، الأشعة والتصوير، العلاج الفيزيائي، بيع المعدات الطبية وتأجيرها.\\n\\nلا يستقبل البوت طلبات تقديم أو ملفات. لا تُنشر المراكز أو الخصومات إلا بعد موافقة الإدارة."),menu);
    return{ok:true,status:"directory_menu"};
  }
  if(command==="/areas"){
    await telegramSendText(chatId,telegramSigned("مناطق الدليل:\\n"+areas.map(x=>"• "+x).join("\\n")));
    return{ok:true,status:"directory_areas"};
  }
  if(["/request","/stop","/apply","/register","/join"].includes(command)){
    await telegramSendText(chatId,telegramSigned("تم إيقاف التسجيل والتقديم واستقبال الطلبات عبر البوت. استخدم /services لتصفح فئات دليل RAFIQ أو /areas لعرض المناطق."));
    return{ok:true,status:"legacy_intake_disabled"};
  }
  if(!rawText)return{ok:true,status:"ignored_non_text"};
  const answer=answerRafiqKnowledge(rawText)||"اختر فئة الخدمة أو المنطقة من القائمة. لا تُعرض المراكز والخصومات إلا بعد اعتماد الإدارة.";
  await telegramSendText(chatId,telegramSigned(answer),menu);
  return{ok:true,status:"directory_reply"};
};
app.post("/api/telegram/webhook",async({request,set})=>{
  if(!telegramConfigured()){set.status=503;return{ok:false,error:"Telegram bot is not configured"}}
  if(!verifyTelegramWebhookSecret(request)){set.status=401;return{ok:false,error:"invalid Telegram webhook secret"}}
  const update=await request.clone().json().catch(()=>null) as any;
  const updateId=parseTelegramUpdateId(update?.update_id);
  if(updateId===null){set.status=400;return{ok:false,error:"invalid Telegram update_id"}}
  let claim:string;
  try {
    claim=classifyTelegramUpdateClaim(await claimTelegramUpdate(updateId));
  } catch(error) {
    console.error(JSON.stringify({event:"rafig_telegram_update_claim_failed",updateId,error:String(error).slice(0,200)}));
    set.status=503;
    return{ok:false,error:"Telegram update protection is temporarily unavailable"};
  }
  if(claim==="duplicate"){set.status=200;return{ok:true,status:"duplicate_update_ignored"}}
  if(claim==="busy"){set.status=503;return{ok:false,error:"Telegram update is already processing"}}
  if(claim!=="claimed"){set.status=503;return{ok:false,error:"Telegram update claim returned an invalid state"}}
  try {
    const result=await handleTelegramWebhook({request,set});
    const status=Number(set.status??200);
    await finishTelegramUpdate(updateId,status>=500?"failed":"completed",status>=500?"Telegram handler returned HTTP "+status:undefined);
    return result;
  } catch(error) {
    await finishTelegramUpdate(updateId,"failed",String(error)).catch(finishError=>console.error(JSON.stringify({event:"rafig_telegram_update_mark_failed",updateId,error:String(finishError).slice(0,200)})));
    throw error;
  }
})
app.post("/api/public/institution-intake",({set})=>{set.status=410;return{ok:false,error:"public_submission_retired"}})
.post("/api/public/intake",({set})=>{set.status=410;return{ok:false,error:"public_submission_retired"}})
.get("/api/intake/complete",({set})=>{set.status=410;return{ok:false,error:"public_document_completion_retired"}})
.post("/api/intake/complete",({set})=>{set.status=410;return{ok:false,error:"public_document_completion_retired"}})
.get("/api/status",()=>({ok:true,service:"RAFIQ",started_at:startedAt,uptime_seconds:Math.floor(process.uptime())}))
.get("/api/barcode/qr/:code",({set})=>{set.status=410;return new Response("legacy provider barcode retired",{status:410})})

.post("/api/kapso/send-text",({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired."}})
.get("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.post("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.post("/api/agent/chat",async({request,set})=>{const started=Date.now();console.log(JSON.stringify({event:"rafig_agent_chat_received"}));let input:any;try{input=await request.json()}catch{set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_json"}));return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>4000){set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_message"}));return{ok:false,error:"invalid message"}}try{const result=await draftInboundReply(message);console.log(JSON.stringify({event:"rafig_agent_chat_completed",model:result.model,durationMs:Date.now()-started}));return{ok:true,reply:result.reply,model:result.model}}catch(error){console.error(JSON.stringify({event:"rafig_agent_chat_failed",error:String(error).slice(0,160),durationMs:Date.now()-started}));return{ok:true,reply:rafiqFallback(message),model:"rafig-local-fallback"}}})
.post("/api/agent/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>8000){set.status=400;return{ok:false,error:"invalid message"}}try{const result=await draftAgentReply(message,typeof input?.language==="string"?input.language:undefined);return{ok:true,draft:result.reply,model:result.model,humanApprovalRequired:true}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/agent/outreach-draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const target=input?.target;if(target!=="laboratory"&&target!=="medical_equipment_supplier"&&target!=="radiology_center"){set.status=400;return{ok:false,error:"invalid outreach target"}}const institutionName=typeof input?.institutionName==="string"?input.institutionName.trim():"",language=typeof input?.language==="string"?input.language.trim():"";if(institutionName.length>200||language.length>40){set.status=400;return{ok:false,error:"invalid input"}}try{const result=await draftInstitutionOutreach(target,institutionName,language||undefined);return{ok:true,target,institutionName:institutionName||null,draft:result.reply,model:result.model,humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/channel/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const topic=typeof input?.topic==="string"?input.topic.trim():"",language=typeof input?.language==="string"?input.language.trim():"ar";if(!topic||topic.length>4000||language.length>40){set.status=400;return{ok:false,error:"invalid topic or language"}}try{const result=await draftAgentReply(`Prepare a public WhatsApp Channel post for the official RAFIQ | رفيق channel.\nLanguage: ${language}\nTopic: ${topic}\nAudience: families, caregivers, nurses, healthcare institutions, laboratories, medical equipment suppliers, and radiology centers.\nThe post must be informative, professional, concise, and suitable for a public one-way channel. Do not claim that a partnership, booking, payment, referral, approval, or service has already happened unless explicitly stated in the topic. Do not expose private information. Return only the ready-to-review channel post.`);return{ok:true,draft:result.reply,model:result.model,channel:"RAFIQ official WhatsApp Channel",publishMode:"manual-admin",humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/whatsapp/send-text",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.get("/",()=>fileResponse("public/index.html","text/html; charset=utf-8","no-store"))
.get("/agent.html",()=>fileResponse("public/agent.html","text/html; charset=utf-8","no-store"))
.get("/admin",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin/",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.html",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/complete.html",()=>fileResponse("public/complete.html","text/html; charset=utf-8","no-store"))
.get("/admin.js",()=>fileResponse("public/admin.js","application/javascript","public, max-age=300, stale-while-revalidate=86400"))
.get("/app.js",()=>fileResponse("public/app.js","application/javascript","no-cache"))
.get("/install-pwa.js",()=>fileResponse("public/install-pwa.js","application/javascript","no-cache")).get("/install-app.js",()=>fileResponse("public/install-app.js","application/javascript","no-cache")).get("/js/rafiq-agent.js",()=>fileResponse("public/js/rafiq-agent.js","application/javascript","no-cache")).get("/js/rafiq-kb.js",()=>fileResponse("public/js/rafiq-kb.js","application/javascript","no-cache")).get("/js/rafiq-welcome.js",()=>fileResponse("public/js/rafiq-welcome.js","application/javascript","no-cache")).get("/assets/rafig-logo.png",()=>fileResponse("public/assets/rafig-logo.png","image/png","no-cache"))
.get("/i18n.js",()=>fileResponse("public/i18n.js","application/javascript","no-cache"))
.get("/js/i18n.js",()=>fileResponse("public/i18n.js","application/javascript","no-cache"))
.get("/js/locales/ar.js",()=>fileResponse("public/js/locales/ar.js","application/javascript","no-cache"))
.get("/js/locales/en.js",()=>fileResponse("public/js/locales/en.js","application/javascript","no-cache"))
.get("/js/locales/fr.js",()=>fileResponse("public/js/locales/fr.js","application/javascript","no-cache"))
.get("/js/locales/it.js",()=>fileResponse("public/js/locales/it.js","application/javascript","no-cache"))
.get("/js/locales/de.js",()=>fileResponse("public/js/locales/de.js","application/javascript","no-cache"))
.get("/css/device.css",()=>fileResponse("public/css/device.css","text/css","no-cache"))
.get("/intake-admin.js",()=>fileResponse("public/intake-admin.js","application/javascript","no-cache")).get("/institution-form.js",()=>fileResponse("public/institution-form.js","application/javascript","no-cache"))
.get("/manifest.webmanifest",()=>fileResponse("public/manifest.webmanifest","application/manifest+json"))
.get("/sitemap.xml",()=>fileResponse("public/sitemap.xml","application/xml; charset=utf-8","no-store"))
.get("/*",async({request,set})=>{const pathname=new URL(request.url).pathname;if(pathname==="/"||pathname.startsWith("/api/")){set.status=404;return{ok:false,error:"not found"}}let decoded="";try{decoded=decodeURIComponent(pathname)}catch{set.status=400;return{ok:false,error:"invalid path"}}if(!decoded.startsWith("/")||decoded.includes("..")||!/^[A-Za-z0-9._~!$&'()*+,;=:@%\\/-]+$/.test(decoded)){set.status=404;return{ok:false,error:"not found"}}const ext=decoded.split(".").pop()?.toLowerCase()??"";const mime:Record<string,string>={js:"application/javascript; charset=utf-8",css:"text/css; charset=utf-8",json:"application/json; charset=utf-8",webmanifest:"application/manifest+json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",txt:"text/plain; charset=utf-8",xml:"application/xml; charset=utf-8",woff:"font/woff",woff2:"font/woff2",map:"application/json; charset=utf-8"};if(!mime[ext]){set.status=404;return{ok:false,error:"not found"}}const cache=["png","jpg","jpeg","webp","svg","ico","woff","woff2"].includes(ext)?"public, max-age=86400, stale-while-revalidate=604800":["js","css","json","webmanifest","xml"].includes(ext)?"public, max-age=300, stale-while-revalidate=86400":"no-store";return fileResponse("public"+decoded,mime[ext],cache)})
.get("/:page",({params,set})=>{const page=String(params.page??"");if(!/^[a-z0-9-]+\.html$/i.test(page)||page==="admin.html"){set.status=404;return{ok:false,error:"not found"}}return fileResponse(`public/${page}`,"text/html; charset=utf-8","no-store")})
.get("/robots.txt",()=>new Response("User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin.js\nDisallow: /intake-admin.js\nSitemap: https://rafiq-o6qd.onrender.com/sitemap.xml",{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}}))
.get("/sw.js",()=>fileResponse("public/sw.js","application/javascript","no-cache"))
.get("/sitemap.xml",()=>fileResponse("public/sitemap.xml","application/xml; charset=utf-8","no-store"))
.get("/services.html",()=>fileResponse("public/services.html","text/html; charset=utf-8"))
.get("/elderly-care.html",()=>fileResponse("public/elderly-care.html","text/html; charset=utf-8"))
.get("/patient-care.html",()=>fileResponse("public/patient-care.html","text/html; charset=utf-8"))
.get("/home-nursing.html",()=>fileResponse("public/home-nursing.html","text/html; charset=utf-8"))
.get("/physiotherapy.html",()=>fileResponse("public/physiotherapy.html","text/html; charset=utf-8"))
.get("/caregivers.html",()=>fileResponse("public/caregivers.html","text/html; charset=utf-8"))
.get("/regions.html",()=>fileResponse("public/regions.html","text/html; charset=utf-8"))
.get("/guide.html",()=>fileResponse("public/guide.html","text/html; charset=utf-8"))
.get("/tripoli.html",()=>fileResponse("public/tripoli.html","text/html; charset=utf-8"))
.get("/dinniyeh.html",()=>fileResponse("public/dinniyeh.html","text/html; charset=utf-8"))
.get("/zgharta.html",()=>fileResponse("public/zgharta.html","text/html; charset=utf-8"))
.get("/koura.html",()=>fileResponse("public/koura.html","text/html; charset=utf-8"))
.get("/batroun.html",()=>fileResponse("public/batroun.html","text/html; charset=utf-8"))
.get("/beirut.html",()=>fileResponse("public/beirut.html","text/html; charset=utf-8"))
.get("/lebanon.html",()=>fileResponse("public/lebanon.html","text/html; charset=utf-8"))
.get("/guide-choose-caregiver.html",()=>fileResponse("public/guide-choose-caregiver.html","text/html; charset=utf-8"))
.get("/guide-caregiver-vs-nurse.html",()=>fileResponse("public/guide-caregiver-vs-nurse.html","text/html; charset=utf-8"))
.get("/guide-elderly-home.html",()=>fileResponse("public/guide-elderly-home.html","text/html; charset=utf-8"))
.get("/guide-after-hospital.html",()=>fileResponse("public/guide-after-hospital.html","text/html; charset=utf-8"))
;
app.listen({ hostname: process.env.HOST ?? "0.0.0.0", port });
console.log(`RAFIQ server listening on ${app.server?.hostname}:${app.server?.port}`);
void registerTelegramWebhookOnStartup();
setInterval(() => { void telegramMarketingTick(); }, 30_000);
void telegramMarketingTick();
setTimeout(() => {
  if(process.env.TELEGRAM_BROADCAST_ON_START!=="true") return;
  void broadcastTelegramAnnouncement(TELEGRAM_ONBOARDING_KEY, TELEGRAM_ONBOARDING_MESSAGE, TELEGRAM_ANNOUNCEMENT_CUTOFF)
    .then(result => console.log(JSON.stringify({event:"rafig_telegram_onboarding_broadcast",...result})))
    .catch(error => console.error(JSON.stringify({event:"rafig_telegram_onboarding_broadcast_failed",error:String(error).slice(0,300)})));
}, 1500);


console.log(JSON.stringify({
  event:"rafig_runtime_configuration",
  openAIConfigured:Boolean(process.env.OPENAI_API_KEY),
  whatsappSendingEnabled:process.env.WHATSAPP_SENDING_ENABLED==="true",
  whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",
  agentModel:effectiveAgentModel(),
}));
