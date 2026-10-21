import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const configuredSiteOrigin=(Deno.env.get("RAFIQ_PUBLIC_SITE_URL")||"").trim().replace(/\/+$/,"");
const allowedOrigins=new Set(["https://issaapplication-blip.github.io",configuredSiteOrigin].filter(Boolean));
const cors=(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 return {...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
};
const mime=new Set(["application/pdf","image/jpeg","image/png","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const cats=new Set(["cv","certificate","experience","id_front","id_back","passport","driver_license","portrait","nursing_license","nursing_certificate","medical_report","family_proof","payment_proof","other"]);
const hex=(b:Uint8Array)=>Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(v:string){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers:{...cors(req),"Content-Type":"application/json"}});
 const paths:string[]=[];
 try{
  const form=await req.formData(); const intakeId=String(form.get("intake_id")||""); const token=String(form.get("upload_token")||"");
  if(!intakeId||!token)throw new Error("missing_upload_credentials");
  const h=await hash(token);
  const {data:intake,error}=await sb.from("application_intakes").select("id,application_type,status,upload_token_hash,upload_token_expires_at").eq("id",intakeId).single();
  if(error||!intake)throw new Error("invalid_intake_id");
  if(!["pending","review"].includes(intake.status))throw new Error("upload_window_closed");
  if(intake.upload_token_hash!==h)throw new Error("invalid_upload_token");
  if(!intake.upload_token_expires_at||new Date(intake.upload_token_expires_at).getTime()<Date.now())throw new Error("upload_token_expired");
  const {count,error:ce}=await sb.from("application_intake_files").select("id",{count:"exact",head:true}).eq("intake_id",intakeId); if(ce)throw ce;
  const files=form.getAll("files").filter(x=>x instanceof File) as File[]; const categories=form.getAll("document_category").map(String);
  if(!files.length)throw new Error("no_files"); if(files.length>8||(count??0)+files.length>8)throw new Error("too_many_files");
  const saved=[];
  for(let i=0;i<files.length;i++){
   const file=files[i]; if(!mime.has(file.type))throw new Error("unsupported_file_type"); if(file.size>10*1024*1024)throw new Error("file_too_large");
   const category=categories[i]||"other"; if(!cats.has(category))throw new Error("invalid_document_category");
   const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-180); const path=`intake/${intakeId}/${crypto.randomUUID()}-${safe}`;
   const {error:ue}=await sb.storage.from("private_documents").upload(path,file,{contentType:file.type,upsert:false}); if(ue)throw ue; paths.push(path);
   const {data:row,error:re}=await sb.from("application_intake_files").insert({intake_id:intakeId,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,document_category:category}).select("id,file_name,storage_path,document_category,verification_status").single(); if(re)throw re; saved.push(row);
  }
  return new Response(JSON.stringify({ok:true,files:saved}),{headers:{...cors(req),"Content-Type":"application/json"}});
 }catch(e){if(paths.length)await sb.storage.from("private_documents").remove(paths);return new Response(JSON.stringify({ok:false,error:e instanceof Error?e.message:"upload_failed"}),{status:400,headers:{...cors(req),"Content-Type":"application/json"}})}
});