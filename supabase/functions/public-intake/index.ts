import { createClient } from "npm:@supabase/supabase-js@2";
const configuredSiteOrigin=(Deno.env.get("RAFIQ_PUBLIC_SITE_URL")||"").trim().replace(/\/+$/,"");
const allowedOrigins=new Set(["https://issaapplication-blip.github.io",configuredSiteOrigin].filter(Boolean));
const cors=(req?:Request)=>{const origin=req?.headers.get("Origin")||"";return {...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}};
function json(data:any,status=200,req?:Request){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors(req),"Cache-Control":"no-store"}})}
async function readLimitedBody(req:Request,maxBytes:number):Promise<Uint8Array|null>{
  if(!req.body)return new Uint8Array();
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>maxBytes){await reader.cancel();return null}chunks.push(part.value)}
  }catch{return null}
  const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}return body;
}
function clean(s:any,max:number){return String(s??"").trim().slice(0,max)}
function safeName(s:string){return (s||"file").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"file"}
// Trust the filename extension, not the client-supplied MIME header.
// Reject unsupported extensions before creating any intake database record.
const ALLOWED_FILE_TYPES:Record<string,string>={".pdf":"application/pdf",".doc":"application/msword",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"};
function fileType(file:File){const match=(file.name||"").toLowerCase().match(/\.[^.]+$/);return match?ALLOWED_FILE_TYPES[match[0]]||null:null}
function validateFiles(files:File[]){return files.every(file=>fileType(file)!==null)}
const url=Deno.env.get("SUPABASE_URL")!;
const secretKeysRaw=Deno.env.get("SUPABASE_SECRET_KEYS")||"";
let secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
try{if(!secretKey&&secretKeysRaw){const keys=JSON.parse(secretKeysRaw);secretKey=keys.default||""}}catch{}
const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,req);
  if(!secretKey)return json({ok:false,error:"server_configuration_incomplete"},500,req);
  const maxBodyBytes=18*1024*1024;const len=Number(req.headers.get("content-length")||0);if(len>maxBodyBytes)return json({ok:false,error:"حجم الطلب يتجاوز الحد المسموح"},413,req);
  const raw=await readLimitedBody(req,maxBodyBytes);if(raw===null)return json({ok:false,error:"حجم الطلب يتجاوز الحد المسموح"},413,req);
  const contentType=req.headers.get("content-type")||"";const form=await new Response(raw,{headers:{"content-type":contentType}}).formData().catch(()=>null);if(!form)return json({ok:false,error:"invalid form"},400,req);
  const institutionType=clean(form.get("institution_type"),80);
  const isInstitution=["laboratory","radiology_center","medical_equipment_center"].includes(institutionType);
  const files=form.getAll("files").filter((v):v is File=>v instanceof File&&v.size>0); if(!validateFiles(files))return json({ok:false,error:"نوع الملف غير مسموح. الأنواع المقبولة PDF وDOC وDOCX وJPG وPNG وWEBP."},415,req); const payload:any={};
  if(isInstitution){
    if(files.length>10)return json({ok:false,error:"يمكن إرفاق 10 ملفات كحد أقصى"},400,req);
    if(files.some(f=>f.size>8*1024*1024))return json({ok:false,error:"الحد الأقصى لحجم الملف الواحد 8MB"},413,req);
    const institutionName=clean(form.get("institution_name"),250),contactName=clean(form.get("contact_name"),200),phone=clean(form.get("phone"),40);
    if(!institutionName||!contactName||!phone)return json({ok:false,error:"اسم الجهة واسم المسؤول ورقم الهاتف مطلوبة"},400,req);
    for(const [key,value] of form.entries()){if(value instanceof File||key==="institution_type")continue;payload[key]=clean(value,5000)}
    payload.institution_type=institutionType;payload.submitted_at=new Date().toISOString();
    const {data:intake,error}=await admin.from("institution_intakes").insert({institution_type:institutionType,institution_name:institutionName,contact_name:contactName,phone,email:clean(form.get("email"),250)||null,address:clean(form.get("address"),500)||null,governorate:clean(form.get("governorate"),120)||null,district:clean(form.get("district"),120)||null,locality:clean(form.get("locality"),160)||null,license_number:clean(form.get("license_number"),160)||null,services:clean(form.get("services"),4000)||null,notes:clean(form.get("notes"),4000)||null,payload,status:"pending"}).select("*").single();
    if(error||!intake){console.error(JSON.stringify({event:"public_institution_create_failed",code:error?.code||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502,req)}
    let uploaded=0; for(const file of files){const path="institutions/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:fileType(file)!,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_institution_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("institution_intake_files").insert({institution_intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:fileType(file)!,file_size:file.size,verification_status:"pending",document_category:"institution_registration"});if(!ins.error)uploaded++}
    const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active"); if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب تسجيل جهة صحية جديد",message:"تم استلام طلب تسجيل "+institutionName+" برقم "+String(intake.request_id),type:"new_institution_intake"})));
    return json({ok:true,status:"received",request_id:intake.request_id,uploaded},200,req);
  }
  const role=clean(form.get("role"),50); if(!new Set(["caregiver","nurse","physiotherapist","family"]).has(role))return json({ok:false,error:"نوع الطلب غير معروف"},400,req);
  const first=clean(form.get("first_name"),80),lastName=clean(form.get("last_name"),80),familyName=clean(form.get("family_name"),160),patientName=clean(form.get("patient_name"),160);
  const applicantName=(role==="family"?familyName:(first+" "+lastName).trim())||patientName,phone=clean(form.get("phone"),40); if(!applicantName||!phone)return json({ok:false,error:"الاسم ورقم الهاتف مطلوبان"},400,req);
  const fileEntries=form.getAll("cv").concat(form.getAll("profile_photo")).filter((v):v is File=>v instanceof File&&v.size>0); if(fileEntries.length>2)return json({ok:false,error:"عدد الملفات المسموح به غير صالح"},400,req); if(!validateFiles(fileEntries))return json({ok:false,error:"نوع الملف غير مسموح. الأنواع المقبولة PDF وDOC وDOCX وJPG وPNG وWEBP."},415,req);
  if(fileEntries.some(f=>f.size>(fileType(f)!.startsWith("image/")?5*1024*1024:10*1024*1024)))return json({ok:false,error:"حجم أحد الملفات يتجاوز الحد المسموح"},413,req);
  for(const [key,value] of form.entries()){if(value instanceof File||key==="consent"||key==="role")continue;payload[key]=clean(value,5000)}
  payload.role=role;payload.submitted_without_account=true;payload.submitted_at=new Date().toISOString();
  const applicationType=({family:"طلب رعاية عائلية",caregiver:"انتساب مقدم رعاية",nurse:"انتساب ممرض/ة",physiotherapist:"انتساب معالج فيزيائي"} as Record<string,string>)[role],area=clean(form.get(role==="family"?"care_location":"preferred_location"),250);
  const {data:intake,error}=await admin.from("application_intakes").insert({application_type:applicationType,applicant_name:applicantName,phone,area,status:"review",payload,source:"platform"}).select("*").single();
  if(error||!intake){console.error(JSON.stringify({event:"public_intake_create_failed",code:error?.code||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502,req)}
  const requestId="RAFIQ-REQ-"+String(intake.application_number).padStart(6,"0"); await admin.from("application_intakes").update({payload:{...(intake.payload||{}),request_id:requestId},updated_at:new Date().toISOString()}).eq("id",intake.id);
  let uploaded=0; for(const file of fileEntries){const category=file===form.get("cv")?"cv":"profile_photo",path="intakes/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:fileType(file)!,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_intake_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("application_intake_files").insert({intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type||null,file_size:file.size,verification_status:"pending",document_category:category});if(!ins.error)uploaded++}
  const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active"); if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب جديد من منصة RAFIQ",message:"تم استلام طلب جديد رقم "+String(intake.application_number)+" — "+applicantName,type:"new_public_intake"})));
  return json({ok:true,status:"received",request_id:requestId,application_number:intake.application_number,uploaded},200,req);
});