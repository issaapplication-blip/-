import { applySecurityHeaders } from "./http-cache-policy";
import { classifyTelegramUpdateClaim, parseTelegramUpdateId } from "./telegram-update-dedup";
import { Elysia } from "elysia";
import { answerRafiqKnowledge } from "./rafiq-service-knowledge";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";
import { kapsoConfigured, kapsoWebhookSecret } from "./kapso";
import { rafiqFallback } from "./rafiq-local-agent";
import { telegramConfigured, telegramGetWebhookInfo, telegramSendText, telegramSendDocument, telegramSendPhoto, telegramAnswerCallbackQuery, telegramSetWebhook, telegramWebhookSecret, verifyTelegramWebhookSecret } from "./telegram";
import { cvChoice, cvMenuText, cvPaymentText, cvPrompt } from "./telegram-cv";
import { sendMessage } from "./messaging-service";
import { RAFIQ_CONFIG } from "./rafiq-config";
import QRCode from "qrcode";
import { handleManagerCommand, parseManagerChatIds } from "./telegram-manager";
import { RAFIQ_TELEGRAM_BOT, RAFIQ_TELEGRAM_CHANNEL, RAFIQ_WEBSITE, RAFIQ_WHATSAPP, RAFIQ_WHATSAPP_CHANNEL, RAFIQ_WHATSAPP_NUMBER, rafiqRequiresHumanReply } from "./rafiq-service-knowledge";

