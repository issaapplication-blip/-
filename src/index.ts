import { applySecurityHeaders } from "./http-cache-policy";
import { classifyTelegramUpdateClaim, parseTelegramUpdateId } from "./telegram-update-dedup";
import { Elysia } from "elysia";
import { answerRafiqKnowledge } from "./rafiq-service-knowledge";
import { draftAgentReply } from "./agent";
import { telegramConfigured, telegramSendText, telegramAnswerCallbackQuery, verifyTelegramWebhookSecret } from "./telegram";

const port = Number(process.env.PORT ?? 7860);
const startedAt = new Date().toISOString();
const effectiveAgentModel = () => {
  const provider = (process.env.RAFIQ_AGENT_PROVIDER ?? "gemini").trim().toLowerCase();
  if (provider === "gemini") return (process.env.RAFIQ_GEMINI_MODEL ?? "gemini-3.6-flash").trim();
  return (process.env.RAFIQ_AGENT_MODEL ?? "not-configured").trim() || "not-configured";
};
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
const fileResponse=async(path:string,type:string,cache="no-store")=>{const cached=fileCache.get(path+"|"+type);if(cached)return new Response(cached.body,{status:200,headers:{"Content-Type":type,"Content-Length":String(cached.body.byteLength),"Cache-Control":cache}});const file=Bun.file(path);if(!(await file.exists()))return new Response("Not Found",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});let body:any=await file.arrayBuffer();if(type.startsWith("text/html")&&!PUBLIC_I18N_EXCLUDED.has(path)){let html=new TextDecoder().decode(body);if(type.startsWith("text/html")&&!html.includes("id=\"rafig-logo-quality\"")){html=html.includes("</head>")?html.replace("</head>",RAFIQ_LOGO_STYLE+"</head>"):RAFIQ_LOGO_STYLE+html;}if(!html.includes("/css/device.css")){const marker="</head>";const tag='<link rel="stylesheet" href="/css/device.css?v=72">';html=html.includes(marker)?html.replace(marker,tag+marker):tag+html;}body=html;}const bytes=typeof body==="string"?new TextEncoder().encode(body):new Uint8Array(body);if(bytes.byteLength<=FILE_CACHE_MAX_BYTES){const key=path+"|"+type;while(fileCacheBytes+bytes.byteLength>FILE_CACHE_MAX_BYTES&&fileCache.size){const first=fileCache.keys().next().value;if(first){const oldEntry=fileCache.get(first);fileCache.delete(first);fileCacheBytes-=oldEntry?.body.byteLength||0}else break}const stored=new Uint8Array(bytes);fileCache.set(key,{body:stored,type});fileCacheBytes+=stored.byteLength;}return new Response(bytes,{status:200,headers:{"Content-Type":type,"Content-Length":String(bytes.byteLength),"Cache-Control":cache}})};
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
    await telegramSendText(chatId,telegramSigned("مناطق دليل RAFIQ:\n"+areas.map(x=>"• "+x).join("\n")+"\n\nتظهر المراكز بعد اعتمادها من الإدارة."));
    return{ok:true,status:"directory_areas"};
  }
  if(data.startsWith("dir:")){
    const selected=categories.find(x=>x[1]===data.slice(4));
    if(selected)await telegramSendText(chatId,telegramSigned("الفئة: "+selected[0]+"\n\nسيتم عرض المراكز بعد مراجعتها واعتمادها من إدارة RAFIQ. لا يوجد خصم أو كود مؤكد قبل موافقة الإدارة."));
    return{ok:true,status:"directory_category"};
  }
  const command=rawText.toLowerCase().split(/\s+/)[0];
  if(command==="/start"||command==="/help"||command==="/services"||command==="/directory"){
    await telegramSendText(chatId,telegramSigned("أهلًا بك في RAFIQ | رفيق 🇱🇧\nنصل بالحب والأمان لرعاية العائلة.\n\nدليل المراكز: المختبرات الطبية، الأشعة والتصوير، العلاج الفيزيائي، بيع المعدات الطبية وتأجيرها.\n\nلا يستقبل البوت طلبات تقديم أو ملفات. لا تُنشر المراكز أو الخصومات إلا بعد موافقة الإدارة."),menu);
    return{ok:true,status:"directory_menu"};
  }
  if(command==="/areas"){
    await telegramSendText(chatId,telegramSigned("مناطق الدليل:\n"+areas.map(x=>"• "+x).join("\n")));
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
.post("/api/agent/chat",({set})=>{set.status=410;return{ok:false,error:"Legacy web intake assistant is retired."}})
.post("/api/agent/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const message=typeof input?.message==="string"?input.message.trim():"";if(!message||message.length>8000){set.status=400;return{ok:false,error:"invalid message"}}try{const result=await draftAgentReply(message,typeof input?.language==="string"?input.language:undefined);return{ok:true,draft:result.reply,model:result.model,humanApprovalRequired:true}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/agent/outreach-draft",({set})=>{set.status=410;return{ok:false,error:"Institution outreach workflow is retired."}})
.post("/api/channel/draft",async({request,set})=>{if(!requireAdminToken(request)){set.status=401;return{ok:false,error:"unauthorized"}}let input:any;try{input=await request.json()}catch{set.status=400;return{ok:false,error:"invalid json"}}const topic=typeof input?.topic==="string"?input.topic.trim():"",language=typeof input?.language==="string"?input.language.trim():"ar";if(!topic||topic.length>4000||language.length>40){set.status=400;return{ok:false,error:"invalid topic or language"}}try{const result=await draftAgentReply(`Prepare a public WhatsApp Channel post for the official RAFIQ | رفيق channel.\nLanguage: ${language}\nTopic: ${topic}\nAudience: people seeking approved medical services in Lebanon. Categories: medical laboratories, radiology/imaging centres, physiotherapy centres, medical equipment sales and rental centres. Only mention centre names, services, prices, discount values, codes, or contact details when they are explicitly approved and supplied in the topic. Do not invent listings, partnerships, bookings, discounts, or availability. Do not request personal or medical data. WhatsApp and Telegram content is draft-only and must be copied and published manually by an administrator after approval. Return only the ready-to-review announcement.`);return{ok:true,draft:result.reply,model:result.model,channel:"RAFIQ official WhatsApp Channel",publishMode:"manual-admin",humanApprovalRequired:true,sendingPerformed:false}}catch{set.status=502;return{ok:false,error:"agent provider request failed"}}})
.post("/api/whatsapp/send-text",({set})=>{set.status=410;return{ok:false,error:"WhatsApp automation is retired; use the WhatsApp app and channels manually."}})
.get("/",()=>fileResponse("public/index.html","text/html; charset=utf-8","no-store"))
.get("/agent.html",()=>fileResponse("public/agent.html","text/html; charset=utf-8","no-store"))
.get("/admin",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin/",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/admin.html",()=>fileResponse("public/admin.html","text/html; charset=utf-8"))
.get("/complete.html",()=>fileResponse("public/complete.html","text/html; charset=utf-8","no-store"))
.get("/install-app.js",()=>fileResponse("public/install-app.js","application/javascript","no-cache")).get("/assets/rafig-logo.png",()=>fileResponse("public/assets/rafig-logo.png","image/png","no-cache"))
.get("/css/device.css",()=>fileResponse("public/css/device.css","text/css","no-cache"))

.get("/manifest.webmanifest",()=>fileResponse("public/manifest.webmanifest","application/manifest+json"))
.get("/sitemap.xml",()=>fileResponse("public/sitemap.xml","application/xml; charset=utf-8","no-store"))
.get("/*",async({request,set})=>{const pathname=new URL(request.url).pathname;if(pathname==="/"||pathname.startsWith("/api/")){set.status=404;return{ok:false,error:"not found"}}let decoded="";try{decoded=decodeURIComponent(pathname)}catch{set.status=400;return{ok:false,error:"invalid path"}}if(!decoded.startsWith("/")||decoded.includes("..")||!/^[A-Za-z0-9._~!$&'()*+,;=:@%\\/-]+$/.test(decoded)){set.status=404;return{ok:false,error:"not found"}}const ext=decoded.split(".").pop()?.toLowerCase()??"";const mime:Record<string,string>={js:"application/javascript; charset=utf-8",css:"text/css; charset=utf-8",json:"application/json; charset=utf-8",webmanifest:"application/manifest+json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",txt:"text/plain; charset=utf-8",xml:"application/xml; charset=utf-8",woff:"font/woff",woff2:"font/woff2",map:"application/json; charset=utf-8"};if(!mime[ext]){set.status=404;return{ok:false,error:"not found"}}const cache=["png","jpg","jpeg","webp","svg","ico","woff","woff2"].includes(ext)?"public, max-age=86400, stale-while-revalidate=604800":["js","css","json","webmanifest","xml"].includes(ext)?"public, max-age=300, stale-while-revalidate=86400":"no-store";return fileResponse("public"+decoded,mime[ext],cache)})
.get("/:page",({params,set})=>{const page=String(params.page??"");if(!/^[a-z0-9-]+\.html$/i.test(page)||page==="admin.html"){set.status=404;return{ok:false,error:"not found"}}return fileResponse(`public/${page}`,"text/html; charset=utf-8","no-store")})
.get("/robots.txt",()=>new Response("User-agent: *\nAllow: /\nDisallow: /admin.html\nSitemap: https://index-html.issaapplication.workers.dev/sitemap.xml",{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}}))
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
console.log(JSON.stringify({
  event:"rafig_runtime_configuration",
  telegramConfigured:telegramConfigured(),
  telegramWebhookRegistration:"unchanged; automatic registration disabled",
  whatsappMode:"manual-only",
  agentModel:effectiveAgentModel(),
}));
