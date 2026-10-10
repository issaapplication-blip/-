import { Elysia } from "elysia";
import { answerRafiqKnowledge } from "./rafiq-service-knowledge";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";
import { kapsoConfigured, kapsoSendText, kapsoWebhookSecret } from "./kapso";
import { rafiqFallback } from "./rafiq-local-agent";
import { telegramConfigured, telegramGetWebhookInfo, telegramSendText, telegramSendDocument, telegramSendPhoto, telegramSendContactRequest, telegramAnswerCallbackQuery, telegramSetWebhook, telegramWebhookSecret, verifyTelegramWebhookSecret } from "./telegram";
import { cvChoice, cvMenuText, cvPaymentText, cvPrompt } from "./telegram-cv";
import { sendMessage } from "./messaging-service";
import { RAFIQ_CONFIG } from "./rafiq-config";
import QRCode from "qrcode";
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
const MAX_PUBLIC_INTAKE_BODY = 18 * 1024 * 1024;
const PUBLIC_INTAKE_RATE_LIMIT_MS = 15_000;
const PUBLIC_INTAKE_RATE_MAX_KEYS = 10_000;
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
    const inbound=await recordInboundEvent(message,identity,"kapso");if(inbound?.duplicate){console.log(JSON.stringify({event:"rafig_kapso_duplicate_ignored",messageId:String(message?.id??"")}));return{id:String(message?.id??"unknown"),status:"duplicate_ignored"}}
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
};const processMetaMessageCore=async(message:any)=>{
  const identity={phone:typeof message?.from==="string"?message.from:""};
  const forbiddenDigits="70600157";
  if(identity.phone?.replace(/\D/g,"").endsWith(forbiddenDigits))return{id:String(message?.id??"unknown"),status:"blocked_forbidden_number"};
  const body=typeof message?.text?.body==="string"?message.text.body.trim():"";
  if(!body||!identity.phone)return{id:String(message?.id??"unknown"),status:"ignored_missing_identity_or_text"};
  try{
    const inbound=await recordInboundEvent(message,identity,"meta");
    if(inbound?.duplicate)return{id:String(message?.id??"unknown"),status:"duplicate_ignored"};
    console.log(JSON.stringify({event:"rafig_meta_inbound_persisted",messageId:String(message.id??""),inboundId:inbound?.id??null}));
    await forwardWhatsAppToTelegramManager(message,identity,body);
    const result=await draftInboundReply(body,identity.phone);
    if(process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true"&&process.env.WHATSAPP_SENDING_ENABLED==="true"){
      try{
        const outbound=kapsoConfigured()?await kapsoSendText({to:identity.phone},result.reply):await sendWhatsAppText(identity.phone,result.reply);
        await recordOutboundMessage(identity.phone,result.reply,outbound);
        await updateInboundEvent(String(message.id??""),"processed",undefined,"meta");
        return{id:String(message.id??""),status:"auto_replied",outboundMessageId:outbound?.messages?.[0]?.id??null};
      }catch(error){
        await updateInboundEvent(String(message.id??""),"failed",String(error).slice(0,500),"meta").catch(()=>{});
        return{id:String(message.id??""),status:"draft_ready_send_failed"};
      }
    }
    await updateInboundEvent(String(message.id??""),"processed",undefined,"meta");
    return{id:String(message.id??""),status:"draft_ready"};
  }catch(error){
    await updateInboundEvent(String(message.id??""),"failed",String(error).slice(0,500),"meta").catch(()=>{});
    console.error(JSON.stringify({event:"rafig_meta_webhook_failed",messageId:String(message?.id??""),error:String(error)}));
    return{id:String(message?.id??""),status:"draft_failed"};
  }
};
const processMetaMessage=async(message:any)=>{
  const id=String(message?.id??"");
  if(id&&kapsoInFlight.has("meta:"+id))return{id,status:"duplicate_in_flight"};
  if(id)kapsoInFlight.add("meta:"+id);
  try{return await processMetaMessageCore(message)}finally{if(id)kapsoInFlight.delete("meta:"+id)}
};
const kapsoInFlight=new Set<string>();const processKapsoMessage=async(message:any,conversation:any={})=>{const id=String(message?.id??"");if(id&&kapsoInFlight.has(id))return{id,status:"duplicate_in_flight"};if(id)kapsoInFlight.add(id);try{return await processKapsoMessageCore(message,conversation)}finally{if(id)kapsoInFlight.delete(id)}};const extractIncomingMessages=(payload:any)=>{const messages:Array<{from:string;id:string;text?:string;type:string;timestamp?:string}>=[];for(const entry of payload?.entry??[])for(const change of entry?.changes??[])for(const message of change?.value?.messages??[])messages.push({from:String(message.from??""),id:String(message.id??""),text:typeof message.text?.body==="string"?message.text.body:undefined,type:String(message.type??"unknown"),timestamp:message.timestamp?String(message.timestamp):undefined});return messages};
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
const sendWhatsAppText=async(to:string,body:string)=>{const accessToken=process.env.META_ACCESS_TOKEN,phoneNumberId=process.env.META_PHONE_NUMBER_ID,apiVersion=process.env.META_GRAPH_API_VERSION??"v23.0";if(!accessToken||!phoneNumberId)throw new Error("WhatsApp Cloud API server configuration is incomplete");const response=await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body}})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Meta WhatsApp API error (${response.status})`);return result};
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
  if(/^\d+$/.test(clean))url="/rest/v1/application_intakes?application_number=eq."+encodeURIComponent(clean)+"&select=*&limit=1";
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
.get("/api/whatsapp/webhook",({query,set})=>{
  const mode=query["hub.mode"],token=query["hub.verify_token"],challenge=query["hub.challenge"],verifyToken=(process.env.META_VERIFY_TOKEN??"").trim();
  if(mode==="subscribe"&&verifyToken&&token===verifyToken&&challenge)return challenge;
  set.status=403;return{ok:false,error:"webhook verification failed"};
})
.post("/api/whatsapp/webhook",async({request,set})=>{
  const raw=await request.text();
  if(raw.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}
  const signature=request.headers.get("x-hub-signature-256");
  if(!(await verifyMetaSignature(raw,signature))){set.status=401;return{ok:false,error:"invalid webhook signature"}}
  let payload:any;try{payload=JSON.parse(raw)}catch{set.status=400;return{ok:false,error:"invalid json"}}
  if(payload?.object!=="whatsapp_business_account"){set.status=200;return{ok:true,status:"ignored_non_whatsapp_object"}}
  const messages=extractIncomingMessages(payload);
  if(!messages.length){set.status=200;return{ok:true,status:"ignored_no_incoming_messages"}}
  const results=[];
  for(const message of messages)results.push(await processMetaMessage(message));
  return{ok:true,status:"processed",results};
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
  const callback=update?.callback_query;
  if(callback?.id){
    const callbackChatId=callback?.message?.chat?.id;
    const data=String(callback?.data??"");
    await telegramAnswerCallbackQuery(String(callback.id)).catch(()=>{});
    if(callbackChatId){
      const sessionQ=await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions?chat_id=eq."+encodeURIComponent(String(callbackChatId))+"&status=eq.collecting&order=updated_at.desc&limit=1&select=*");
      const session=Array.isArray(sessionQ.body)?sessionQ.body[0]:null;
      if(data.startsWith("svc:")){
        const service:Record<string,string>={elderly:"رعاية كبار السن",patient:"رعاية المرضى",nurse:"التمريض المنزلي",physio:"العلاج الفيزيائي المنزلي"};
        const key=data.slice(4);
        const selectedService=service[key];
        if(!selectedService){set.status=400;return{ok:false,error:"unknown service"}}
        const requestId="RFQ-TG-"+new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
        const createdSession=await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({request_id:requestId,chat_id:String(callbackChatId),telegram_user_id:String(callback?.from?.id??""),language:telegramLanguage(callback?.message??{}),status:"collecting",service_type:selectedService})});
        if(!createdSession.response.ok){
          console.error(JSON.stringify({event:"rafig_telegram_request_session_create_failed",status:createdSession.response.status}));
          await telegramSendText(callbackChatId,telegramSigned("تعذّر حفظ طلبك الآن. أرسل /request لنبدأ طلبًا جديدًا."));
          return{ok:true,status:"request_session_create_failed"};
        }
        await telegramSendText(callbackChatId,telegramSigned("📝 تم اختيار الخدمة: "+selectedService+"\nرقم الطلب: "+requestId+"\n\nممتاز 🌿 حتى نتابع طلبك بالشكل الصحيح، في أي مدينة أو منطقة تحتاج إلى الخدمة؟"),{inline_keyboard:[
          [{text:"طرابلس",callback_data:"reqarea:طرابلس"},{text:"الضنية",callback_data:"reqarea:الضنية"}],
          [{text:"زغرتا",callback_data:"reqarea:زغرتا"},{text:"الكورة",callback_data:"reqarea:الكورة"}],
          [{text:"البترون",callback_data:"reqarea:البترون"},{text:"بيروت",callback_data:"reqarea:بيروت"}],
          [{text:"منطقة أخرى",callback_data:"reqarea:other"}]
        ]});
        return{ok:true,status:"callback_service_selected",request_id:requestId};
      }
      if(data.startsWith("reqsvc:") && session){
        const key=data.slice(7);
        const service:Record<string,string>={elderly:"رعاية كبار السن",patient:"رعاية المرضى",nurse:"التمريض المنزلي",physio:"العلاج الفيزيائي المنزلي"};
        await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions?id=eq."+encodeURIComponent(String(session.id)),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({service_type:service[key]||key,updated_at:new Date().toISOString()})});
        await telegramSendText(callbackChatId,telegramSigned("ممتاز. اختر المنطقة:"),{inline_keyboard:[
          [{text:"طرابلس",callback_data:"reqarea:طرابلس"},{text:"الضنية",callback_data:"reqarea:الضنية"}],
          [{text:"زغرتا",callback_data:"reqarea:زغرتا"},{text:"الكورة",callback_data:"reqarea:الكورة"}],
          [{text:"البترون",callback_data:"reqarea:البترون"},{text:"بيروت",callback_data:"reqarea:بيروت"}],
          [{text:"منطقة أخرى",callback_data:"reqarea:other"}]
        ]});
        return{ok:true,status:"request_service_selected"};
      }
      if(data.startsWith("reqarea:") && session){
        const area=data.slice(8);
        const finalArea=area==="other"?"منطقة أخرى":area;
        const savedArea=await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions?id=eq."+encodeURIComponent(String(session.id)),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({area:finalArea,updated_at:new Date().toISOString()})});
        if(!savedArea.response.ok)throw new Error("could not save Telegram request area");
        await telegramSendText(callbackChatId,telegramSigned("📍 تم تحديد المنطقة: "+finalArea+"\n\nحتى لا نسجل طلبًا ناقصًا، أجب عن هذه الأسئلة القصيرة خطوة بخطوة.\n\n1/3: هل الطلب لمسن أم لمريض؟ وكم عمره تقريبًا؟"));
        return{ok:true,status:"request_area_saved",request_id:session.request_id};
      }
    }
    return{ok:true,status:"callback_ignored"};
  }

  const channelPost=update?.channel_post;
  if(channelPost?.chat?.id){
    const cp=channelPost.chat;
    if(["group","supergroup","channel"].includes(String(cp.type))){
      await supabaseServerRest("/rest/v1/rafiq_telegram_broadcast_targets?on_conflict=chat_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({chat_id:String(cp.id),chat_type:String(cp.type),title:cp.title??null,username:cp.username??null,is_active:true,last_seen_at:new Date().toISOString()})}).catch(()=>{});
    }
    console.log(JSON.stringify({event:"rafig_telegram_channel_seen",chatId:String(cp.id),title:cp.title??null,username:cp.username??null}));
    return{ok:true,status:"channel_post_seen",channel_id:String(cp.id)};
  }
  const message=update?.message;
  const chatId=message?.chat?.id;
  if(!chatId)return{ok:true,status:"ignored_no_chat"};
  if(["group","supergroup","channel"].includes(String(message?.chat?.type))){
    await supabaseServerRest("/rest/v1/rafiq_telegram_broadcast_targets?on_conflict=chat_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({chat_id:String(chatId),chat_type:String(message.chat.type),title:message.chat.title??null,username:message.chat.username??null,is_active:true,last_seen_at:new Date().toISOString()})}).catch(()=>{});
  }
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

    const reply=async(body:string)=>{const outbound=await telegramSendText(chatId,telegramSigned(body));if(conversationId)await supabaseServerRest("/rest/v1/rafiq_conversations?id=eq."+encodeURIComponent(conversationId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({context:[...nextContext,{channel:"telegram",direction:"outbound",text:body,sent_at:new Date().toISOString()}].slice(-20),updated_at:new Date().toISOString(),last_message_at:new Date().toISOString()})}).catch(()=>{});return outbound;};

    const contactPhone=typeof message?.contact?.phone_number==="string"?message.contact.phone_number.trim():"";
    if(contactPhone){
      const normalizedContact=contactPhone.replace(/\\D/g,"");
      await supabaseServerRest("/rest/v1/rafiq_telegram_identities?on_conflict=telegram_user_id",{
        method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({telegram_user_id:String(message?.from?.id??""),chat_id:String(chatId),username:username||null,phone:normalizedContact,first_name:message?.from?.first_name??null,last_name:message?.from?.last_name??null,last_seen_at:new Date().toISOString()})
      });
      await reply("✅ تم ربط رقم هاتفك بحساب Telegram في RAFIQ. عند الحاجة سنستخدم Telegram كقناة احتياطية بعد WhatsApp.");
      return{ok:true,status:"telegram_phone_linked",conversation_id:conversationId};
    }
    const orders=await supabaseServerRest("/rest/v1/rafiq_telegram_cv_orders?chat_id=eq."+encodeURIComponent(externalConversationId)+"&order_status=not.in.(completed,cancelled)&select=*&order=updated_at.desc&limit=1");
    const activeOrder=Array.isArray(orders.body)?orders.body[0]:null;

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
        broadcast: telegramBroadcast,
      },
    );
    if (managerHandled) return { ok: true, status: "manager_command_handled" };

    // Backward-compatible manager gate: the owner is allowed by Telegram username
    // (default @MHDISSA980) even when TELEGRAM_MANAGER_CHAT_IDS is not configured.
    const legacyAdminHandled = await telegramAdminCommand(message);
    if (legacyAdminHandled) return { ok: true, status: "legacy_admin_command_handled", message_id: legacyAdminHandled?.result?.message_id ?? null };

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


    const language=telegramLanguage(message);
    if(message?.chat?.type==="private"){
      const cmd=textBody.toLowerCase().split(/\s+/)[0];
      if(cmd==="/start" || cmd==="/subscribe"){
        await supabaseServerRest("/rest/v1/rafiq_telegram_subscribers?on_conflict=chat_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
          chat_id:String(chatId),telegram_user_id:String(message?.from?.id??""),username:username||null,first_name:message?.from?.first_name??null,last_name:message?.from?.last_name??null,
          language,subscribed_at:new Date().toISOString(),unsubscribed_at:null,is_subscribed:true,updated_at:new Date().toISOString()
        })}).catch(()=>{});
      }else if(cmd==="/stop"){
        await supabaseServerRest("/rest/v1/rafiq_telegram_subscribers?chat_id=eq."+encodeURIComponent(String(chatId)),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({is_subscribed:false,unsubscribed_at:new Date().toISOString(),updated_at:new Date().toISOString()})}).catch(()=>{});
        await reply("⛔ تم إيقاف اشتراكك في إعلانات رفيق. يمكنك العودة في أي وقت عبر /subscribe.");
        return{ok:true,status:"telegram_unsubscribed",conversation_id:conversationId};
      }
    }

    if(!textBody)return{ok:true,status:"ignored_non_text"};

    const command=textBody.toLowerCase().split(/\s+/)[0];
    if(command==="/subscribe"){
      const outbound=await reply("✅ تم تفعيل اشتراكك في إعلانات رفيق من جديد.");
      return{ok:true,status:"telegram_subscribed",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    if(command==="/invite"){
      const outbound=await reply("📨 شارك بوت رفيق مع جهات اتصالك عبر هذا الرابط:\n\n"+RAFIQ_TELEGRAM_INVITE);
      return{ok:true,status:"invite_sent",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    if(command==="/services"){
      const outbound=await telegramSendText(chatId,telegramSigned("خدمات رفيق الأساسية:"),{inline_keyboard:[
        [{text:"👴 رعاية كبار السن",callback_data:"svc:elderly"},{text:"🏠 رعاية المرضى",callback_data:"svc:patient"}],
        [{text:"👩‍⚕️ التمريض المنزلي",callback_data:"svc:nurse"},{text:"🦿 العلاج الفيزيائي",callback_data:"svc:physio"}]
      ]});
      return{ok:true,status:"services_menu",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    if(command==="/request"){
      const requestId="RFQ-TG-"+new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
      await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({request_id:requestId,chat_id:String(chatId),telegram_user_id:String(message?.from?.id??""),language,status:"collecting"})});
      const outbound=await telegramSendText(chatId,telegramSigned("📝 بدأنا طلب رعاية جديد.\nرقم الطلب: "+requestId+"\n\nاختر الخدمة:"),{inline_keyboard:[
        [{text:"👴 كبار السن",callback_data:"reqsvc:elderly"},{text:"🏠 مريض",callback_data:"reqsvc:patient"}],
        [{text:"👩‍⚕️ تمريض",callback_data:"reqsvc:nurse"},{text:"🦿 علاج فيزيائي",callback_data:"reqsvc:physio"}]
      ]});
      return{ok:true,status:"request_started",request_id:requestId,message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    if(message?.chat?.type==="private" && textBody && !textBody.startsWith("/")){
      const requestSessions=await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions?chat_id=eq."+encodeURIComponent(String(chatId))+"&status=eq.collecting&order=updated_at.desc&limit=1&select=*");
      const requestSession=Array.isArray(requestSessions.body)?requestSessions.body[0]:null;
      if(requestSession){
        const sessionUrl="/rest/v1/rafiq_telegram_request_sessions?id=eq."+encodeURIComponent(String(requestSession.id));
        if(!requestSession.case_type){
          const saved=await supabaseServerRest(sessionUrl,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({case_type:textBody.slice(0,500),updated_at:new Date().toISOString()})});
          if(!saved.response.ok)throw new Error("could not save Telegram request case type");
          await reply("شكرًا لك 🌿\n\n2/3: ما نظام الرعاية المطلوب؟ مثلًا: نهارًا، ليلًا، مبيت، أو ساعات محددة.");
          return{ok:true,status:"request_case_type_saved",request_id:requestSession.request_id};
        }
        if(!requestSession.schedule){
          const saved=await supabaseServerRest(sessionUrl,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({schedule:textBody.slice(0,500),updated_at:new Date().toISOString()})});
          if(!saved.response.ok)throw new Error("could not save Telegram request schedule");
          await reply("وصلتني التفاصيل. 🌿\n\n3/3: ما أهم المساعدة المطلوبة؟ اذكر باختصار ما يحتاجه الشخص يوميًا، وأي حاجة تمريضية أو علاج فيزيائي إن وجدت.");
          return{ok:true,status:"request_schedule_saved",request_id:requestSession.request_id};
        }
        if(!requestSession.notes){
          const details=textBody.slice(0,2000);
          const payload={request_id:requestSession.request_id,telegram_chat_id:String(chatId),telegram_user_id:requestSession.telegram_user_id,language:requestSession.language,service_type:requestSession.service_type,area:requestSession.area,case_type:requestSession.case_type,schedule:requestSession.schedule,care_needs:details,source:"telegram"};
          const created=await supabaseServerRest("/rest/v1/application_intakes",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({application_type:"طلب رعاية عائلية",applicant_name:"طلب Telegram — "+String(chatId),phone:null,area:requestSession.area,status:"review",payload,source:"telegram",agent_reply:"طلب رعاية Telegram مكتمل مبدئيًا وينتظر مراجعة الإدارة."})});
          if(!created.response.ok)throw new Error("could not create Telegram care request");
          const intake=Array.isArray(created.body)?created.body[0]:created.body;
          const saved=await supabaseServerRest(sessionUrl,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({notes:details,status:"submitted",updated_at:new Date().toISOString()})});
          if(!saved.response.ok)throw new Error("could not complete Telegram request session");
          await reply("✅ اكتملت المعلومات الأساسية وسُجّل طلب الرعاية للمراجعة.\n\nالخدمة: "+String(requestSession.service_type||"—")+"\nالمنطقة: "+String(requestSession.area||"—")+"\nنوع الحالة والعمر: "+String(requestSession.case_type)+"\nالدوام: "+String(requestSession.schedule)+"\nالاحتياجات: "+details+"\n\nRequest ID: "+String(requestSession.request_id)+"\nرقم الطلب في RAFIQ: "+String(intake?.application_number??"—")+"\n\nستراجعه إدارة رفيق وتتواصل معكم عبر Telegram. إذا احتجنا رقم هاتف للتنسيق سنطلبه منك لاحقًا.");
          return{ok:true,status:"request_submitted",request_id:requestSession.request_id,application_number:intake?.application_number??null};
        }
      }
    }

    // Natural-language help should start a structured care intake, even when the AI provider has no credits.
    if(message?.chat?.type==="private" && /(?:\bhelp\b|need help|assistance|\bplease help\b|\bneed (?:a )?(?:nurse|caregiver|care|home care|elderly care|physiotherapy)\b|\b(?:home nursing|elderly care|patient care|physiotherapy)\b|care for (?:my|the) (?:mother|father|parent|grandmother|grandfather)|(?:my|the) (?:mother|father|parent|grandmother|grandfather) needs care|مساعدة|ساعدني|ساعدونا|بدي ساعد|بدي مساعدة|اريد المساعدة|أريد المساعدة|أحتاج مساعدة|احتاج مساعدة|طلبت المساعدة|طلب مساعدة|محتاج مساعدة|بدي ممرضة|بدي ممرض|بدي رعاية|بدي تمريض|ممرضة ل|ممرض ل|رعاية ل(?:أمي|امي|أبي|ابي|والدتي|والدي)|تمريض منزلي|علاج فيزيائي|رعاية كبار السن|رعاية مريض)/i.test(textBody)){
      const requestId="RFQ-TG-"+new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
      const started=await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({request_id:requestId,chat_id:String(chatId),telegram_user_id:String(message?.from?.id??""),language,status:"collecting"})});
      if(!started.response.ok){
        console.error(JSON.stringify({event:"rafig_telegram_natural_help_session_failed",status:started.response.status}));
        await reply("أهلًا بك في رفيق 🌿 أستطيع مساعدتك في رعاية كبار السن، رعاية المرضى، التمريض المنزلي أو العلاج الفيزيائي. تعذّر بدء الطلب آليًا الآن؛ جرّب /request أو تواصل مع الإدارة عبر WhatsApp: +961 81 506 299.");
        return{ok:true,status:"natural_help_session_failed"};
      }
      await telegramSendText(chatId,telegramSigned("أهلًا بك في رفيق 🌿 أنا هنا لمساعدتك. لنبدأ طلب الرعاية خطوة بخطوة.\nرقم الطلب: "+requestId+"\n\nما الخدمة التي تحتاجها؟"),{inline_keyboard:[
        [{text:"👴 رعاية كبار السن",callback_data:"reqsvc:elderly"},{text:"🏠 رعاية المرضى",callback_data:"reqsvc:patient"}],
        [{text:"👩‍⚕️ التمريض المنزلي",callback_data:"reqsvc:nurse"},{text:"🦿 العلاج الفيزيائي",callback_data:"reqsvc:physio"}]
      ]});
      return{ok:true,status:"natural_help_intake_started",request_id:requestId};
    }

    const commandReply=telegramCommandReply(textBody,language);
    if(commandReply){
      const welcomeOnStart=command==="/start";
      const outbound=await reply(welcomeOnStart?telegramCommandReply("/start",language):commandReply);
      if(welcomeOnStart && message?.chat?.type==="private") await telegramSendContactRequest(chatId).catch(()=>{});
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

    // Natural-language care intake: let Telegram behave like the WhatsApp care assistant.
    // Do not intercept general questions (e.g. "what services do you offer?"); only start intake
    // when the person expresses a concrete need for home care.
    const naturalCareRequest = message?.chat?.type === "private" && !textBody.startsWith("/") &&
      /(?:بدي|بدنا|اريد|أريد|أحتاج|احتاج|محتاج|محتاجة|نحتاج|ابحث عن|نبحث عن|بحاجة إلى|بحاجه الى|طلب رعاية|ممرض(?:ة)?|ممرضة|ممرض|رعاية لكبير سن|رعاية لوالد|رعاية لوالدتي|رعاية لوالدي|رعاية لأبي|رعاية لأمي|رعاية لجدي|رعاية لجدتي|مريض بالبيت|علاج فيزيائي|need (?:a |an )?(?:nurse|caregiver|home care|home nursing|physiotherapy)|looking for (?:care|a nurse|a caregiver)|need help for (?:my|the) (?:father|mother|parent|grandmother|grandfather)|home care for|besoin de soins|cherche (?:une infirmière|un aide-soignant|des soins)|ho bisogno di (?:assistenza|un infermiere|una badante)|suche (?:eine Pflegekraft|häusliche Pflege))/i.test(textBody);
    if (naturalCareRequest) {
      const requestId = "RFQ-TG-" + new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14) + "-" + crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
      const created = await supabaseServerRest("/rest/v1/rafiq_telegram_request_sessions", {
        method:"POST",
        headers:{"Prefer":"return=representation"},
        body:JSON.stringify({
          request_id:requestId,
          chat_id:String(chatId),
          telegram_user_id:String(message?.from?.id??""),
          language,
          status:"collecting"
        })
      });
      if (!created.response.ok) {
        console.error(JSON.stringify({event:"rafig_telegram_natural_intake_create_failed",status:created.response.status}));
        await reply("أرغب بمساعدتك 🌿 لكن تعذّر فتح طلبك الآن. أرسل /request للمحاولة مجددًا، أو تواصل مع الإدارة عبر WhatsApp: +961 81 506 299.");
        return {ok:true,status:"natural_intake_create_failed"};
      }
      await telegramSendText(chatId,telegramSigned("أكيد، رفيق معك 🌿\nسأتابع طلبك خطوة بخطوة.\n\nاختر الخدمة الأقرب إلى حاجتك:"),{inline_keyboard:[
        [{text:"👴 رعاية كبار السن",callback_data:"reqsvc:elderly"},{text:"🏠 رعاية المرضى",callback_data:"reqsvc:patient"}],
        [{text:"👩‍⚕️ التمريض المنزلي",callback_data:"reqsvc:nurse"},{text:"🦿 العلاج الفيزيائي",callback_data:"reqsvc:physio"}]
      ]});
      return {ok:true,status:"natural_care_intake_started",request_id:requestId};
    }

    const conversationHistory=nextContext.map((item:any)=>item.direction==="outbound"?`RAFIQ: ${item.text}`:`Customer: ${item.text}`).join("\n");
    let result;
    const knowledgeReply=answerRafiqKnowledge(textBody);
    if(knowledgeReply){
      result={reply:knowledgeReply,model:"rafiq-knowledge-base"};
    }else{
      try{result=await draftAgentReply(textBody,language,"TELEGRAM ACTIVE CASE | Chat ID: "+chatId+" | Customer: "+(senderName||"unknown")+" | Recent conversation:\n"+conversationHistory+" | POLICY: Reply in clear natural Arabic. Understand meaning, answer first, ask at most ONE useful next question. Never repeat information already supplied. For human/admin action, clearly provide WhatsApp +961 81 506 299. Never claim payment, approval, transfer, booking or availability without confirmation.")}
      catch(agentError){
        console.error(JSON.stringify({event:"rafig_telegram_agent_failed",error:String(agentError).slice(0,300)}));
        result={reply:rafiqFallback(textBody,conversationHistory),model:"rafig-local-fallback"};
      }
    }
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
const forwardPublicIntake=async({request,set}:any)=>{
  const now=Date.now();
  const ip=(request.headers.get("x-forwarded-for")||request.headers.get("x-real-ip")||"public").split(",")[0].trim();
  const rateStore=(globalThis as any).__RAFIQ_PUBLIC_INTAKE_RATE__; const last:Map<string,number>=rateStore||new Map<string,number>(); (globalThis as any).__RAFIQ_PUBLIC_INTAKE_RATE__=last;
  const previous=last.get(ip)||0; if(now-previous<PUBLIC_INTAKE_RATE_LIMIT_MS){set.status=429;return{ok:false,error:"يرجى الانتظار قليلًا ثم إعادة إرسال الطلب"}} last.set(ip,now);
  const contentLength=Number(request.headers.get("content-length")||0); if(contentLength>MAX_PUBLIC_INTAKE_BODY){set.status=413;return{ok:false,error:"حجم الطلب يتجاوز الحد المسموح"}}
  const key=(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||"").trim(); if(!key){set.status=503;return{ok:false,error:"public intake configuration unavailable"}}
  const contentType=request.headers.get("content-type")||"application/octet-stream";
  try{
    const upstream=await fetch(SUPABASE_URL+"/functions/v1/public-intake",{method:"POST",headers:{"Authorization":"Bearer "+key,"apikey":key,"Content-Type":contentType},body:await request.arrayBuffer()});
    const body=await upstream.json().catch(()=>({ok:false,error:"invalid upstream response"})); set.status=upstream.status; return body;
  }catch(error){console.error(JSON.stringify({event:"rafig_public_intake_edge_proxy_failed",error:String(error).slice(0,240)}));set.status=502;return{ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."}}
}
app.post("/api/public/institution-intake",forwardPublicIntake)
.post("/api/public/intake",forwardPublicIntake)
.get("/api/intake/complete",async({query,set})=>{
  const token=String(query?.token??"").trim();
  if(!token){set.status=400;return{ok:false,error:"invalid completion token"}}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const r=await supabaseServerRest("/rest/v1/application_intakes?upload_token_hash=eq."+encodeURIComponent(hash)+"&upload_token_expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&status=eq.review&select=id,application_number,applicant_name,status&limit=1");
  const row=Array.isArray(r.body)?r.body[0]:null;
  if(!r.response.ok||!row){set.status=404;return{ok:false,error:"رابط الإكمال غير صالح أو منتهي الصلاحية"}}
  return{ok:true,application_number:row.application_number,applicant_name:row.applicant_name,status:row.status};
})
.post("/api/intake/complete",async({request,set})=>{
  const form=await request.formData().catch(()=>null);
  if(!form){set.status=400;return{ok:false,error:"invalid form"}}
  const token=String(form.get("token")??"").trim();
  if(!token){set.status=400;return{ok:false,error:"invalid completion token"}}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const r=await supabaseServerRest("/rest/v1/application_intakes?upload_token_hash=eq."+encodeURIComponent(hash)+"&upload_token_expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&status=eq.review&select=id,application_number,applicant_name&limit=1");
  const intake=Array.isArray(r.body)?r.body[0]:null;
  if(!r.response.ok||!intake){set.status=404;return{ok:false,error:"رابط الإكمال غير صالح أو منتهي الصلاحية"}}
  const note=String(form.get("note")??"").trim().slice(0,5000);
  const files=form.getAll("files").filter(v=>v instanceof File) as File[];
  if(files.length>10){set.status=400;return{ok:false,error:"يمكن إرفاق 10 ملفات كحد أقصى"}}
  if(files.some(f=>f.size>6*1024*1024)){set.status=413;return{ok:false,error:"الحد الأقصى لحجم الملف الواحد 6MB"}}
  if(note){
    const current=await supabaseServerRest("/rest/v1/application_intakes?id=eq."+encodeURIComponent(intake.id)+"&select=payload&limit=1");
    const payload=Array.isArray(current.body)?(current.body[0]?.payload??{}):{};
    await supabaseServerRest("/rest/v1/application_intakes?id=eq."+encodeURIComponent(intake.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({payload:{...(payload&&typeof payload==="object"?payload:{}),completion_note:note,completion_submitted_at:new Date().toISOString()},updated_at:new Date().toISOString()})});
  }
  let uploaded=0;
  for(const file of files){
    const safeName=String(file.name||"file").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"file";
    const path="intakes/"+String(intake.id)+"/completion-"+crypto.randomUUID()+"-"+safeName;
    const bytes=await file.arrayBuffer();
    const sr=await fetch(SUPABASE_URL+"/storage/v1/object/private_documents/"+path,{method:"POST",headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+SUPABASE_SERVICE_ROLE_KEY,"Content-Type":file.type||"application/octet-stream","x-upsert":"false"},body:bytes});
    if(!sr.ok){console.error(JSON.stringify({event:"rafig_completion_upload_failed",intakeId:intake.id,file:safeName,status:sr.status}));continue}
    const ir=await supabaseServerRest("/rest/v1/application_intake_files",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type||null,file_size:file.size,verification_status:"pending",document_category:"completion"} )});
    if(ir.response.ok)uploaded++;
  }
  const admins=await supabaseServerRest("/rest/v1/profiles?role=eq.admin&status=eq.active&select=id");
  const adminRows=Array.isArray(admins.body)?admins.body:[];
  if(adminRows.length){
    await supabaseServerRest("/rest/v1/notifications",{
      method:"POST",
      headers:{"Prefer":"return=minimal"},
      body:JSON.stringify(adminRows.map((a:any)=>({
        user_id:a.id,
        title:"استكمال ملف RAFIQ",
        message:"تم استكمال الطلب رقم "+String(intake.application_number)+" وإرسال "+String(uploaded)+" ملف/ملفات.",
        type:"application_completion"
      })))
    }).catch(()=>{});
  }
  return{ok:true,status:"submitted",uploaded};
})
.get("/api/status",()=>({ok:true,service:"RAFIQ",started_at:startedAt,uptime_seconds:Math.floor(process.uptime())}))
.get("/api/barcode/qr/:code",async({params,set})=>{
  const code=String(params.code??"").trim();
  if(!code){set.status=400;return new Response("invalid code",{status:400})}
  const lookup=await supabaseServerRest("/rest/v1/issued_barcodes?code=eq."+encodeURIComponent(code)+"&status=eq.active&select=code&limit=1");
  if(!lookup.response.ok||!Array.isArray(lookup.body)||!lookup.body.length){set.status=404;return new Response("not found",{status:404})}
  const png=await QRCode.toBuffer(code,{type:"png",width:600,margin:2});
  return new Response(png,{status:200,headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300"}});
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
.get("/complete.html",()=>fileResponse("public/complete.html","text/html; charset=utf-8","no-store"))
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
.get("/intake-admin.js",()=>fileResponse("public/intake-admin.js","application/javascript","no-cache")).get("/institution-form.js",()=>fileResponse("public/institution-form.js","application/javascript","no-cache"))
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
  metaWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
  metaOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
  whatsappSendingEnabled:process.env.WHATSAPP_SENDING_ENABLED==="true",
  whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",
  agentModel:effectiveAgentModel(),
  kapsoConfigured:kapsoConfigured(),
  kapsoWebhookSecretConfigured:Boolean(kapsoWebhookSecret())
}));