const port = Number(process.env.PORT ?? 7860);
const startedAt = new Date().toISOString();
let lastKapsoWebhookAt: string | null = null;
let lastKapsoWebhookEvent: string | null = null;
const effectiveAgentModel = () => {
  const provider = (process.env.RAFIQ_AGENT_PROVIDER ?? "gemini").trim().toLowerCase();
  if (provider === "gemini") return (process.env.RAFIQ_GEMINI_MODEL ?? "gemini-3.6-flash").trim();
  return (process.env.RAFIQ_AGENT_MODEL ?? "not-configured").trim() || "not-configured";
};
const publicAgentChatWindows = new Map<string, { startedAt: number; count: number }>();
const allowPublicAgentChat = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const key = (request.headers.get("cf-connecting-ip") || forwarded.split(",")[0] || "unknown").trim().slice(0, 96);
  const now = Date.now();
  let window = publicAgentChatWindows.get(key);
  if (!window || now - window.startedAt >= 60_000) {
    window = { startedAt: now, count: 0 };
    publicAgentChatWindows.set(key, window);
  }
  if (window.count >= 20) return false;
  window.count += 1;
  if (publicAgentChatWindows.size > 5000) {
    for (const [ip, entry] of publicAgentChatWindows) {
      if (now - entry.startedAt >= 120_000) publicAgentChatWindows.delete(ip);
    }
  }
  return true;
};
const TELEGRAM_ANNOUNCEMENT_KEY = "rafig-family-launch-2026-10";
const TELEGRAM_ONBOARDING_KEY = "rafig-telegram-channel-bot-invite-2026-10";
const RAFIQ_TELEGRAM_INVITE = `${RAFIQ_TELEGRAM_BOT}?start=rafiq`;
const TELEGRAM_ONBOARDING_MESSAGE = [
  "👋 أهلًا بكم من رفيق | RAFIQ 🇱🇧",
  "رفيق دليل معلومات وإعلانات للمراكز الطبية المعتمدة في لبنان.",
  "🧪 المختبرات الطبية",
  "🩻 الأشعة والتصوير",
  "🦿 مراكز العلاج الفيزيائي",
  "🦽 بيع وتأجير المعدات الطبية",
  "📄 خدمة CV وCover Letter متاحة بشكل مستقل.",
  "",
  "🤖 بوت RAFIQ: " + RAFIQ_TELEGRAM_BOT,
  "📢 قناة رفيق: " + RAFIQ_TELEGRAM_CHANNEL,
  "📱 للتواصل اليدوي مع الإدارة: WhatsApp +961 81 506 299",
  "",
  "لا يستقبل RAFIQ طلبات رعاية أو انتساب أو توظيف أو تسجيل مراكز أو حجوزات.",
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
  if(process.env.RAFIQ_WHATSAPP_TO_TELEGRAM_FORWARDING!=="true")return{status:"forwarding_disabled",delivered:0};
  const managerChatIds=parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS);
  if(!managerChatIds.length){console.warn(JSON.stringify({event:"rafig_whatsapp_to_telegram_no_manager_ids"}));return{status:"no_manager_ids",delivered:0};}
  const messageType=typeof message?.type==="string"?message.type:"text";
  const notice=telegramSigned(["📲 رسالة WhatsApp واردة إلى RAFIQ","","👤 رقم العميل: "+(identity.phone||"غير متوفر"),"💬 نوع الرسالة: "+messageType,"💬 الرسالة:",body||"[رسالة غير نصية]","","🟡 الحالة: بانتظار متابعة المدير","⚠️ لا يوجد رد تلقائي على WhatsApp.","يمكن للمدير مراجعة الرسالة والتواصل يدويًا إذا لزم الأمر."].join("\n"));
  let delivered=0;
  for(const managerId of managerChatIds){try{await telegramSendText(managerId,notice);delivered++;}catch(error){console.error(JSON.stringify({event:"rafig_whatsapp_to_telegram_send_failed",managerId,error:String(error).slice(0,240)}));}}
  return{status:delivered?"forwarded_to_telegram":"telegram_delivery_failed",delivered};
};
const TELEGRAM_WELCOME = [
  "أهلًا وسهلًا بك في رفيق | RAFIQ 🇱🇧",
  "هذا البوت دليل معلومات للمختبرات الطبية والأشعة ومراكز العلاج الفيزيائي وبيع وتأجير المعدات الطبية. خدمة CV وCover Letter متاحة بشكل مستقل.",
  "",
  "🧪 المختبرات الطبية\n🩻 الأشعة والتصوير\n🦿 مراكز العلاج الفيزيائي\n🦽 بيع وتأجير المعدات الطبية",
  "",
  "📢 قناة رفيق: " + RAFIQ_TELEGRAM_CHANNEL,
  "🤖 رابط البوت: " + RAFIQ_TELEGRAM_INVITE,
  "📱 للتواصل اليدوي مع الإدارة: WhatsApp +961 81 506 299"
].join("\n");
const TELEGRAM_ANNOUNCEMENT_CUTOFF = "2026-10-05T00:00:00.000Z";
const TELEGRAM_ANNOUNCEMENT = [
  "📣 RAFIQ | رفيق 🇱🇧 — دليل المراكز الطبية المعتمدة في لبنان",
  "",
  "🧪 المختبرات الطبية",
  "🩻 الأشعة والتصوير",
  "🦿 مراكز العلاج الفيزيائي",
  "🦽 بيع وتأجير المعدات الطبية",
  "📄 خدمة CV وCover Letter متاحة بشكل مستقل.",
  "",
  "لا يستقبل RAFIQ طلبات رعاية أو انتساب أو توظيف أو تسجيل مراكز أو حجوزات.",
  "لا تُنشر المراكز أو الإعلانات أو الأسعار أو الخصومات إلا بعد مراجعة الإدارة وموافقتها.",
  "",
  "🤖 بوت Telegram: " + RAFIQ_TELEGRAM_BOT,
  "📢 قناة Telegram: " + RAFIQ_TELEGRAM_CHANNEL,
  "🌐 الموقع: " + RAFIQ_WEBSITE,
  "📱 WhatsApp الإدارة للمراسلات اليدوية: " + RAFIQ_WHATSAPP_NUMBER + " — " + RAFIQ_WHATSAPP
].join("\n");
const draftInboundReply = async (message: string, _senderPhone?: string) => {
  try {
    return await draftAgentReply(message);
  } catch (error) {
    console.error(JSON.stringify({event:"rafig_agent_provider_failed",reason:String(error).slice(0,160)}));
    return {reply:rafiqFallback(message),model:"rafig-local-fallback"};
  }
};
const MAX_WEBHOOK_BODY = 512_000;
const MAX_PUBLIC_INTAKE_BODY = 18 * 1024 * 1024;
const PUBLIC_INTAKE_RATE_LIMIT_MS = 15_000;
const PUBLIC_INTAKE_RATE_MAX_KEYS = 10_000;
const securityHeaders = {"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: https://images.pexels.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://qmuxaehrahfsnabyjens.supabase.co"};
const timingSafeEqual=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const verifyMetaSignature=async(body:string,signature:string|null)=>{const secret=process.env.META_APP_SECRET;if(!secret||!signature?.startsWith("sha256="))return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=`sha256=${hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)))}`;return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(signature))};
const verifyKapsoSignature=async(body:string,signature:string|null)=>{const secret=kapsoWebhookSecret();if(!secret||!signature)return false;const normalized=signature.startsWith("sha256=")?signature.slice(7):signature;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(normalized))};const kapsoIdentity=(message:any,conversation:any={})=>({phone:typeof message?.from==="string"&&message.from?message.from:(typeof conversation?.phone_number==="string"&&conversation.phone_number?conversation.phone_number:""),bsuid:typeof message?.from_user_id==="string"&&message.from_user_id?message.from_user_id:(typeof conversation?.business_scoped_user_id==="string"&&conversation.business_scoped_user_id?conversation.business_scoped_user_id:""),username:typeof message?.username==="string"?message.username:(typeof conversation?.username==="string"?conversation.username:"")});const processKapsoMessageCore=async(message:any,conversation:any={})=>{
  const identity=kapsoIdentity(message,conversation);
  const forbiddenDigits="70600157";
  if(identity.phone?.replace(/\D/g,"").endsWith(forbiddenDigits)){console.warn(JSON.stringify({event:"rafig_forbidden_number_blocked",fromSuffix:identity.phone.slice(-4)}));return{id:String(message?.id??"unknown"),status:"blocked_forbidden_number"}}
  const body=typeof message?.text?.body==="string"?message.text.body.trim():(typeof message?.kapso?.content==="string"?message.kapso.content.trim():"");
  const id=String(message?.id??"unknown");
  if(!body||(!identity.phone&&!identity.bsuid))return{id,status:"ignored_missing_identity_or_text"};
  try{
    const inbound=await recordInboundEvent(message,identity,"kapso");
    if(inbound?.duplicate)return{id,status:"duplicate_ignored"};
    const delivery=await forwardWhatsAppToTelegramManager(message,identity,body);
    await updateInboundEvent(id,delivery.delivered?"processed":"failed",delivery.delivered?undefined:delivery.status);
    return{id,status:delivery.status,deliveredTo:delivery.delivered};
  }catch(error){
    await updateInboundEvent(id,"failed",String(error).slice(0,500)).catch(()=>{});
    console.error(JSON.stringify({event:"rafig_kapso_forward_failed",messageId:id,error:String(error)}));
    return{id,status:"telegram_forward_failed"};
  }
};
const processMetaMessageCore=async(message:any)=>{
  const identity={phone:typeof message?.from==="string"?message.from:""};
  const forbiddenDigits="70600157";
  if(identity.phone?.replace(/\D/g,"").endsWith(forbiddenDigits))return{id:String(message?.id??"unknown"),status:"blocked_forbidden_number"};
  const body=typeof message?.text?.body==="string"?message.text.body.trim():"";
  const id=String(message?.id??"unknown");
  if(!body||!identity.phone)return{id,status:"ignored_missing_identity_or_text"};
  try{
    const inbound=await recordInboundEvent(message,identity,"meta");
    if(inbound?.duplicate)return{id,status:"duplicate_ignored"};
    const delivery=await forwardWhatsAppToTelegramManager(message,identity,body);
    await updateInboundEvent(id,delivery.delivered?"processed":"failed",delivery.delivered?undefined:delivery.status,"meta");
    return{id,status:delivery.status,deliveredTo:delivery.delivered};
  }catch(error){
    await updateInboundEvent(id,"failed",String(error).slice(0,500),"meta").catch(()=>{});
    console.error(JSON.stringify({event:"rafig_meta_forward_failed",messageId:id,error:String(error)}));
    return{id,status:"telegram_forward_failed"};
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
const sendWhatsAppText=async(_to:string,_body:string)=>{throw new Error("whatsapp_automation_retired")};
const PUBLIC_I18N_EXCLUDED = new Set(["public/admin.html","public/dashboard.html","public/barcode.html"]); const RAFIQ_LOGO_STYLE='<style id="rafig-logo-quality">.brand img,.brand-mini img,.hero-logo,.logo,.brand-logo{background:#fff!important;object-fit:contain!important;image-rendering:auto!important;filter:none!important}.brand img,.brand-mini img,.logo,.brand-logo{border-radius:14px!important;padding:6px!important;box-sizing:border-box!important}.hero-logo{display:block;background:#fff!important;border-radius:18px!important;padding:10px!important;box-shadow:0 5px 18px rgba(0,0,0,.08)!important}</style>'; const FILE_CACHE_MAX_BYTES=16*1024*1024; const fileCache=new Map<string,{body:Uint8Array,type:string}>(); let fileCacheBytes=0;
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
      start:"أهلًا بك في رفيق | RAFIQ 🇱🇧\nهذا البوت دليل معلومات للمختبرات الطبية والأشعة ومراكز العلاج الفيزيائي وبيع وتأجير المعدات الطبية. خدمة CV وCover Letter متاحة بشكل مستقل.\n\n/services دليل الخدمات\n/cv خدمة السيرة الذاتية\n/help للمساعدة\n/contact للتواصل",
      services:"دليل RAFIQ: المختبرات الطبية، الأشعة والتصوير، مراكز العلاج الفيزيائي، وبيع وتأجير المعدات الطبية. خدمة CV وCover Letter متاحة بشكل مستقل.",
      request:"لا يستقبل RAFIQ طلبات رعاية أو انتساب أو توظيف أو تسجيل مراكز أو حجوزات. استخدم /services لدليل المراكز أو /cv لخدمة CV وCover Letter.",
      help:"أهلًا بك في رفيق 🌿\\nيمكنك استخدام هذا البوت لاستعراض دليل المراكز الطبية المعتمدة وخدمات المختبرات والأشعة والعلاج الفيزيائي والمعدات الطبية. كما تتوفر خدمة إعداد السيرة الذاتية CV ورسالة التغطية Cover Letter.\\n\\n/services دليل المراكز والخدمات\\n/cv خدمة السيرة الذاتية ورسالة التغطية\\n/contact التواصل مع إدارة رفيق.\\n\\nلا يستقبل البوت طلبات الرعاية أو الحجوزات أو تسجيل مقدمي الخدمات والمراكز.",
      contact:"للتواصل مع إدارة رفيق: +961 81 506 299"
    },
    en:{
      start:"Welcome to RAFIQ | رفيق 🇱🇧\nThis bot is the RAFIQ information directory for approved medical labs, imaging centers, physiotherapy centers, and medical equipment sales/rental. CV and Cover Letter preparation is a separate service.\n\n/services Directory\n/cv CV service\n/help Help\n/contact Contact",
      services:"RAFIQ directory: medical laboratories, radiology/imaging, physiotherapy centers, and medical equipment sales/rental. CV and Cover Letter preparation is a separate service.",
      request:"RAFIQ does not accept care, provider-registration, employment, institution-registration, or booking requests. Use /services for the directory or /cv for the CV service.",
      help:"Ask about the approved directory or CV and Cover Letter service. RAFIQ does not accept care or registration requests or bookings.",
      contact:"RAFIQ administration: +961 81 506 299"
    },
    fr:{
      start:"Bienvenue chez RAFIQ | رفيق 🇱🇧\nCet outil est un annuaire d’information pour les laboratoires médicaux, centres d’imagerie, centres de physiothérapie et la vente/location de matériel médical. Le CV et la lettre de motivation sont un service séparé.",
      services:"Annuaire RAFIQ : laboratoires médicaux, radiologie/imagerie, centres de physiothérapie et vente/location de matériel médical. Le CV et la lettre de motivation sont un service séparé.",
      request:"RAFIQ ne reçoit pas de demandes de soins, d’inscription, d’emploi ou de réservation. Utilisez /services pour l’annuaire ou /cv pour le service CV.",
      help:"Posez vos questions sur l’annuaire approuvé ou le service CV et lettre de motivation. RAFIQ ne reçoit pas de demandes de soins ou de réservation.",
      contact:"Administration RAFIQ : +961 81 506 299"
    },
    it:{
      start:"Benvenuto in RAFIQ | رفيق 🇱🇧\nQuesta è la directory informativa RAFIQ per laboratori medici, radiologia, centri di fisioterapia e vendita/noleggio di attrezzature mediche. CV e lettera di presentazione sono un servizio separato.",
      services:"Directory RAFIQ: laboratori medici, radiologia/diagnostica per immagini, centri di fisioterapia e vendita/noleggio di attrezzature mediche.",
      request:"RAFIQ non accetta richieste di assistenza, registrazione, lavoro o prenotazione. Usa /services per la directory o /cv per il servizio CV.",
      help:"Chiedi informazioni sulla directory approvata o sul servizio CV. RAFIQ non accetta richieste di assistenza o prenotazioni.",
      contact:"Amministrazione RAFIQ: +961 81 506 299"
    },
    de:{
      start:"Willkommen bei RAFIQ | رفيق 🇱🇧\nDieses Angebot ist ein Informationsverzeichnis für medizinische Labore, Radiologie/Bildgebung, Physiotherapiezentren sowie Verkauf und Vermietung medizinischer Geräte. CV und Anschreiben sind ein separater Service.",
      services:"RAFIQ-Verzeichnis: medizinische Labore, Radiologie/Bildgebung, Physiotherapiezentren sowie Verkauf und Vermietung medizinischer Geräte.",
      request:"RAFIQ nimmt keine Pflege-, Registrierungs-, Beschäftigungs- oder Buchungsanfragen an. Verwenden Sie /services für das Verzeichnis oder /cv für den CV-Service.",
      help:"Fragen Sie nach dem freigegebenen Verzeichnis oder dem CV-Service. RAFIQ nimmt keine Pflege- oder Buchungsanfragen an.",
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
  "🇱🇧 RAFIQ | رفيق — دليل المراكز الطبية المعتمدة في لبنان.\n\n🧪 المختبرات الطبية\n🩻 الأشعة والتصوير\n🦿 مراكز العلاج الفيزيائي\n🦽 بيع وتأجير المعدات الطبية\n\nتصفحوا دليل الخدمات: "+RAFIQ_WEBSITE+"services.html",
  "📍 دليل RAFIQ يغطي طرابلس، الضنية، زغرتا، الكورة، البترون، بيروت وباقي لبنان بحسب المراكز المعتمدة المنشورة.\n\nللاطلاع على المناطق: "+RAFIQ_WEBSITE+"regions.html",
  "📄 خدمة إعداد CV وCover Letter متاحة بشكل مستقل عن دليل المراكز.\n\nالتفاصيل: "+RAFIQ_WEBSITE+"caregivers.html",
  "🏥 للمختبرات ومراكز الأشعة والعلاج الفيزيائي وموردي المعدات الطبية: يمكنكم التواصل مع إدارة RAFIQ لمراجعة إمكانية إدراج مركز أو إعلان. لا يتم النشر إلا بعد التحقق والموافقة.\n\nWhatsApp: "+RAFIQ_WHATSAPP,
  "💚 لا ينشر RAFIQ مركزًا أو سعرًا أو عرضًا أو خصمًا قبل موافقة الإدارة. لا توجد نسبة خصم موحدة؛ تُراجع كل خدمة وسعرها الفعلي بشكل مستقل.\n\nبوت RAFIQ: "+RAFIQ_TELEGRAM_BOT
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
.get("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired"};
  const mode=query["hub.mode"],token=query["hub.verify_token"],challenge=query["hub.challenge"],verifyToken=(process.env.META_VERIFY_TOKEN??"").trim();
  if(mode==="subscribe"&&verifyToken&&token===verifyToken&&challenge)return challenge;
  set.status=403;return{ok:false,error:"webhook verification failed"};
})
.post("/api/whatsapp/webhook",async({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired"};
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
.post("/api/kapso/webhook",async({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired"};
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
  const callback=update?.callback_query;
  if(callback?.id){
    const callbackChatId=callback?.message?.chat?.id;
    const data=String(callback?.data??"");
    if(callbackChatId && /^(?:svc|reqsvc|reqarea):/.test(data)){await telegramSendText(callbackChatId,telegramSigned("هذه القائمة القديمة لطلبات الرعاية لم تعد متاحة. يستخدم RAFIQ حاليًا دليل المراكز الطبية المعتمدة وخدمة CV وCover Letter فقط."));return{ok:true,status:"legacy_care_callback_retired"};}
    await telegramAnswerCallbackQuery(String(callback.id)).catch(()=>{});
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
      const normalizedContact=contactPhone.replace(/\D/g,"");
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

    if(textBody && rafiqRequiresHumanReply(textBody)){
      const payload={channel:"telegram",chat_id:chatId,message_id:message?.message_id??null,username,sender_name:senderName,incoming_text:textBody,reason:"human_reply_required",status:"open"};
      if(conversationId) await supabaseServerRest("/rest/v1/whatsapp_pending_approvals",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({conversation_id:conversationId,reason:"telegram_human_reply_required",status:"open",payload})}).catch(()=>{});
      const managers=parseManagerChatIds(process.env.TELEGRAM_MANAGER_CHAT_IDS);
      const managerNotice="🔔 طلب يحتاج رد الإدارة\n\nمن Telegram: "+(senderName||"غير معروف")+"\nالمحادثة: "+String(chatId)+"\n\nرسالة العميل:\n"+textBody+"\n\n⚠️ لم يتم إرسال رد تلقائي للعميل.";
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
      const outbound=await reply("دليل RAFIQ يشمل المختبرات الطبية، الأشعة والتصوير، مراكز العلاج الفيزيائي، وبيع وتأجير المعدات الطبية.\n\nدليل الخدمات: "+RAFIQ_WEBSITE+"services.html\nخدمة CV وCover Letter: "+RAFIQ_WEBSITE+"caregivers.html");
      return{ok:true,status:"directory_menu",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    if(command==="/request" || command==="/apply" || command==="/register"){
      const outbound=await reply("لا يستقبل RAFIQ طلبات رعاية أو انتساب أو توظيف أو تسجيل مراكز أو حجوزات. يمكنكم تصفح دليل المراكز المعتمدة عبر "+RAFIQ_WEBSITE+"services.html أو خدمة CV وCover Letter عبر "+RAFIQ_WEBSITE+"caregivers.html.");
      return{ok:true,status:"submissions_not_supported",message_id:outbound?.result?.message_id??null,conversation_id:conversationId};
    }
    const commandReply=telegramCommandReply(textBody,language);
    if(commandReply){
      const welcomeOnStart=command==="/start";
      const outbound=await reply(welcomeOnStart?telegramCommandReply("/start",language):commandReply);
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
const forwardPublicIntake=async({set}:any)=>{set.status=410;return{ok:false,error:"public_submission_endpoint_retired"}}
app.post("/api/public/institution-intake",forwardPublicIntake)
.post("/api/public/intake",forwardPublicIntake)
.get("/api/intake/complete",async({set})=>{set.status=410;return{ok:false,error:"public_submission_endpoint_retired"};
  const token=String(query?.token??"").trim();
  if(!token){set.status=400;return{ok:false,error:"invalid completion token"}}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,"0")).join("");
  const r=await supabaseServerRest("/rest/v1/application_intakes?upload_token_hash=eq."+encodeURIComponent(hash)+"&upload_token_expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&status=eq.review&select=id,application_number,applicant_name,status&limit=1");
  const row=Array.isArray(r.body)?r.body[0]:null;
  if(!r.response.ok||!row){set.status=404;return{ok:false,error:"رابط الإكمال غير صالح أو منتهي الصلاحية"}}
  return{ok:true,application_number:row.application_number,applicant_name:row.applicant_name,status:row.status};
})
.post("/api/intake/complete",async({set})=>{set.status=410;return{ok:false,error:"public_submission_endpoint_retired"};
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

.post("/api/kapso/send-text",({set})=>{set.status=410;return{ok:false,error:"Kapso integration is retired"}})
.get("/api/whatsapp/webhook",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired"};const mode=query["hub.mode"],token=query["hub.verify_token"],challenge=query["hub.challenge"],verifyToken=process.env.META_VERIFY_TOKEN;if(mode==="subscribe"&&verifyToken&&token===verifyToken&&challenge)return challenge;set.status=403;return{ok:false,error:"webhook verification failed"}})
.post("/api/whatsapp/webhook",async({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired"};
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
.post("/api/agent/chat",async({request,set})=>{const started=Date.now();if(!allowPublicAgentChat(request)){set.status=429;return{ok:false,error:"rate limit exceeded"}}console.log(JSON.stringify({event:"rafig_agent_chat_received"}));let input:any;try{input=await request.json()}catch{set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_json"}));return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>4000){set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_message"}));return{ok:false,error:"invalid message"}}try{const result=await draftInboundReply(message);console.log(JSON.stringify({event:"rafig_agent_chat_completed",model:result.model,durationMs:Date.now()-started}));return{ok:true,reply:result.reply,model:result.model}}catch(error){console.error(JSON.stringify({event:"rafig_agent_chat_failed",error:String(error).slice(0,160),durationMs:Date.now()-started}));return{ok:true,reply:rafiqFallback(message),model:"rafig-local-fallback"}}})
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
.get("/robots.txt",()=>{const sitemap=RAFIQ_WEBSITE?"\nSitemap: "+RAFIQ_WEBSITE+"/sitemap.xml":"";return new Response("User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin.js\nDisallow: /intake-admin.js"+sitemap,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})})
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
// RAFIQ channel publishing is manual-only after admin approval. No scheduled or startup broadcasts.


console.log(JSON.stringify({
  event:"rafig_runtime_configuration",
  openAIConfigured:Boolean(process.env.OPENAI_API_KEY),
  metaWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
  metaOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
  whatsappSendingEnabled:process.env.WHATSAPP_SENDING_ENABLED==="true",
  agentModel:effectiveAgentModel(),
  kapsoConfigured:kapsoConfigured(),
  kapsoWebhookSecretConfigured:Boolean(kapsoWebhookSecret())
}));
