import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const configuredSiteOrigin=(Deno.env.get("RAFIQ_PUBLIC_SITE_URL")||"").trim().replace(/\/+$/,"");
const allowedOrigins=new Set(["https://issaapplication-blip.github.io",configuredSiteOrigin].filter(Boolean));
const cors=(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 return {...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"authorization, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
};
const types=new Set(["طلب رعاية عائلية","انتساب مقدم رعاية","انتساب ممرض/ة","انتساب معالج فيزيائي","CV + Cover Letter","انتساب عام"]);
const hex=(b:Uint8Array)=>Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(v:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers:{...cors(req),"Content-Type":"application/json"}});
 try{
  const body=await req.json(); if(body?.website)return new Response(JSON.stringify({ok:true}),{headers:{...cors(req),"Content-Type":"application/json"}});
  const application_type=String(body?.application_type||"").trim();
  const payload=body?.payload&&typeof body.payload==="object"?body.payload:{};
  if(!types.has(application_type))throw new Error("invalid_application_type");
  if(JSON.stringify(payload).length>30000)throw new Error("payload_too_large");
  if(application_type==="CV + Cover Letter"){
   if(String(payload.payment_method||"")!=="Whish Money")throw new Error("cv_payment_must_use_whish_money");
   if(!String(payload.payment_reference||"").trim())throw new Error("cv_payment_reference_required");
   payload.payment_status="pending_verification"; payload.payment_required=true;
  }
  const applicant_name=String(payload.name||[payload.first,payload.last].filter(Boolean).join(" ")||"").slice(0,200);
  const phone=String(payload.phone||"").slice(0,50); const area=String(payload.area||payload.preferred_location||payload.care_location||"").slice(0,200);
  const token=crypto.randomUUID()+"-"+crypto.randomUUID(); const tokenHash=await hash(token); const expires=new Date(Date.now()+7200000).toISOString();
  const {data,error}=await sb.from("application_intakes").insert({application_type,applicant_name,phone,area,payload,source:"platform",upload_token_hash:tokenHash,upload_token_expires_at:expires}).select("id,application_number,application_type,status,created_at").single();
  if(error)throw error;
  const agent_reply=application_type==="CV + Cover Letter"?`تم استلام طلب CV رقم ${data.application_number}. الطلب بانتظار تأكيد Whish Money من الإدارة ولا يبدأ العمل قبل التأكيد.`:`تم استلام الطلب رقم ${data.application_number} وحفظه بنجاح. الطلب قيد مراجعة الإدارة.`;
  await sb.from("application_intakes").update({agent_reply}).eq("id",data.id);
  return new Response(JSON.stringify({ok:true,application:{...data,agent_reply},upload_token:token,upload_token_expires_at:expires}),{headers:{...cors(req),"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({ok:false,error:e instanceof Error?e.message:"invalid_request"}),{status:400,headers:{...cors(req),"Content-Type":"application/json"}})}
});