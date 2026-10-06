import { Elysia } from "elysia";
import { answerRafiqKnowledge } from "./rafiq-service-knowledge";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";
import { kapsoConfigured, kapsoSendText, kapsoWebhookSecret } from "./kapso";
import { rafiqFallback } from "./rafiq-local-agent";
import { telegramConfigured, telegramGetWebhookInfo, telegramSendText, telegramSendDocument, telegramSendPhoto, telegramSetWebhook, telegramWebhookSecret, verifyTelegramWebhookSecret } from "./telegram";
import { cvChoice, cvMenuText, cvPaymentText, cvPrompt } from "./telegram-cv";
import { handleManagerCommand, parseManagerChatIds } from "./telegram-manager";
import { RAFIQ_TELEGRAM_BOT, RAFIQ_TELEGRAM_CHANNEL, RAFIQ_WEBSITE, RAFIQ_WHATSAPP, RAFIQ_WHATSAPP_CHANNEL, RAFIQ_WHATSAPP_NUMBER, rafiqRequiresHumanReply } from "./rafiq-service-knowledge";

const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();
let lastKapsoWebhookAt: string | null = null;
let lastKapsoWebhookEvent: string | null = null;
const AGENT_DEFAULT_MODEL = "gpt-5.6-sol";
const effectiveAgentModel = () => {
  const configured = (process.env.RAFIQ_AGENT_MODEL ?? "").trim();
  return configured || AGENT_DEFAULT_MODEL;
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
const securityHeaders = {"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: https://images.pexels.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://qmuxaehrahfsnabyjens.supabase.co https://graph.facebook.com https://api.kapso.ai","Cache-Control":"no-store"};
const timingSafeEqual=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const verifyMetaSignature=async(body:string,signature:string|null)=>{const secret=process.env.META_APP_SECRET;if(!secret||!signature?.startsWith("sha256="))return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=`sha256=${hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)))}`;return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(signature))};
const verifyKapsoSignature=async(body:string,signature:string|null)=>{const secret=kapsoWebhookSecret();if(!secret||!signature)return false;const normalized=signature.startsWith("sha256=")?signature.slice(7):signature;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(normalized))};const kapsoIdentity=(message:any,conversation:any={})=>({phone:typeof message?.from==="string"&&message.from?message.from:(typeof conversation?.phone_number==="string"&&conversation.phone_number?conversation.phone_number:""),bsuid:typeof message?.from_user_id==="string"&&message.from_user_id?message.from_user_id:(typeof conversation?.business_scoped_user_id==="string"&&conversation.business_scoped_user_id?conversation.business_scoped_user_id:""),username:typeof message?.username==="string"?message.username:(typeof conversation?.username==="string"?conversation.username:"")});const processKapsoMessageCore=async(message:any,conversation:any={})=>{
  const identity=kapsoIdentity(message,conversation);
  const forbiddenDigits="70600157";
  if(identity.phone?.replace(/\D/g,"").endsWith(forbiddenDigits)){console.warn(JSON.stringify({event:"rafig_forbidden_number_blocked",fromSuffix:identity.phone.slice(-4)}));return{id:String(message?.id??"unknown"),status:"blocked_forbidden_number"}}
  const body=typeof message?.text?.body==="string"?message.text.body.trim():(typeof message?.kapso?.content==="string"?message.kapso.content.trim():"");
  const destination=identity.phone?{to:identity.phone}:{recipient:identity.bsuid};
  if(!body||(!destination.to&&!destination.recipient))return{id:String(message?.id??"unknown"),status:"ignored_missing_identity_or_text"};
  try{
    const inbound=await recordInboundEvent(message,identity);if(inbound?.duplicate){console.log(JSON.stringify({event:"rafig_kapso_duplicate_ignored",messageId:String(message?.id??"")}));return{id:String(message?.id??"unknown"),status:"duplicate_ignored"}}
    console.log(JSON.stringify({event:"rafig_inbound_persisted",messageId:String(message.id??""),inboundId:inbound?.id??null}));
    await forwardWhatsAppToTelegramManager(message,identity,body);
    if(process.env.RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING==="true" && (process.env.RAFIQ_WHATSAPP_AUTO_REPLY!=="true" || process.env.WHATSAPP_SENDING_ENABLED!=="true")){
      await updateInboundEvent(String(message.id??""),"processed");
      return{id:String(message.id??""),status:"forwarded_to_telegram"};
    }
    const result=await draftInboundReply(body,identity.phone||undefined);
    if(process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true"&&process.env.WHATSAPP_SENDING_ENABLED==="true"){
      try{
        const outbound=kapsoConfigured()?await kapsoSendText(destination,result.reply):identity.phone?await sendWhatsAppText(identity.phone,result.reply):null;
        if(!outbound)throw new Error("BSUID-only inbound requires Kapso API configuration");
        await recordOutboundMessage(identity.phone||"",result.reply,outbound);
        await updateInboundEvent(String(message.id??""),"processed");
        console.log(JSON.stringify({event:"rafig_kapso_auto_reply_sent",provider:kapsoConfigured()?"kapso":"meta",fromSuffix:identity.phone?identity.phone.slice(-4):null,businessScopedUserId:identity.bsuid||null,inboundMessageId:String(message.id??""),outboundMessageId:outbound?.messages?.[0]?.id??null}));
        return{id:String(message.id??""),status:outbound?.messages?.[0]?.id?"auto_replied":"draft_ready"};
      }catch(error){
        await updateInboundEvent(String(message.id??""),"failed",String(error).slice(0,500)).catch(()=>{});
        console.error(JSON.stringify({event:"rafig_kapso_auto_reply_failed",fromSuffix:identity.phone?identity.phone.slice(-4):null,businessScopedUserId:identity.bsuid||null,inboundMessageId:String(message.id??""),error:String(error)}));
        return{id:String(message.id??""),status:"draft_ready_send_failed"};
      }
    }
    await updateInboundEvent(String(message.id??""),"processed");
    return{id:String(message.id??""),status:"draft_ready"};
  }catch(error){
    await updateInboundEvent(String(message.id??""),"failed",String(error).slice(0,500)).catch(()=>{});
    console.error(JSON.stringify({event:"rafig_kapso_agent_failed",messageId:String(message.id??""),error:String(error)}));
    return{id:String(message.id??""),status:"draft_failed"};
  }
};const kapsoInFlight=new Set<string>();const processKapsoMessage=async(message:any,conversation:any={})=>{const id=String(message?.id??"");if(id&&kapsoInFlight.has(id))return{id,status:"duplicate_in_flight"};if(id)kapsoInFlight.add(id);try{return await processKapsoMessageCore(message,conversation)}finally{if(id)kapsoInFlight.delete(id)}};const extractIncomingMessages=(payload:any)=>{const messages:Array<{from:string;id:string;text?:string;type:string;timestamp?:string}>=[];for(const entry of payload?.entry??[])for(const change of entry?.changes??[])for(const message of change?.value?.messages??[])messages.push({from:String(message.from??""),id:String(message.id??""),text:typeof message.text?.body==="string"?message.text.body:undefined,type:String(message.type??"unknown"),timestamp:message.timestamp?String(message.timestamp):undefined});return messages};
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
const recordInboundEvent=async(message:any,identity:any)=>{
  const providerMessageId=String(message?.id??"").trim();
  if(!providerMessageId)return null;const prevRow=await supabaseServerRest("/rest/v1/whatsapp_inbound_events?provider=eq.kapso&provider_message_id=eq."+encodeURIComponent(providerMessageId)+"&select=id,processing_status&limit=1");const prev=Array.isArray(prevRow.body)?prevRow.body[0]:null;if(prev&&prev.processing_status==="processed")return{...prev,duplicate:true};
  const r=await supabaseServerRest("/rest/v1/whatsapp_inbound_events?on_conflict=provider%2Cprovider_message_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({provider:"kapso",provider_message_id:providerMessageId,from_phone:identity.phone||null,message_type:typeof message?.type==="string"?message.type:"text",text_body:typeof message?.text?.body==="string"?message.text.body.trim():(typeof message?.kapso?.content==="string"?message.kapso.content.trim():null),payload:message??{},processing_status:"processing"})});
  if(!r.response.ok){const detail=typeof r.body==="string"?r.body:JSON.stringify(r.body??{});throw new Error(`could not persist inbound WhatsApp event (${r.response.status}): ${detail.slice(0,700)}`);}
  return Array.isArray(r.body)?r.body[0]:r.body;
};
const updateInboundEvent=async(providerMessageId:string,status:string,errorMessage?:string)=>{
  if(!SUPABASE_SERVICE_ROLE_KEY||!providerMessageId)return;
  await supabaseServerRest("/rest/v1/whatsapp_inbound_events?provider=eq.kapso&provider_message_id=eq."+encodeURIComponent(providerMessageId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({processing_status:status,error_message:errorMessage??null,processed_at:new Date().toISOString()})});
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
const sendWhatsAppText=async(to:string,body:string)=>{const accessToken=process.env.META_ACCESS_TOKEN,phoneNumberId=process.env.META_PHONE_NUMBER_ID,apiVersion=process.env.META_GRAPH_API_VERSION??"v23.0";if(!accessToken||!phoneNumberId)throw new Error("WhatsApp Cloud API server configuration is incomplete");const response=await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body}})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Meta WhatsApp API error (${response.status})`);return result};
const PUBLIC_I18N_EXCLUDED = new Set(["public/admin.html","public/dashboard.html","public/barcode.html","public/member.html"]); const RAFIQ_LOGO_STYLE='<style id="rafig-logo-quality">.brand img,.brand-mini img,.hero-logo,.logo,.brand-logo{background:#fff!important;object-fit:contain!important;image-rendering:auto!important;filter:none!important}.brand img,.brand-mini img,.logo,.brand-logo{border-radius:14px!important;padding:6px!important;box-sizing:border-box!important}.hero-logo{display:block;background:#fff!important;border-radius:18px!important;padding:10px!important;box-shadow:0 5px 18px rgba(0,0,0,.08)!important}</style>'; const fileResponse=async(path:string,type:string,cache="no-store")=>{const file=Bun.file(path);if(!(await file.exists()))return new Response("Not Found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});let body:any=await file.arrayBuffer();if(type.startsWith("text/html")&&!PUBLIC_I18N_EXCLUDED.has(path)){let html=new TextDecoder().decode(body);if(type.startsWith("text/html")&&!html.includes("id=\"rafig-logo-quality\"")){html=html.includes("</head>")?html.replace("</head>",RAFIQ_LOGO_STYLE+"</head>"):RAFIQ_LOGO_STYLE+html;}if(!html.includes("/css/device.css")){const marker="</head>";const tag='<link rel="stylesheet" href="/css/device.css?v=72">';html=html.includes(marker)?html.replace(marker,tag+marker):tag+html;}if(!html.includes("/i18n.js")){const marker="</body>";const tag='<script src="/i18n.js?v=3" defer></script>';html=html.includes(marker)?html.replace(marker,tag+marker):html+tag;}body=html;}const bytes=typeof body==="string"?new TextEncoder().encode(body):new Uint8Array(body);return new Response(body,{status:200,headers:{"Content-Type":type,"Content-Length":String(bytes.byteLength),"Cache-Control":cache}})};
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
const telegramCommandReply = (command: string) => {
  const c = command.trim().toLowerCase().split(" ")[0];
  if (c === "/start") return ["أهلًا بك في رفيق | RAFIQ 🇱🇧","أنا مساعد رفيق للرعاية المنزلية. أخبرني بطلبك بكلماتك الطبيعية، وسأطرح عليك الأسئلة اللازمة خطوة بخطوة.","للخدمات: /services","لتقديم طلب: /request","للمساعدة: /help","للتواصل مع الإدارة: /contact"].join("\n\n");
  if (c === "/services") return ["خدمات رفيق تشمل: 👴 رعاية كبار السن، 🏠 رعاية المرضى داخل المنزل، 👩‍⚕️ التمريض المنزلي، 🦿 العلاج الفيزيائي المنزلي.","اكتب ما تحتاجه وسأساعدك في تحديد الخدمة المناسبة."].join("\n\n");
  if (c === "/request") return "بكل سرور. سنبني الطلب معًا خطوة بخطوة. ابدأ بإخباري: هل الطلب لمسن أم لمريض؟ وفي أي مدينة؟";
  if (c === "/help") return "يمكنك كتابة طلبك كما تتحدث مع شخص من فريق رفيق. سأفهم التفاصيل وأسألك فقط عن المعلومات الناقصة. إذا احتاج الأمر قرارًا إداريًا، سأحوّله للفريق وأعطيك رقم WhatsApp الرسمي: +961 81 506 299.";
  if (c === "/contact") return ["للمتابعة المباشرة مع إدارة رفيق عبر WhatsApp: +961 81 506 299","https://wa.me/96181506299"].join("\n");
  if (c === "/cv") return cvMenuText();
  return "";
};
const registerTelegramWebhookOnStartup = async () => {
  if (!telegramConfigured()) return;
  let base=(process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com"); while(base.endsWith("/")) base=base.slice(0,-1);
  try {
    await telegramSetWebhook(base+"/api/telegram/webhook?v=3",telegramWebhookSecret()||undefined);
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


const telegramAdminAllowed=(message:any)=>{
  if(message?.chat?.type!=="private")return false;
  const username=String(message?.from?.username??"").replace(/^@/,"").toLowerCase();
  const chatId=String(message?.chat?.id??"");
  const usernames=String(process.env.RAFIQ_TELEGRAM_ADMIN_USERNAMES??"MHDISSA980").split(",").map(v=>v.trim().replace(/^@/,"").toLowerCase()).filter(Boolean);
  const chatIds=String(process.env.RAFIQ_TELEGRAM_ADMIN_CHAT_IDS??"").split(",").map(v=>v.trim()).filter(Boolean);
  return (username&&usernames.includes(username))||(chatId&&chatIds.includes(chatId));
};
const telegramMemberType=(applicationType:string)=>{
  const t=String(applicationType??"");
  if(t.includes("مقدم")||/caregiver/i.test(t))return"caregiver";
  if(t.includes("ممرض")||/nurse/i.test(t))return"nurse";
  if(t.includes("معالج")||/physio/i.test(t))return"physiotherapist";
  return null;
};
const telegramTypeLabel=(type:string)=>({caregiver:"مقدمو الرعاية",nurse:"الممرضون/الممرضات",physiotherapist:"المعالجون الفيزيائيون"} as Record<string,string>)[type]??type;
const telegramPrefix=(type:string)=>({caregiver:"CG",nurse:"NR",physiotherapist:"PT"} as Record<string,string>)[type]??"MB";
const telegramAdminSigned=(body:string)=>telegramSigned(body);
const telegramHash=async(value:string)=>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
};
const telegramAdminIntake=async(ref:string)=>{
  const clean=String(ref??"").trim();
  if(!clean)return null;
  let url="";
  if(/^\\d+$/.test(clean))url="/rest/v1/application_intakes?application_number=eq."+encodeURIComponent(clean)+"&select=*&limit=1";
  else if(/^[0-9a-f-]{36}$/i.test(clean))url="/rest/v1/application_intakes?id=eq."+encodeURIComponent(clean)+"&select=*&limit=1";
  else return null;
  const r=await supabaseServerRest(url);
  return r.response.ok&&Array.isArray(r.body)&&r.body[0]?r.body[0]:null;
};
const telegramAdminProfileForIntake=async(intake:any)=>{
  const n=intake?.application_number;
  if(!n)return{application:null,profile:null,photo:null};
  const ar=await supabaseServerRest("/rest/v1/applications?application_number=eq."+encodeURIComponent(String(n))+"&select=id,user_id,application_type,status&limit=1");
  const application=Array.isArray(ar.body)?ar.body[0]:null;
  if(!application?.user_id)return{application,profile:null,photo:null};
  const pr=await supabaseServerRest("/rest/v1/profiles?id=eq."+encodeURIComponent(application.user_id)+"&select=id,first_name,last_name,mother_name,phone,telegram_phone,telegram_username,address,photo_storage_path&limit=1");
  const profile=Array.isArray(pr.body)?pr.body[0]:null;
  const dr=await supabaseServerRest("/rest/v1/documents?user_id=eq."+encodeURIComponent(application.user_id)+"&document_type=eq.profile_photo&order=created_at.desc&select=storage_path,file_name,mime_type&limit=1");
  const photo=Array.isArray(dr.body)?dr.body[0]:null;
  return{application,profile,photo};
};
const telegramAdminFormatIntake=async(intake:any)=>{
  const p=await telegramAdminProfileForIntake(intake);
  const payload=intake?.payload&&typeof intake.payload==="object"?intake.payload:{};
  const type=telegramMemberType(intake?.application_type)||"—";
  const fullName=p.profile?[p.profile.first_name,p.profile.last_name].filter(Boolean).join(" "):String(intake?.applicant_name??"");
  return[
    "👤 <b>"+telegramTypeLabel(type)+"</b>","📌 الطلب: "+String(intake?.application_number??"—"),
    "👤 الاسم الثلاثي: "+(fullName||"—"),"👩 اسم الوالدة: "+String(p.profile?.mother_name??payload.mother_name??"—"),
    "👨 اسم الأب: "+String(payload.father??"—"),"🎂 تاريخ الميلاد: "+String(payload.dob??"—"),
    "📍 العنوان: "+String(p.profile?.address??payload.address??intake?.area??"—"),"📞 واتساب: "+String(p.profile?.phone??intake?.phone??"—"),
    "✈️ Telegram: "+(p.profile?.telegram_username?("@"+String(p.profile.telegram_username).replace(/^@/,"")):"—")+" / "+String(p.profile?.telegram_phone??"—"),
    "🎓 الصفة/الاختصاص: "+String(payload.specialty??payload.qualification??payload.license??type),"🧰 الخبرة: "+String(payload.experience??"—"),
    "🗣️ اللغات: "+String(payload.languages??"—"),"🛠️ الخدمات: "+String(payload.services??"—"),
    "🕒 التوفر: "+String(payload.availability??"—"),"📎 الصورة الشخصية: "+(p.photo?.storage_path||p.profile?.photo_storage_path?"موجودة في الملف الخاص":"غير مرفقة"),
    "📋 الحالة: "+String(intake?.status??"—")
  ].join("\n");
};
const telegramAdminList=async(statuses:string[],type?:string)=>{
  const or=statuses.map(s=>"status.eq."+encodeURIComponent(s)).join(",");
  const r=await supabaseServerRest("/rest/v1/application_intakes?or=("+or+")&order=created_at.desc&select=id,application_number,application_type,applicant_name,phone,area,status,created_at&limit=50");
  const rows=Array.isArray(r.body)?r.body:[];
  return type?rows.filter((x:any)=>telegramMemberType(x.application_type)===type):rows;
};
const telegramAdminApprove=async(ref:string)=>{
  const intake=await telegramAdminIntake(ref); if(!intake)throw new Error("لم يتم العثور على الطلب");
  const type=telegramMemberType(intake.application_type); if(!type)throw new Error("هذا الطلب ليس طلب انتساب لمقدم خدمة");
  const p=await telegramAdminProfileForIntake(intake);
  const prefix=telegramPrefix(type);
  const memberNumber="RAFIQ-"+prefix+"-"+String(intake.application_number??"").padStart(6,"0");
  const code="RAFIQ-"+prefix+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
  const hash=await telegramHash(code);
  const payload=intake.payload&&typeof intake.payload==="object"?intake.payload:{};
  const up=await supabaseServerRest("/rest/v1/rafiq_provider_registry?on_conflict=intake_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({
    intake_id:intake.id,application_number:intake.application_number,member_number:memberNumber,barcode_code:code,member_type:type,status:"approved",
    full_name:p.profile?[p.profile.first_name,p.profile.last_name].filter(Boolean).join(" "):intake.applicant_name,mother_name:p.profile?.mother_name??payload.mother_name??null,
    father_name:payload.father??null,birth_date:payload.dob??null,photo_storage_path:p.photo?.storage_path??p.profile?.photo_storage_path??null,address:p.profile?.address??payload.address??null,
    area:intake.area??payload.area??null,phone:p.profile?.phone??intake.phone??null,whatsapp_phone:p.profile?.phone??intake.phone??null,
    telegram_phone:p.profile?.telegram_phone??null,telegram_username:p.profile?.telegram_username??null,platform_role:type,specialty:payload.specialty??null,
    qualification:payload.qualification??payload.license??null,experience:payload.experience??null,languages:payload.languages??null,services:payload.services??null,availability:payload.availability??null,
    approved_at:new Date().toISOString(),updated_at:new Date().toISOString()
  })});
  if(!up.response.ok)throw new Error("تعذر إنشاء ملف العضو");
  const barcode=await supabaseServerRest("/rest/v1/issued_barcodes?on_conflict=code",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({intake_id:intake.id,code,code_hash:hash,member_type:type,status:"active",issued_at:new Date().toISOString()})});
  if(!barcode.response.ok)throw new Error("تعذر إصدار الباركود");
  await supabaseServerRest("/rest/v1/application_intakes?id=eq."+encodeURIComponent(intake.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"approved",admin_decision_notes:"تم القبول وإصدار الرقم والباركود من إدارة RAFIQ",updated_at:new Date().toISOString()})});
  if(p.application?.id)await supabaseServerRest("/rest/v1/applications?id=eq."+encodeURIComponent(p.application.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"approved",updated_at:new Date().toISOString()})});
  const link=(process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com").replace(/\/$/,"")+"/barcode.html?code="+encodeURIComponent(code);
  const applicantUsername=String(p.profile?.telegram_username??payload.telegram_username??"").replace(/^@/,"").trim();
  if(applicantUsername){
    const ir=await supabaseServerRest("/rest/v1/rafiq_telegram_identities?username=ilike."+encodeURIComponent(applicantUsername)+"&select=chat_id&order=last_seen_at.desc&limit=1");
    const recipient=Array.isArray(ir.body)?ir.body[0]?.chat_id:null;
    if(recipient)await telegramSendText(recipient,telegramSigned("🎉 أهلًا بك في RAFIQ | رفيق\\n\\nتم قبول طلبك رسميًا.\\n🪪 رقمك الشخصي: "+memberNumber+"\\n🔖 باركودك: "+code+"\\n🔗 افتح بطاقة الباركود: "+link+"\\n\\nاحتفظ بهذا الرقم والباركود لاستخدامهما ضمن منصة رفيق.")).catch(()=>{});
  }
  return{intake,type,memberNumber,code,link};
};
const telegramAdminReject=async(ref:string,note:string)=>{
  const intake=await telegramAdminIntake(ref); if(!intake)throw new Error("لم يتم العثور على الطلب");
  await supabaseServerRest("/rest/v1/application_intakes?id=eq."+encodeURIComponent(intake.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"rejected",admin_decision_notes:note||"تم رفض الطلب من الإدارة",updated_at:new Date().toISOString()})});
  const p=await telegramAdminProfileForIntake(intake);
  if(p.application?.id)await supabaseServerRest("/rest/v1/applications?id=eq."+encodeURIComponent(p.application.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({status:"rejected",updated_at:new Date().toISOString()})});
  return intake;
};
const telegramAdminMenu=()=>["🔐 <b>لوحة مدير RAFIQ عبر Telegram</b>","","📂 /pending — قيد المراجعة","🤝 /caregivers — مقدمو الرعاية","👩‍⚕️ /nurses — الممرضون/الممرضات","🧑‍🦽 /physios — المعالجون الفيزيائيون","❌ /rejected — المرفوضون","✅ /approved — المقبولون","🔎 /candidate 108 — ملف متقدم","✔️ /approve 108 — قبول وإصدار الرقم والباركود","✖️ /reject 108 السبب — رفض الطلب","🗂️ /cases — حالات الرعاية المفتوحة","ℹ️ /help — المساعدة"].join("\n");
const telegramAdminCommand=async(message:any)=>{
  if(!telegramAdminAllowed(message))return null;
  const chatId=message.chat.id;
  const textBody=typeof message?.text==="string"?message.text.trim():"";
  const parts=textBody.split(/\s+/);
  const cmd=String(parts[0]??"").toLowerCase();
  if(!["/admin","/pending","/caregivers","/nurses","/physios","/rejected","/approved","/candidate","/approve","/reject","/cases","/help"].includes(cmd))return null;
  if(cmd==="/admin"||cmd==="/help")return telegramSendText(chatId,telegramAdminSigned(telegramAdminMenu()));
  if(cmd==="/candidate"){
    const intake=await telegramAdminIntake(parts[1]??""); if(!intake)return telegramSendText(chatId,telegramAdminSigned("❌ لم أجد هذا الطلب."));
    return telegramSendText(chatId,telegramAdminSigned(await telegramAdminFormatIntake(intake)));
  }
  if(cmd==="/pending"||cmd==="/caregivers"||cmd==="/nurses"||cmd==="/physios"||cmd==="/rejected"||cmd==="/approved"){
    const type=cmd==="/caregivers"?"caregiver":cmd==="/nurses"?"nurse":cmd==="/physios"?"physiotherapist":undefined;
    const statuses=cmd==="/rejected"?["rejected"]:cmd==="/approved"?["approved"]:["pending","review"];
    const rows=await telegramAdminList(statuses,type);
    if(!rows.length)return telegramSendText(chatId,telegramAdminSigned("لا توجد ملفات ضمن هذا القسم."));
    const body=rows.map((x:any)=>"• #"+x.application_number+" — "+(x.applicant_name||"—")+" — "+telegramTypeLabel(telegramMemberType(x.application_type)||x.application_type)+" — "+x.status+"\n  /candidate "+x.application_number).join("\n");
    return telegramSendText(chatId,telegramAdminSigned(body));
  }
  if(cmd==="/approve"){
    try{
    await supabaseServerRest("/rest/v1/rafiq_telegram_identities?on_conflict=telegram_user_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({telegram_user_id:String(message?.from?.id??""),chat_id:String(chatId),username:username||null,first_name:message?.from?.first_name??null,last_name:message?.from?.last_name??null,last_seen_at:new Date().toISOString()})}).catch(()=>{});

    const adminHandled=await telegramAdminCommand(message);
    if(adminHandled)return{ok:true,status:"admin_command",message_id:adminHandled?.result?.message_id??null,admin:true};const out=await telegramAdminApprove(parts[1]??"");return telegramSendText(chatId,telegramAdminSigned("✅ تم اعتماد الملف #"+String(out.intake.application_number)+"\n\n🪪 الرقم الشخصي: "+out.memberNumber+"\n🔖 الباركود: "+out.code+"\n🔗 بطاقة الباركود: "+out.link+"\n\nتم حفظ الملف الكامل في السجل الخاص."));}
    catch(e){return telegramSendText(chatId,telegramAdminSigned("❌ "+String(e).slice(0,300)));}
  }
  if(cmd==="/reject"){
    try{const out=await telegramAdminReject(parts[1]??"",parts.slice(2).join(" "));return telegramSendText(chatId,telegramAdminSigned("❌ تم رفض الطلب #"+String(out.application_number)+" ونقله إلى ملف المرفوضين."));}
    catch(e){return telegramSendText(chatId,telegramAdminSigned("❌ "+String(e).slice(0,300)));}
  }
  if(cmd==="/cases"){
    const r=await supabaseServerRest("/rest/v1/care_requests?status=in.(pending,review,matching)&order=created_at.desc&select=id,request_number,service_type,required_provider_type,status,created_at&limit=30");
    const rows=Array.isArray(r.body)?r.body:[];
    return telegramSendText(chatId,telegramAdminSigned(rows.length?rows.map((x:any)=>"• الحالة #"+(x.request_number||x.id)+" — "+(x.service_type||"—")+" — "+(x.required_provider_type||"—")+" — "+x.status).join("\n"):"لا توجد حالات مفتوحة حاليًا."));
  }
  return null;
};
const app=new Elysia()
.onAfterHandle(({response})=>{if(response instanceof Response)for(const [k,v] of Object.entries(securityHeaders))response.headers.set(k,v)})
.get("/health",()=>({ok:true,service:"rafig-whatsapp-gateway",startedAt,kapsoWebhookLastReceivedAt:lastKapsoWebhookAt}))
.get("/api/admin/telegram-cv/orders",async({request,set})=>{
  const admin=await requireSupabaseAdmin(request);if(!admin){set.status=403;return{ok:false,error:"admin access required"}}
  const r=await supabaseRest("/rest/v1/rafiq_telegram_cv_orders?order_status=not.in.(completed,cancelled)&order=updated_at.desc&select=*",admin.token);
  if(!r.response.ok){set.status=502;return{ok:false,error:"could not load CV orders"}}
  return{ok:true,orders:Array.isArray(r.body)?r.body:[]};
})
.post("/api/admin/telegram-cv/confirm-payment",async({request,set})=>{
  const admin=await requireSupabaseAdmin(request);if(!admin){set.status=403;return{ok:false,error:"admin access required"}}
  let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}
  const orderId=typeof input?.orderId==="string"?input.orderId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(orderId)){set.status=400;return{ok:false,error:"invalid order id"}}
  const r=await supabaseRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(orderId),admin.token,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({payment_status:"confirmed",order_status:"in_progress",admin_note:typeof input?.note==="string"?input.note.slice(0,1000):null,updated_at:new Date().toISOString()})});
  if(!r.response.ok){set.status=502;return{ok:false,error:"could not confirm payment"}}
  return{ok:true,status:"payment_confirmed",order:Array.isArray(r.body)?r.body[0]??null:r.body};
})
.post("/api/admin/telegram-cv/reject-payment",async({request,set})=>{
  const admin=await requireSupabaseAdmin(request);if(!admin){set.status=403;return{ok:false,error:"admin access required"}}
  let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}
  const orderId=typeof input?.orderId==="string"?input.orderId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(orderId)){set.status=400;return{ok:false,error:"invalid order id"}}
  const r=await supabaseRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(orderId),admin.token,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({payment_status:"rejected",order_status:"awaiting_payment",admin_note:typeof input?.note==="string"?input.note.slice(0,1000):"Payment proof rejected",updated_at:new Date().toISOString()})});
  if(!r.response.ok){set.status=502;return{ok:false,error:"could not reject payment"}}
  return{ok:true,status:"payment_rejected",order:Array.isArray(r.body)?r.body[0]??null:r.body};
})
.post("/api/admin/telegram-cv/deliver",async({request,set})=>{
  const admin=await requireSupabaseAdmin(request);if(!admin){set.status=403;return{ok:false,error:"admin access required"}}
  let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}
  const orderId=typeof input?.orderId==="string"?input.orderId.trim():"";
  const fileId=typeof input?.documentFileId==="string"?input.documentFileId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(orderId)||!fileId){set.status=400;return{ok:false,error:"invalid order id or Telegram document file id"}}
  const loaded=await supabaseRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(orderId)+"&select=id,chat_id,service,payment_status,order_status",admin.token);
  const order=Array.isArray(loaded.body)?loaded.body[0]:null;
  if(!loaded.response.ok||!order){set.status=404;return{ok:false,error:"order not found"}}
  if(order.payment_status!=="confirmed"){set.status=409;return{ok:false,error:"payment must be confirmed before delivery"}}
  try{
    const caption="✅ تم تأكيد الدفع وتسليم ملفك النهائي من رفيق | RAFIQ 🇱🇧";
    const sent=await telegramSendDocument(String(order.chat_id),fileId,caption);
    const messageId=sent?.result?.message_id??null;
    const saved=await supabaseRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(orderId),admin.token,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({final_document_file_id:fileId,final_document_type:"telegram_file_id",order_status:"completed",updated_at:new Date().toISOString()})});
    if(!saved.response.ok){set.status=502;return{ok:false,error:"document sent but order status update failed",messageId}}
    return{ok:true,status:"delivered",messageId};
  }catch(error){set.status=502;return{ok:false,error:"Telegram document delivery failed"}}
})
.post("/api/kapso/webhook",async({request,set})=>{
  const raw=await request.text();
  if(raw.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}
  const signature=request.headers.get("x-kapso-signature")??request.headers.get("x-webhook-signature")??request.headers.get("x-signature");
  const secret=kapsoWebhookSecret();
  if((!secret&&process.env.KAPSO_ALLOW_UNSIGNED!=="true")||(secret&&(!signature||!(await verifyKapsoSignature(raw,signature))))){set.status=401;return{ok:false,error:"invalid webhook signature"}}
  let payload:any;try{payload=JSON.parse(raw)}catch{set.status=400;return{ok:false,error:"invalid json"}}
  lastKapsoWebhookAt=new Date().toISOString();
  const eventBody=payload?.request_body??payload;
  lastKapsoWebhookEvent=typeof eventBody?.event==="string"?eventBody.event:typeof eventBody?.type==="string"?eventBody.type:"unknown";
  const candidates:any[]=[];
  if(Array.isArray(eventBody?.messages))candidates.push(...eventBody.messages.map((m:any)=>({message:m,conversation:eventBody?.conversation??{}})));
  if(eventBody?.message)candidates.push({message:eventBody.message,conversation:eventBody?.conversation??eventBody?.data?.conversation??{}});
  if(eventBody?.data?.message)candidates.push({message:eventBody.data.message,conversation:eventBody?.data?.conversation??eventBody?.conversation??{}});
  if(Array.isArray(eventBody?.data?.messages))candidates.push(...eventBody.data.messages.map((m:any)=>({message:m,conversation:eventBody?.data?.conversation??eventBody?.conversation??{}})));
  for(const message of extractIncomingMessages(eventBody))candidates.push({message,conversation:{phone_number:message.from}});
  if(!candidates.length){console.warn(JSON.stringify({event:"rafig_kapso_webhook_ignored",reason:"no_message",eventType:lastKapsoWebhookEvent,hasRequestBody:Boolean(payload?.request_body)}));set.status=200;return{ok:true,status:"ignored_no_message"}}
  const results=[];for(const item of candidates){results.push(await processKapsoMessage(item.message,item.conversation))}
  return{ok:true,status:"processed",results};
}).get("/api/webhooks/webhook/:webhookId",({params})=>({ok:true,status:"webhook_endpoint_ready",webhookId:String(params.webhookId??""),provider:"kapso",acceptedMethod:"POST"}))
.post("/api/webhooks/webhook/:webhookId",async({request,set})=>{
  const raw=await request.text();
  if(raw.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}
  const signature=request.headers.get("x-kapso-signature")??request.headers.get("x-webhook-signature")??request.headers.get("x-signature");
  const secret=kapsoWebhookSecret();
  if((!secret&&process.env.KAPSO_ALLOW_UNSIGNED!=="true")||(secret&&(!signature||!(await verifyKapsoSignature(raw,signature))))){set.status=401;return{ok:false,error:"invalid webhook signature"}}
  let payload:any;try{payload=JSON.parse(raw)}catch{set.status=400;return{ok:false,error:"invalid json"}}
  lastKapsoWebhookAt=new Date().toISOString();
  const eventBody=payload?.request_body??payload;
  lastKapsoWebhookEvent=typeof eventBody?.event==="string"?eventBody.event:typeof eventBody?.type==="string"?eventBody.type:"unknown";
  const candidates:any[]=[];
  if(Array.isArray(eventBody?.messages))candidates.push(...eventBody.messages.map((m:any)=>({message:m,conversation:eventBody?.conversation??{}})));
  if(eventBody?.message)candidates.push({message:eventBody.message,conversation:eventBody?.conversation??eventBody?.data?.conversation??{}});
  if(eventBody?.data?.message)candidates.push({message:eventBody.data.message,conversation:eventBody?.data?.conversation??eventBody?.conversation??{}});
  if(Array.isArray(eventBody?.data?.messages))candidates.push(...eventBody.data.messages.map((m:any)=>({message:m,conversation:eventBody?.data?.conversation??eventBody?.conversation??{}})));
  for(const message of extractIncomingMessages(eventBody))candidates.push({message,conversation:{phone_number:message.from}});
  if(!candidates.length){console.warn(JSON.stringify({event:"rafig_kapso_webhook_ignored",reason:"no_message",eventType:lastKapsoWebhookEvent,hasRequestBody:Boolean(payload?.request_body)}));set.status=200;return{ok:true,status:"ignored_no_message"}}
  const results=[];for(const item of candidates){results.push(await processKapsoMessage(item.message,item.conversation))}
  return{ok:true,status:"processed",results};
})
.post("/api/telegram/webhook",async({request,set})=>{
  if(!telegramConfigured()){set.status=503;return{ok:false,error:"Telegram bot is not configured"}}
  if(!verifyTelegramWebhookSecret(request)){set.status=401;return{ok:false,error:"invalid Telegram webhook secret"}}
  const update=await request.json().catch(()=>null) as any;
  const channelPost=update?.channel_post;
  if(channelPost?.chat?.id){
    console.log(JSON.stringify({event:"rafig_telegram_channel_seen",chatId:String(channelPost.chat.id),title:channelPost.chat.title??null,username:channelPost.chat.username??null}));
    return{ok:true,status:"channel_post_seen",channel_id:String(channelPost.chat.id)};
  }
  const message=update?.message;
  const chatId=message?.chat?.id;
  if(!chatId)return{ok:true,status:"ignored_no_chat"};
  const externalConversationId=String(chatId);
  const senderName=[message?.from?.first_name,message?.from?.last_name].filter(Boolean).join(" ").trim();
  const username=typeof message?.from?.username==="string"?message.from.username:"";
  const textBody=typeof message?.text==="string"?message.text.trim():"";
  try{
    const existing=await supabaseServerRest("/rest/v1/rafiq_conversations?channel=eq.telegram&external_conversation_id=eq."+encodeURIComponent(externalConversationId)+"&select=id,context&limit=1");
    const row=Array.isArray(existing.body)?existing.body[0]:null;
    const previousContext=Array.isArray(row?.context)?row.context:[];
    const incomingMessageId=String(message?.message_id??"").trim();
    if(incomingMessageId && previousContext.some((item:any)=>item?.direction==="inbound" && String(item?.message_id??"")===incomingMessageId)){
      return{ok:true,status:"duplicate_update_ignored",conversation_id:row?.id??null};
    }
    const contextMessage={channel:"telegram",direction:"inbound",message_id:incomingMessageId||null,chat_id:chatId,telegram_user_id:message?.from?.id??null,username,sender_name:senderName,text:textBody||null,received_at:new Date().toISOString()};
    const nextContext=[...previousContext,contextMessage].slice(-20);
    let conversationId=row?.id??null;
    if(conversationId){
      await supabaseServerRest("/rest/v1/rafiq_conversations?id=eq."+encodeURIComponent(conversationId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({context:nextContext,updated_at:new Date().toISOString(),last_message_at:new Date().toISOString()})});
    }else{
      const created=await supabaseServerRest("/rest/v1/rafiq_conversations?on_conflict=channel%2Cexternal_conversation_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify({channel:"telegram",external_conversation_id:externalConversationId,customer_phone:null,language:"ar",context:nextContext,escalation_state:"none",last_message_at:new Date().toISOString()})});
      const createdRow=Array.isArray(created.body)?created.body[0]:created.body;
      conversationId=createdRow?.id??null;
    }

    const orders=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders?chat_id=eq."+encodeURIComponent(externalConversationId)+"&order_status=not.in.(completed,cancelled)&select=*&order=updated_at.desc&limit=1");
    const activeOrder=Array.isArray(orders.body)?orders.body[0]:null;

    const reply=async(body:string)=>{const outbound=await telegramSendText(chatId,telegramSigned(body));if(conversationId)await supabaseServerRest("/rest/v1/rafiq_conversations?id=eq."+encodeURIComponent(conversationId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({context:[...nextContext,{channel:"telegram",direction:"outbound",text:body,sent_at:new Date().toISOString()}].slice(-20),updated_at:new Date().toISOString(),last_message_at:new Date().toISOString()})}).catch(()=>{});return outbound;};

    const managerChatIds = parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS);
    const managerHandled = await handleManagerCommand(
      { chatId, chatType: message?.chat?.type, text: textBody },
      {
        managerChatIds,
        rpc: async (fn, args) => {
          const r = await supabaseServerRest("/rest/v1/rpc/" + fn, {
            method: "POST",
            body: JSON.stringify(args),
          });
          if (r.response.ok) return { data: r.body, error: null };

          // Fallback for read-only manager lists if PostgREST has a stale RPC signature/cache.
          if (fn === "manager_folder_counts") {
            const q = await supabaseServerRest("/rest/v1/admin_application_folder_counts?select=category,folder,total&order=category.asc,folder.asc");
            if (q.response.ok) return { data: q.body, error: null };
          }
          if (fn === "manager_list_applications") {
            const category = String(args.p_category ?? "");
            const folder = String(args.p_folder ?? "");
            const limit = Math.min(Math.max(Number(args.p_limit ?? 20), 1), 50);
            const q = await supabaseServerRest(
              "/rest/v1/admin_application_folders?select=application_number,membership_number,applicant_name,category,folder,area,specialty,created_at" +
              "&category=eq." + encodeURIComponent(category) +
              "&folder=eq." + encodeURIComponent(folder) +
              "&order=created_at.desc&limit=" + String(limit)
            );
            if (q.response.ok) return { data: q.body, error: null };
          }
          const detail = typeof r.body === "object" && r.body
            ? String(r.body.message ?? r.body.error_description ?? r.body.hint ?? "manager RPC failed")
            : "manager RPC failed";
          console.error(JSON.stringify({event:"rafig_telegram_manager_rpc_failed",function:fn,status:r.response.status,detail:detail.slice(0,300)}));
          return { data: null, error: { message: detail } };
        },
        send: (c, body) => telegramSendText(c, telegramSigned(body)),
        photoUrl: async (storagePath) => {
          const encoded = storagePath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
          const r = await supabaseServerRest("/storage/v1/object/sign/private_documents/" + encoded, {
            method: "POST",
            body: JSON.stringify({ expiresIn: 600 }),
          });
          if (!r.response.ok) throw new Error("could not sign manager photo");
          return r.body?.signedURL ?? r.body?.signedUrl ?? null;
        },
        sendPhoto: (c, url, caption) => telegramSendPhoto(c, url, caption),
      },
    );
    if (managerHandled) return { ok: true, status: "manager_command_handled" };

    if(textBody && rafiqRequiresHumanReply(textBody)){
      const payload={channel:"telegram",chat_id:chatId,message_id:message?.message_id??null,username,sender_name:senderName,incoming_text:textBody,reason:"human_reply_required",status:"open"};
      if(conversationId) await supabaseServerRest("/rest/v1/whatsapp_pending_approvals",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({conversation_id:conversationId,reason:"telegram_human_reply_required",status:"open",payload})}).catch(()=>{});
      const managers=parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS);
      const managerNotice="🔔 طلب يحتاج رد الإدارة\\n\\nمن Telegram: "+(senderName||"غير معروف")+"\\nالمحادثة: "+String(chatId)+"\\n\\nرسالة العميل:\\n"+textBody+"\\n\\n⚠️ لم يتم إرسال رد تلقائي للعميل.";
      for(const managerId of managers){ await telegramSendText(managerId,telegramSigned(managerNotice)).catch(()=>{}); }
      return{ok:true,status:"human_reply_required_no_auto_reply",conversation_id:conversationId};
    }

    const document = message?.document;
    const photo = Array.isArray(message?.photo) && message.photo.length ? message.photo[message.photo.length-1] : null;
    if(document || photo){
      if(activeOrder && activeOrder.order_status==="collecting" && !activeOrder.old_cv_file_id){
        const fileId=String(document?.file_id??photo?.file_id??"");
        const upd=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(activeOrder.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({old_cv_file_id:fileId,order_status:"awaiting_payment",updated_at:new Date().toISOString()})});
        if(!upd.response.ok)throw new Error("could not save old CV file");
        await reply(cvPaymentText(Number(activeOrder.amount_usd)));
        return{ok:true,status:"cv_old_file_received",order_id:activeOrder.id};
      }
      if(activeOrder && (activeOrder.order_status==="awaiting_payment" || activeOrder.payment_status==="pending_payment")){
        const fileId=String(document?.file_id??photo?.file_id??"");
        const proofType=document?"document":"photo";
        const upd=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(activeOrder.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({payment_proof_file_id:fileId,payment_proof_type:proofType,payment_status:"proof_submitted",order_status:"payment_review",updated_at:new Date().toISOString()})});
        if(!upd.response.ok)throw new Error("could not save payment proof");
        await reply("✅ تم استلام إثبات الدفع. طلبك الآن «بانتظار تأكيد الدفع» من إدارة رفيق. لن يتم تسليم النسخة النهائية قبل التأكيد.");
        return{ok:true,status:"cv_payment_proof_received",order_id:activeOrder.id};
      }
      await reply("📎 أرسل الملف ضمن طلب CV بعد اختيار الخدمة، وسأحفظه ضمن الطلب. لا ترسل كلمات مرور أو رموز OTP.");
      return{ok:true,status:"file_without_active_cv"};
    }

    if(!textBody)return{ok:true,status:"ignored_non_text"};

    const commandReply=telegramCommandReply(textBody);
    if(commandReply){
      const welcomeOnStart=textBody.toLowerCase().split(" ")[0]==="/start";
      const outbound=await reply(welcomeOnStart?TELEGRAM_WELCOME:commandReply);
      return{ok:true,status:"command_replied",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }

    const choice=cvChoice(textBody);
    const startsCv=/^(cv|السيرة|cover\s*letter|سيرة ذاتية|1|2|3)$/i.test(textBody.trim()) || choice!==null;
    if(startsCv && !activeOrder){
      if(!choice){await reply(cvMenuText());return{ok:true,status:"cv_menu"}}
      const created=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({chat_id:externalConversationId,telegram_user_id:String(message?.from?.id??""),username,service:choice.service,amount_usd:choice.amount,order_status:"collecting",payment_status:"pending_payment"})});
      if(!created.response.ok)throw new Error("could not create CV order");
      const order=Array.isArray(created.body)?created.body[0]:created.body;
      await reply("✅ اخترت خدمة "+choice.service+".\n\n"+cvPrompt("name"));
      return{ok:true,status:"cv_started",order_id:order?.id??null};
    }

    if(activeOrder){
      if(activeOrder.order_status==="payment_review"){
        await reply("⏳ إثبات الدفع وصل إلى إدارة رفيق وهو قيد المراجعة. لا حاجة لإرسال دفعة أخرى الآن.");
        return{ok:true,status:"cv_payment_under_review",order_id:activeOrder.id};
      }
      if(activeOrder.order_status==="awaiting_payment"){
        await reply(cvPaymentText(Number(activeOrder.amount_usd)));
        return{ok:true,status:"cv_awaiting_payment",order_id:activeOrder.id};
      }
      const patch:any={updated_at:new Date().toISOString()};
      let prompt="";
      if(!activeOrder.full_name){patch.full_name=textBody;prompt=cvPrompt("target");}
      else if(!activeOrder.target_job){patch.target_job=textBody;prompt=cvPrompt("experience");}
      else if(!activeOrder.experience){patch.experience=textBody;prompt=cvPrompt("languages");}
      else if(activeOrder.extra_language===null || activeOrder.extra_language===undefined){
        patch.extra_language=/^(لا|لا يوجد|none|no)$/i.test(textBody)?"":textBody;
        if(patch.extra_language)patch.amount_usd=Number(activeOrder.amount_usd)+20;
        prompt=cvPrompt("oldcv");
      }else if(!activeOrder.old_cv_file_id && /^(لا|لا يوجد|none|no)$/i.test(textBody)){
        patch.order_status="awaiting_payment";prompt=cvPaymentText(Number(activeOrder.amount_usd));
      }else if(!activeOrder.old_cv_file_id){
        await reply("📎 أرسل ملف الـCV القديم هنا، أو اكتب «لا يوجد» إذا لم يكن لديك ملف.");
        return{ok:true,status:"cv_waiting_old_file",order_id:activeOrder.id};
      }
      const upd=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders?id=eq."+encodeURIComponent(activeOrder.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(patch)});
      if(!upd.response.ok)throw new Error("could not update CV order");
      if(prompt)await reply(prompt);
      return{ok:true,status:"cv_step_updated",order_id:activeOrder.id};
    }

    const conversationHistory=nextContext.map((item:any)=>item.direction==="outbound"?`RAFIQ: ${item.text}`:`Customer: ${item.text}`).join("\n");
    const directKnowledge=answerRafiqKnowledge(textBody);
    let result;
    try{if(directKnowledge){result={reply:directKnowledge,model:"rafig-knowledge"}}else{result=await draftAgentReply(textBody,"ar","TELEGRAM ACTIVE CASE | Chat ID: "+chatId+" | Customer: "+(senderName||"unknown")+" | Recent conversation:\n"+conversationHistory+" | POLICY: Reply in clear natural Arabic. Understand meaning, answer first, ask at most ONE useful next question. Never repeat information already supplied. For human/admin action, clearly provide WhatsApp +961 81 506 299. Never claim payment, approval, transfer, booking or availability without confirmation.")}}catch(agentError){console.error(JSON.stringify({event:"rafig_telegram_agent_failed",error:String(agentError).slice(0,300)}));result={reply:rafiqFallback(textBody,conversationHistory),model:"rafig-local-fallback"}}
    const escalation=result.reply.includes("WhatsApp")||result.reply.includes("واتساب")||result.reply.includes("الإدارة")||result.reply.includes("ادارة رفيق")||result.reply.includes("قرار إداري")||result.reply.includes("تواصل مع فريق رفيق");
    const payload={channel:"telegram",chat_id:chatId,message_id:message?.message_id??null,username,sender_name:senderName,incoming_text:textBody,draft_reply:result.reply,model:result.model,escalation};
    if(escalation && conversationId)await supabaseServerRest("/rest/v1/whatsapp_pending_approvals",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({conversation_id:conversationId,reason:"telegram_admin_escalation",status:"open",payload})}).catch(()=>{});
    const outbound=await reply(result.reply);
    return{ok:true,status:escalation?"auto_replied_and_escalated":"auto_replied",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
  }catch(error){
    console.error(JSON.stringify({event:"rafig_telegram_webhook_failed",error:String(error).slice(0,500)}));
    set.status=500;return{ok:false,error:"Telegram message processing failed"};
  }
})
.get("/api/telegram/status",async({set})=>{
  if(!telegramConfigured()){set.status=503;return{ok:false,configured:false}}
  try{const info=await telegramGetWebhookInfo();return{ok:true,configured:true,webhook:info?.result??null,autoReply:true}}catch{set.status=502;return{ok:false,configured:true,error:"Telegram API unavailable"}}
})
.post("/api/telegram/register-webhook",async({request,set})=>{
  if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}
  if(!telegramConfigured()){set.status=503;return{ok:false,error:"Telegram bot token is not configured"}}
  const base=(process.env.PUBLIC_BASE_URL??"https://rafiq-o6qd.onrender.com").replace(/\/$/,"");
  try{
    const result=await telegramSetWebhook(base+"/api/telegram/webhook",telegramWebhookSecret()||undefined);
    return{ok:true,webhookUrl:base+"/api/telegram/webhook",result};
  }catch{set.status=502;return{ok:false,error:"Telegram webhook registration failed"}}
})
.get("/api/channels",()=>({
  ok:true,
  website:RAFIQ_WEBSITE,
  telegramBot:RAFIQ_TELEGRAM_BOT,
  telegramInvite:RAFIQ_TELEGRAM_INVITE,
  telegramChannel:RAFIQ_TELEGRAM_CHANNEL,
  whatsapp:RAFIQ_WHATSAPP,
  whatsappNumber:RAFIQ_WHATSAPP_NUMBER,
  whatsappChannel:RAFIQ_WHATSAPP_CHANNEL_URL
}))
.post("/api/admin/telegram/broadcast",async({request,set})=>{
  if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}
  if(!telegramConfigured()){set.status=503;return{ok:false,error:"Telegram bot is not configured"}}
  let input:any;try{input=await request.json().catch(()=>null)}catch{input=null}
  const body=typeof input?.body==="string"?input.body.trim():TELEGRAM_ANNOUNCEMENT;
  const announcementKey=typeof input?.announcementKey==="string"&&input.announcementKey.trim()?input.announcementKey.trim():TELEGRAM_ANNOUNCEMENT_KEY;
  if(!body||body.length>4096){set.status=400;return{ok:false,error:"invalid announcement body"}}
  try{
    const result=await broadcastTelegramAnnouncement(announcementKey,body);
    return{ok:true,result};
  }catch(error){set.status=502;return{ok:false,error:"Telegram broadcast failed"}}
})
.post("/api/admin/whatsapp/family-announcement-draft",async({request,set})=>{
  if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}
  const channelUrl=RAFIQ_WHATSAPP_CHANNEL_URL;
  const message=[
    "📣 رفيق | RAFIQ 🇱🇧",
    "منصة رفيق تساعد الأهل في لبنان على الوصول إلى خدمات الرعاية داخل المنزل:",
    "👴 رعاية كبار السن",
    "🏠 رعاية المرضى",
    "👩‍⚕️ التمريض المنزلي",
    "🦿 العلاج الفيزيائي المنزلي",
    "",
    "يمكنكم طرح أسئلتكم على بوت رفيق في Telegram، وعند الحاجة إلى مراجعة أو معلومات حساسة يتم التواصل مع إدارة رفيق عبر WhatsApp.",
    "",
    "🤖 Telegram Bot: " + RAFIQ_TELEGRAM_BOT,
    "📢 Telegram Channel: " + RAFIQ_TELEGRAM_CHANNEL,
    "🌐 الموقع: " + RAFIQ_WEBSITE,
    "📱 WhatsApp: " + RAFIQ_WHATSAPP
  ];
  if(channelUrl) message.splice(9,0,"📢 WhatsApp Channel: "+channelUrl);
  return{ok:true,message:message.join("\n"),whatsappNumber:RAFIQ_WHATSAPP_NUMBER,telegramBot:RAFIQ_TELEGRAM_BOT,telegramChannel:RAFIQ_TELEGRAM_CHANNEL,whatsappChannelUrl:channelUrl||null,humanApprovalRequired:true,sendingPerformed:false};
})
.get("/api/status",()=>({ok:true,platform:"RAFIQ | رفيق",mode:kapsoConfigured()?"kapso-agent-ready":"meta-cloud-api-ready",kapsoConfigured:kapsoConfigured(),kapsoEnabled:process.env.KAPSO_ENABLED==="true",kapsoWebhookSecretConfigured:Boolean(kapsoWebhookSecret()),kapsoWebhookLastReceivedAt:lastKapsoWebhookAt,kapsoWebhookLastEvent:lastKapsoWebhookEvent,whatsappSending:process.env.WHATSAPP_SENDING_ENABLED==="true",whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",whatsappWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN&&process.env.META_APP_SECRET),whatsappOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN&&process.env.META_PHONE_NUMBER_ID),openAIConfigured:Boolean(process.env.OPENAI_API_KEY),agentModel:effectiveAgentModel(),channelMode:"agent-draft-admin-publish",proactiveMessagesRequireApproval:true}))
.post("/api/admin/send-approved-welcome",async({request,set})=>{
  if(process.env.WHATSAPP_SENDING_ENABLED!=="true"||!kapsoConfigured()){
    set.status=503;return{ok:false,error:"Kapso WhatsApp sending is not configured"};
  }
  const token=bearerToken(request);
  if(!token){set.status=401;return{ok:false,error:"missing authorization"}}
  let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}
  const applicationId=typeof input?.applicationId==="string"?input.applicationId.trim():"";
  if(!/^[0-9a-f-]{36}$/i.test(applicationId)){set.status=400;return{ok:false,error:"invalid application id"}}
  const me=await supabaseRest("/auth/v1/user",token,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY}});
  if(!me.response.ok||!me.body?.id){set.status=401;return{ok:false,error:"invalid session"}}
  const prof=await supabaseRest("/rest/v1/profiles?id=eq."+encodeURIComponent(me.body.id)+"&select=id,role,status",token);
  const profile=Array.isArray(prof.body)?prof.body[0]:null;
  if(!prof.response.ok||!profile||profile.role!=="admin"||profile.status!=="active"){
    set.status=403;return{ok:false,error:"admin access required"};
  }
  let out=await supabaseRest("/rest/v1/whatsapp_outbox?application_id=eq."+encodeURIComponent(applicationId)+"&status=eq.pending&select=id,recipient,message,qr_payload&limit=1",token);
  let row=Array.isArray(out.body)?out.body[0]:null;
  if(!out.response.ok){set.status=502;return{ok:false,error:"could not load approval message"}}
  if(!row){
    out=await supabaseRest("/rest/v1/whatsapp_outbox?intake_id=eq."+encodeURIComponent(applicationId)+"&status=eq.pending&select=id,recipient,message,qr_payload&limit=1",token);
    row=Array.isArray(out.body)?out.body[0]:null;
  }
  if(!row){
    let sent=await supabaseRest("/rest/v1/whatsapp_outbox?application_id=eq."+encodeURIComponent(applicationId)+"&status=eq.sent&select=id,provider_message_id&limit=1",token);
    if(!Array.isArray(sent.body)||!sent.body[0]) sent=await supabaseRest("/rest/v1/whatsapp_outbox?intake_id=eq."+encodeURIComponent(applicationId)+"&status=eq.sent&select=id,provider_message_id&limit=1",token);
    if(Array.isArray(sent.body)&&sent.body[0]) return{ok:true,status:"already_sent",messageId:sent.body[0].provider_message_id??null};
    set.status=404;return{ok:false,error:"no pending approval message"};
  }
  try{
    const result=await kapsoSendText(String(row.recipient),String(row.message));
    const messageId=result?.messages?.[0]?.id??null;
    const mark=await supabaseRest("/rest/v1/rpc/admin_mark_outbox_sent",token,{method:"POST",body:JSON.stringify({p_outbox_id:row.id,p_provider_message_id:messageId})});
    if(!mark.response.ok){set.status=502;return{ok:false,error:"message sent but outbox status could not be updated",messageId}}
    return{ok:true,status:"sent",messageId,barcodeUrl:row.qr_payload??null};
  }catch(error){
    await supabaseRest("/rest/v1/rpc/admin_mark_outbox_failed",token,{method:"POST",body:JSON.stringify({p_outbox_id:row.id,p_error:String(error)})});
    set.status=502;return{ok:false,error:"Kapso WhatsApp send failed"};
  }
})
.post("/api/kapso/send-text",async({request,set})=>{if(process.env.KAPSO_ENABLED!=="true"){set.status=503;return{ok:false,error:"Kapso sending is disabled"}}if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const to=typeof input?.to==="string"?input.to.trim():"",body=typeof input?.body==="string"?input.body.trim():"";if(!to||!/^[0-9]{8,15}$/.test(to)||!body||body.length>4096||input?.humanApproved!==true){set.status=input?.humanApproved===true?400:409;return{ok:false,error:input?.humanApproved===true?"invalid recipient or message":"human approval required"}}try{const result=await kapsoSendText(to,body);return{ok:true,messageId:result?.messages?.[0]?.id??null}}catch{set.status=502;return{ok:false,error:"Kapso WhatsApp API request failed"}}})
.get("/api/whatsapp/webhook",({query,set})=>{const mode=query["hub.mode"],token=query["hub.verify_token"],challenge=query["hub.challenge"],verifyToken=process.env.META_VERIFY_TOKEN;if(mode==="subscribe"&&verifyToken&&token===verifyToken&&challenge)return challenge;set.status=403;return{ok:false,error:"webhook verification failed"}})
.post("/api/whatsapp/webhook",async({request,set})=>{
  const raw=await request.text();
  if(raw.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}
  const signature=request.headers.get("x-hub-signature-256");
  if(process.env.META_APP_SECRET){
    if(!(await verifyMetaSignature(raw,signature))){set.status=401;return{ok:false,error:"invalid Meta webhook signature"}}
  }
  let payload:any;try{payload=JSON.parse(raw)}catch{set.status=400;return{ok:false,error:"invalid json"}}
  if(String(payload?.object??"")!=="whatsapp_business_account"){set.status=200;return{ok:true,status:"ignored_non_whatsapp_object"}}
  const messages=extractIncomingMessages(payload);
  if(!messages.length){set.status=200;return{ok:true,status:"received_no_messages"}}
  if(process.env.KAPSO_ENABLED==="true"){
    console.log(JSON.stringify({event:"rafig_meta_webhook_received_kapso_primary",messageCount:messages.length}));
    set.status=200;return{ok:true,status:"received_kapso_primary",messageCount:messages.length};
  }
  const results=[];
  for(const message of messages){
    const identity={phone:message.from,bsuid:"",username:""};
    results.push(await processKapsoMessage(message,identity));
  }
  return{ok:true,status:"processed",results};
})
.post("/api/agent/chat",async({request,set})=>{const started=Date.now();console.log(JSON.stringify({event:"rafig_agent_chat_received"}));let input:any;try{input=await request.json()}catch{set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_json"}));return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>4000){set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_message"}));return{ok:false,error:"invalid message"}}try{const result=await draftInboundReply(message);console.log(JSON.stringify({event:"rafig_agent_chat_completed",model:result.model,durationMs:Date.now()-started}));return{ok:true,reply:result.reply,model:result.model}}catch(error){console.error(JSON.stringify({event:"rafig_agent_chat_failed",error:String(error).slice(0,160),durationMs:Date.now()-started}));return{ok:true,reply:rafiqFallback(message),model:"rafig-local-fallback"}}})
.post("/api/agent/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>8000){set.status=400;return{ok:false,error:"invalid message"}}try{const result=await draftAgentReply(message,typeof input?.language==="string"?input.language:undefined);return{ok:true,draft:result.reply,model:result.model,humanApprovalRequired:true}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/agent/outreach-draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const target=input?.target;if(target!=="laboratory"&&target!=="medical_equipment_supplier"&&target!=="radiology_center"){set.status=400;return{ok:false,error:"invalid outreach target"}}const institutionName=typeof input?.institutionName==="string"?input.institutionName.trim():"",language=typeof input?.language==="string"?input.language.trim():"";if(institutionName.length>200||language.length>40){set.status=400;return{ok:false,error:"invalid input"}}try{const result=await draftInstitutionOutreach(target,institutionName,language||undefined);return{ok:true,target,institutionName:institutionName||null,draft:result.reply,model:result.model,humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/channel/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const topic=typeof input?.topic==="string"?input.topic.trim():"",language=typeof input?.language==="string"?input.language.trim():"ar";if(!topic||topic.length>4000||language.length>40){set.status=400;return{ok:false,error:"invalid topic or language"}}try{const result=await draftAgentReply(`Prepare a public WhatsApp Channel post for the official RAFIQ | رفيق channel.\nLanguage: ${language}\nTopic: ${topic}\nAudience: families, caregivers, nurses, healthcare institutions, laboratories, medical equipment suppliers, and radiology centers.\nThe post must be informative, professional, concise, and suitable for a public one-way channel. Do not claim that a partnership, booking, payment, referral, approval, or service has already happened unless explicitly stated in the topic. Do not expose private information. Return only the ready-to-review channel post.`);return{ok:true,draft:result.reply,model:result.model,channel:"RAFIQ official WhatsApp Channel",publishMode:"manual-admin",humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/whatsapp/send-text",async({request,set})=>{if(process.env.WHATSAPP_SENDING_ENABLED!=="true"){set.status=503;return{ok:false,error:"WhatsApp sending is disabled"}}if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const to=typeof input?.to==="string"?input.to.trim():"",body=typeof input?.body==="string"?input.body.trim():"";if(!to||!/^[0-9]{8,15}$/.test(to)||!body||body.length>4096){set.status=400;return{ok:false,error:"invalid recipient or message"}}if(input?.humanApproved!==true){set.status=409;return{ok:false,error:"human approval required"}}try{const result=await sendWhatsAppText(to,body);return{ok:true,messageId:result?.messages?.[0]?.id??null}}catch{set.status=502;return{ok:false,error:"WhatsApp provider request failed"}}})
.get("/",()=>fileResponse("public/index.html","text/html; charset=utf-8","no-store"))
.get("/agent.html",()=>fileResponse("public/agent.html","text/html; charset=utf-8","no-store"))
.get("/admin",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin/",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.html",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.js",()=>fileResponse("public/admin.js","application/javascript","no-cache"))
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
.get("/intake-admin.js",()=>fileResponse("public/intake-admin.js","application/javascript","no-cache"))
.get("/manifest.webmanifest",()=>fileResponse("public/manifest.webmanifest","application/manifest+json")).get("/rafig-approved-logo.jpg",()=>fileResponse("public/rafig-approved-logo.jpg","image/jpeg","no-cache")).get("/rafig-approved-logo-192.jpg",()=>fileResponse("public/rafig-approved-logo-192.jpg","image/jpeg","no-cache")).get("/rafig-approved-logo-512.jpg",()=>fileResponse("public/rafig-approved-logo-512.jpg","image/jpeg","no-cache"))
.get("/sitemap.xml",()=>fileResponse("public/sitemap.xml","application/xml; charset=utf-8","no-store"))
.get("/*",async({request,set})=>{const pathname=new URL(request.url).pathname;if(pathname==="/"||pathname.startsWith("/api/")){set.status=404;return{ok:false,error:"not found"}}let decoded="";try{decoded=decodeURIComponent(pathname)}catch{set.status=400;return{ok:false,error:"invalid path"}}if(!decoded.startsWith("/")||decoded.includes("..")||!/^[A-Za-z0-9._~!$&'()*+,;=:@%\\/-]+$/.test(decoded)){set.status=404;return{ok:false,error:"not found"}}const ext=decoded.split(".").pop()?.toLowerCase()??"";const mime:Record<string,string>={js:"application/javascript; charset=utf-8",css:"text/css; charset=utf-8",json:"application/json; charset=utf-8",webmanifest:"application/manifest+json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",txt:"text/plain; charset=utf-8",xml:"application/xml; charset=utf-8",woff:"font/woff",woff2:"font/woff2",map:"application/json; charset=utf-8"};if(!mime[ext]){set.status=404;return{ok:false,error:"not found"}}return fileResponse("public"+decoded,mime[ext],"no-cache")})
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
app.listen(port);
console.log(`RAFIQ server listening on ${app.server?.hostname}:${app.server?.port}`);
void registerTelegramWebhookOnStartup();
setTimeout(() => {
  if(process.env.TELEGRAM_BROADCAST_ON_START!=="true") return;
  void broadcastTelegramAnnouncement(TELEGRAM_ONBOARDING_KEY, TELEGRAM_ONBOARDING_MESSAGE, TELEGRAM_ANNOUNCEMENT_CUTOFF)
    .then(result => console.log(JSON.stringify({event:"rafig_telegram_onboarding_broadcast",...result})))
    .catch(error => console.error(JSON.stringify({event:"rafig_telegram_onboarding_broadcast_failed",error:String(error).slice(0,300)})));
}, 1500);


console.log(JSON.stringify({
  event:"rafig_runtime_configuration",
  openAIConfigured:Boolean(process.env.OPENAI_API_KEY),
  metaWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
  metaOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
  whatsappSendingEnabled:process.env.WHATSAPP_SENDING_ENABLED==="true",
  whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",
  agentModel:effectiveAgentModel(),
  kapsoConfigured:kapsoConfigured(),
  kapsoWebhookSecretConfigured:Boolean(kapsoWebhookSecret())
}));
