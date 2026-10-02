import { Elysia } from "elysia";
import { draftAgentReply, draftInstitutionOutreach } from "./agent";
import { ensureKapsoWebhook, kapsoConfigured, kapsoSendText, kapsoWebhookSecret } from "./kapso";
import { rafiqFallback } from "./rafiq-local-agent";

const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();
let lastKapsoWebhookAt: string | null = null;
let lastKapsoWebhookEvent: string | null = null;
const AGENT_DEFAULT_MODEL = "gpt-6-luna";
const effectiveAgentModel = () => {
  const configured = (process.env.RAFIQ_AGENT_MODEL ?? "").trim();
  return !configured || configured === "gpt-5.6-luna" ? AGENT_DEFAULT_MODEL : configured;
};
const CARE_KEYWORD_RE = /رعاية|مسن|رعاية منزلية|تمريض|\bkareh\b|\bnurse\b/i;
const CARE_SESSION_TTL_MS = 30 * 60 * 1000;
const careSessions = new Map<string, { updatedAt: number; messages: string[] }>();
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
const securityHeaders = {"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://qmuxaehrahfsnabyjens.supabase.co https://graph.facebook.com https://api.kapso.ai","Cache-Control":"no-store"};
const timingSafeEqual=(a:Uint8Array,b:Uint8Array)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const verifyMetaSignature=async(body:string,signature:string|null)=>{const secret=process.env.META_APP_SECRET;if(!secret||!signature?.startsWith("sha256="))return false;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=`sha256=${hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)))}`;return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(signature))};
const verifyKapsoSignature=async(body:string,signature:string|null)=>{const secret=kapsoWebhookSecret();if(!secret||!signature)return false;const normalized=signature.startsWith("sha256=")?signature.slice(7):signature;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const expected=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));return timingSafeEqual(new TextEncoder().encode(expected),new TextEncoder().encode(normalized))};const kapsoIdentity=(message:any,conversation:any={})=>({phone:typeof message?.from==="string"&&message.from?message.from:(typeof conversation?.phone_number==="string"&&conversation.phone_number?conversation.phone_number:""),bsuid:typeof message?.from_user_id==="string"&&message.from_user_id?message.from_user_id:(typeof conversation?.business_scoped_user_id==="string"&&conversation.business_scoped_user_id?conversation.business_scoped_user_id:""),username:typeof message?.username==="string"?message.username:(typeof conversation?.username==="string"?conversation.username:"")});const processKapsoMessage=async(message:any,conversation:any={})=>{const identity=kapsoIdentity(message,conversation);const forbiddenDigits="70600157";if(identity.phone?.replace(/\D/g,"").endsWith(forbiddenDigits)){console.warn(JSON.stringify({event:"rafig_forbidden_number_blocked",fromSuffix:identity.phone.slice(-4)}));return{id:String(message?.id??"unknown"),status:"blocked_forbidden_number"}}const body=typeof message?.text?.body==="string"?message.text.body.trim():(typeof message?.kapso?.content==="string"?message.kapso.content.trim():"");const destination=identity.phone?{to:identity.phone}:{recipient:identity.bsuid};if(!body||(!destination.to&&!destination.recipient)){return{id:String(message?.id??"unknown"),status:"ignored_missing_identity_or_text"}}try{console.log(JSON.stringify({event:"rafig_kapso_inbound_received",messageId:String(message.id??""),fromSuffix:identity.phone?identity.phone.slice(-4):null,businessScopedUserId:identity.bsuid||null,username:identity.username||null,phoneNumberId:String(message?.kapso?.phone_number_id??conversation?.phone_number_id??"")}));const result=await draftInboundReply(body,identity.phone||undefined);if(process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true"&&process.env.WHATSAPP_SENDING_ENABLED==="true"){try{const outbound=kapsoConfigured()?await kapsoSendText(destination,result.reply):identity.phone?await sendWhatsAppText(identity.phone,result.reply):null;if(!outbound)throw new Error("BSUID-only inbound requires Kapso API configuration");console.log(JSON.stringify({event:"rafig_kapso_auto_reply_sent",provider:kapsoConfigured()?"kapso":"meta",fromSuffix:identity.phone?identity.phone.slice(-4):null,businessScopedUserId:identity.bsuid||null,inboundMessageId:String(message.id??""),outboundMessageId:outbound?.messages?.[0]?.id??null}));return{id:String(message.id??""),status:outbound?.messages?.[0]?.id?"auto_replied":"draft_ready"}}catch(error){console.error(JSON.stringify({event:"rafig_kapso_auto_reply_failed",fromSuffix:identity.phone?identity.phone.slice(-4):null,businessScopedUserId:identity.bsuid||null,inboundMessageId:String(message.id??""),error:String(error)}));return{id:String(message.id??""),status:"draft_ready_send_failed"}}}return{id:String(message.id??""),status:"draft_ready"}}catch(error){console.error(JSON.stringify({event:"rafig_kapso_agent_failed",messageId:String(message.id??""),error:String(error)}));return{id:String(message.id??""),status:"draft_failed"}}};const extractIncomingMessages=(payload:any)=>{const messages:Array<{from:string;id:string;text?:string;type:string;timestamp?:string}>=[];for(const entry of payload?.entry??[])for(const change of entry?.changes??[])for(const message of change?.value?.messages??[])messages.push({from:String(message.from??""),id:String(message.id??""),text:typeof message.text?.body==="string"?message.text.body:undefined,type:String(message.type??"unknown"),timestamp:message.timestamp?String(message.timestamp):undefined});return messages};
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://qmuxaehrahfsnabyjens.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY ?? "";
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
const fileResponse=async(path:string,type:string,cache="no-store")=>{const file=Bun.file(path);if(!(await file.exists()))return new Response("Not Found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});const body=await file.arrayBuffer();return new Response(body,{status:200,headers:{"Content-Type":type,"Content-Length":String(body.byteLength),"Cache-Control":cache}})};
const app=new Elysia()
.onAfterHandle(({response})=>{if(response instanceof Response)for(const [k,v] of Object.entries(securityHeaders))response.headers.set(k,v)})
.get("/health",()=>({ok:true,service:"rafig-whatsapp-gateway",startedAt,kapsoWebhookLastReceivedAt:lastKapsoWebhookAt}))
.get("/api/status",()=>({ok:true,platform:"RAFIQ | رفيق",mode:kapsoConfigured()?"kapso-agent-ready":"meta-cloud-api-ready",kapsoConfigured:kapsoConfigured(),kapsoEnabled:process.env.KAPSO_ENABLED==="true",whatsappSending:process.env.WHATSAPP_SENDING_ENABLED==="true",whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",whatsappWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN&&process.env.META_APP_SECRET),whatsappOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN&&process.env.META_PHONE_NUMBER_ID),openAIConfigured:Boolean(process.env.OPENAI_API_KEY),agentModel:effectiveAgentModel(),channelMode:"agent-draft-admin-publish",proactiveMessagesRequireApproval:true}))
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
  const out=await supabaseRest("/rest/v1/whatsapp_outbox?application_id=eq."+encodeURIComponent(applicationId)+"&status=eq.pending&select=id,recipient,message,qr_payload&limit=1",token);
  const row=Array.isArray(out.body)?out.body[0]:null;
  if(!out.response.ok){set.status=502;return{ok:false,error:"could not load approval message"}}
  if(!row){
    const sent=await supabaseRest("/rest/v1/whatsapp_outbox?application_id=eq."+encodeURIComponent(applicationId)+"&status=eq.sent&select=id,provider_message_id&limit=1",token);
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
.post("/api/kapso/webhook",async({request,set})=>{const contentLength=Number(request.headers.get("content-length")??0);if(contentLength>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}const body=await request.text();if(body.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}if(!(await verifyKapsoSignature(body,request.headers.get("x-webhook-signature")))){set.status=401;return{ok:false,error:"invalid Kapso webhook signature"}}let payload:any;try{payload=JSON.parse(body)}catch{set.status=400;return{ok:false,error:"invalid json"}}const event=request.headers.get("x-webhook-event")??String(payload?.type??"");if(event!=="whatsapp.message.received"){return{ok:true,ignored:event||"unknown"}}lastKapsoWebhookAt=new Date().toISOString();lastKapsoWebhookEvent=event;const payloads=payload?.batch===true&&Array.isArray(payload?.data)?payload.data:[payload];console.log(JSON.stringify({event:"rafig_kapso_webhook_accepted",received:payloads.length,idempotencyKey:request.headers.get("x-idempotency-key")??null}));queueMicrotask(()=>{void Promise.all(payloads.map((item:any)=>processKapsoMessage(item?.message??item?.messages?.[0],item?.conversation??item?.message?.conversation??{}))).catch(error=>console.error(JSON.stringify({event:"rafig_kapso_background_processing_failed",error:String(error)})))});return{ok:true,event,received:payloads.length,queued:true}}).post("/api/whatsapp/webhook",async({request,set})=>{const contentLength=Number(request.headers.get("content-length")??0);if(contentLength>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}const body=await request.text();if(body.length>MAX_WEBHOOK_BODY){set.status=413;return{ok:false,error:"payload too large"}}if(!(await verifyMetaSignature(body,request.headers.get("x-hub-signature-256")))){set.status=401;return{ok:false,error:"invalid webhook signature"}}let payload:any;try{payload=JSON.parse(body)}catch{set.status=400;return{ok:false,error:"invalid json"}}if(payload?.object!=="whatsapp_business_account"){set.status=400;return{ok:false,error:"invalid webhook object"}}const messages=extractIncomingMessages(payload),results:Array<{id:string;status:string}>=[];for(const message of messages){if(!message.text){results.push({id:message.id,status:"ignored_non_text"});continue}try{const result=await draftInboundReply(message.text,message.from);if(process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true"&&process.env.WHATSAPP_SENDING_ENABLED==="true"){try{const outbound=kapsoConfigured()?await kapsoSendText(message.from,result.reply):await sendWhatsAppText(message.from,result.reply);console.log(JSON.stringify({event:"rafig_auto_reply_sent",provider:kapsoConfigured()?"kapso":"meta",from:message.from,inboundMessageId:message.id,outboundMessageId:outbound?.messages?.[0]?.id??null}));results.push({id:message.id,status:outbound?.messages?.[0]?.id?"auto_replied":"draft_ready"})}catch(error){console.error(JSON.stringify({event:"rafig_auto_reply_failed",provider:kapsoConfigured()?"kapso":"meta",from:message.from,inboundMessageId:message.id,error:String(error)}));results.push({id:message.id,status:"draft_ready_send_failed"})}}else results.push({id:message.id,status:"draft_ready"})}catch{results.push({id:message.id,status:"draft_failed"})}}return{ok:true,received:messages.length,results}})
.get("/api/agent/health",()=>({ok:true,service:"rafig-agent",openAIConfigured:Boolean(process.env.OPENAI_API_KEY),model:effectiveAgentModel()}))
.post("/api/agent/chat",async({request,set})=>{const started=Date.now();console.log(JSON.stringify({event:"rafig_agent_chat_received"}));let input:any;try{input=await request.json()}catch{set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_json"}));return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>4000){set.status=400;console.warn(JSON.stringify({event:"rafig_agent_chat_invalid_message"}));return{ok:false,error:"invalid message"}}try{const result=await draftInboundReply(message);console.log(JSON.stringify({event:"rafig_agent_chat_completed",model:result.model,durationMs:Date.now()-started}));return{ok:true,reply:result.reply,model:result.model}}catch(error){console.error(JSON.stringify({event:"rafig_agent_chat_failed",error:String(error).slice(0,160),durationMs:Date.now()-started}));return{ok:true,reply:rafiqFallback(message),model:"rafig-local-fallback"}}})
.post("/api/agent/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>8000){set.status=400;return{ok:false,error:"invalid message"}}try{const result=await draftAgentReply(message,typeof input?.language==="string"?input.language:undefined);return{ok:true,draft:result.reply,model:result.model,humanApprovalRequired:true}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/agent/outreach-draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const target=input?.target;if(target!=="laboratory"&&target!=="medical_equipment_supplier"&&target!=="radiology_center"){set.status=400;return{ok:false,error:"invalid outreach target"}}const institutionName=typeof input?.institutionName==="string"?input.institutionName.trim():"",language=typeof input?.language==="string"?input.language.trim():"";if(institutionName.length>200||language.length>40){set.status=400;return{ok:false,error:"invalid input"}}try{const result=await draftInstitutionOutreach(target,institutionName,language||undefined);return{ok:true,target,institutionName:institutionName||null,draft:result.reply,model:result.model,humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/channel/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const topic=typeof input?.topic==="string"?input.topic.trim():"",language=typeof input?.language==="string"?input.language.trim():"ar";if(!topic||topic.length>4000||language.length>40){set.status=400;return{ok:false,error:"invalid topic or language"}}try{const result=await draftAgentReply(`Prepare a public WhatsApp Channel post for the official RAFIQ | رفيق channel.\nLanguage: ${language}\nTopic: ${topic}\nAudience: families, caregivers, nurses, healthcare institutions, laboratories, medical equipment suppliers, and radiology centers.\nThe post must be informative, professional, concise, and suitable for a public one-way channel. Do not claim that a partnership, booking, payment, referral, approval, or service has already happened unless explicitly stated in the topic. Do not expose private information. Return only the ready-to-review channel post.`);return{ok:true,draft:result.reply,model:result.model,channel:"RAFIQ official WhatsApp Channel",publishMode:"manual-admin",humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/whatsapp/send-text",async({request,set})=>{if(process.env.WHATSAPP_SENDING_ENABLED!=="true"){set.status=503;return{ok:false,error:"WhatsApp sending is disabled"}}if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const to=typeof input?.to==="string"?input.to.trim():"",body=typeof input?.body==="string"?input.body.trim():"";if(!to||!/^[0-9]{8,15}$/.test(to)||!body||body.length>4096){set.status=400;return{ok:false,error:"invalid recipient or message"}}if(input?.humanApproved!==true){set.status=409;return{ok:false,error:"human approval required"}}try{const result=await sendWhatsAppText(to,body);return{ok:true,messageId:result?.messages?.[0]?.id??null}}catch{set.status=502;return{ok:false,error:"WhatsApp provider request failed"}}})
.get("/",async()=>{const html=await Bun.file("public/index.html").text();return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})})
.get("/agent.html",()=>fileResponse("public/agent.html","text/html; charset=utf-8","no-store"))
.get("/admin",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin/",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.html",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.js",()=>fileResponse("public/admin.js","application/javascript","no-cache"))
.get("/app.js",()=>fileResponse("public/app.js","application/javascript","no-cache"))
.get("/install-pwa.js",()=>fileResponse("public/install-pwa.js","application/javascript","no-cache")).get("/install-app.js",()=>fileResponse("public/install-app.js","application/javascript","no-cache")).get("/js/rafiq-agent.js",()=>fileResponse("public/js/rafiq-agent.js","application/javascript","no-cache")).get("/js/rafiq-kb.js",()=>fileResponse("public/js/rafiq-kb.js","application/javascript","no-cache")).get("/js/rafiq-welcome.js",()=>fileResponse("public/js/rafiq-welcome.js","application/javascript","no-cache")).get("/assets/rafig-logo.png",()=>fileResponse("public/assets/rafig-logo.png","image/png","no-cache"))
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
if (process.env.KAPSO_WEBHOOK_AUTOCONFIG === "true") {
  void ensureKapsoWebhook().catch((error) => console.error(JSON.stringify({event:"rafig_kapso_webhook_autoconfig_unhandled",error:String(error)})));
} else {
  console.log(JSON.stringify({event:"rafig_kapso_webhook_autoconfig_skipped"}));
}

console.log(JSON.stringify({
  event:"rafig_runtime_configuration",
  openAIConfigured:Boolean(process.env.OPENAI_API_KEY),
  metaWebhookConfigured:Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
  metaOutboundConfigured:Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID),
  whatsappSendingEnabled:process.env.WHATSAPP_SENDING_ENABLED==="true",
  whatsappAutoReply:process.env.RAFIQ_WHATSAPP_AUTO_REPLY==="true",
  agentModel:effectiveAgentModel(),
  kapsoConfigured,
  kapsoWebhookSecretConfigured:Boolean(kapsoWebhookSecret())
}));
