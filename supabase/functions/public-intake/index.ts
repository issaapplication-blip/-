import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-rafiq-client-ip","Access-Control-Allow-Methods":"POST,OPTIONS"};
function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}
function clean(s:any,max:number){return String(s??"").trim().slice(0,max)}
function safeName(s:string){return (s||"file").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"file"}
const url=Deno.env.get("SUPABASE_URL")!;
const secretKeysRaw=Deno.env.get("SUPABASE_SECRET_KEYS")||"";
let secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
try{if(!secretKey&&secretKeysRaw){const keys=JSON.parse(secretKeysRaw);secretKey=keys.default||""}}catch{}
const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false}});
// Per-isolate soft throttle. A durable Cloudflare/Supabase limiter is still required for a
// globally consistent limit across edge isolates; this layer is defense-in-depth only.
const attempts=new Map<string,number[]>();
const WINDOW=10*60*1000, MAX_REQUESTS=5;
function rateLimited(req:Request){
 const ip=clean(req.headers.get("x-rafiq-client-ip")||req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown",100);
 const now=Date.now(), recent=(attempts.get(ip)||[]).filter(t=>now-t<WINDOW);
 if(recent.length>=MAX_REQUESTS){attempts.set(ip,recent);return true}
 recent.push(now);attempts.set(ip,recent);
 if(attempts.size>2000){for(const [key,times] of attempts){if(!times.length||now-times[times.length-1]>WINDOW)attempts.delete(key)}}
 return false;
}
const allowedMime=new Set(["application/pdf","image/jpeg","image/png"]);
async function validFile(file:File){
 if(!allowedMime.has(file.type)||file.size<=0||file.size>8*1024*1024)return false;
 const b=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(file.type==="application/pdf")return b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46;
 if(file.type==="image/jpeg")return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
 if(file.type==="image/png")return b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47;
 return false;
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
 if(!secretKey)return json({ok:false,error:"server_configuration_incomplete"},500);
 const len=Number(req.headers.get("content-length")||0); if(len>18*1024*1024)return json({ok:false,error:"حجم الطلب يتجاوز الحد المسموح"},413);
 if(rateLimited(req))return json({ok:false,error:"تم تجاوز عدد المحاولات. يرجى الانتظار ثم إعادة المحاولة."},429);
 const form=await req.formData().catch(()=>null); if(!form)return json({ok:false,error:"تعذر قراءة النموذج. تحقق من البيانات والملفات."},400);
 // Hidden honeypot: silently accept bot submissions without creating records.
 if(clean(form.get("website"),300))return json({ok:true,status:"received"});
 if(clean(form.get("privacy_consent"),30)!=="accepted")return json({ok:false,error:"يرجى الموافقة على مراجعة البيانات قبل الإرسال."},400);
 const files=form.getAll("files").filter((v):v is File=>v instanceof File&&v.size>0);
 const categories=form.getAll("document_category").map(v=>clean(v,80));
 const allowedCategories=new Set(["cv","certificate","experience","nursing_license","nursing_certificate","institution_logo","institution_image","institution_registration","other"]);
 if(categories.some(c=>!allowedCategories.has(c)))return json({ok:false,error:"نوع أحد المرفقات غير صالح."},400);
 if(categories.length!==files.length)return json({ok:false,error:"تعذر مطابقة الملفات المرفقة. أعد اختيار الملفات وحاول مجددًا."},400);
 if(files.length>8)return json({ok:false,error:"يمكن إرفاق 8 ملفات كحد أقصى"},400);
 for(const file of files){if(!(await validFile(file)))return json({ok:false,error:"الملفات المسموحة PDF أو JPG أو PNG فقط، وبحد أقصى 8MB للملف."},415)}
 const institutionType=clean(form.get("institution_type"),80);
 const isInstitution=["laboratory","radiology_center","medical_equipment_center"].includes(institutionType);
 const payload:any={};
 if(isInstitution){
  const institutionName=clean(form.get("institution_name"),250),contactName=clean(form.get("contact_name"),200),phone=clean(form.get("phone"),40);
  const address=clean(form.get("address"),500),services=clean(form.get("services"),4000),adDuration=clean(form.get("ad_duration"),80);
  if(!institutionName||!contactName||!phone||!address||!services||!adDuration)return json({ok:false,error:"اسم المنشأة واسم المسؤول والهاتف والعنوان والخدمات ومدة الإعلان حقول مطلوبة."},400);
  for(const [key,value] of form.entries()){if(value instanceof File||key==="institution_type"||key==="website")continue;payload[key]=clean(value,5000)}
  payload.institution_type=institutionType;payload.submitted_at=new Date().toISOString();
  const {data:intake,error}=await admin.from("institution_intakes").insert({institution_type:institutionType,institution_name:institutionName,contact_name:contactName,phone,email:clean(form.get("email"),250)||null,address:clean(form.get("address"),500)||null,governorate:clean(form.get("governorate"),120)||null,district:clean(form.get("district"),120)||null,locality:clean(form.get("locality"),160)||null,license_number:clean(form.get("license_number"),160)||null,services:clean(form.get("services"),4000)||null,notes:clean(form.get("notes"),4000)||null,payload,status:"pending"}).select("*").single();
  if(error||!intake){console.error(JSON.stringify({event:"public_institution_create_failed",code:error?.code||null,status:error?.status||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502)}
  let uploaded=0;for(let i=0;i<files.length;i++){const file=files[i],category=clean(form.getAll("document_category")[i]||"institution_registration",80),path="institutions/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:file.type,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_institution_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("institution_intake_files").insert({institution_intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:"pending",document_category:category});if(!ins.error)uploaded++}
  const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active");if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب إعلان/تسجيل منشأة جديد",message:"تم استلام طلب منشأة "+institutionName+" برقم "+String(intake.request_id),type:"new_institution_intake"})));
  return json({ok:true,status:"received",request_id:intake.request_id,uploaded});
 }
 const role=clean(form.get("role"),50);if(!new Set(["caregiver","nurse","physiotherapist","family","doctor","member"]).has(role))return json({ok:false,error:"نوع الطلب غير معروف."},400);
 const requiredFields:Record<string,string[]>={nurse:["first_name","last_name","phone","preferred_location","qualification","license_number","years_experience","specialty","availability"],caregiver:["first_name","last_name","phone","preferred_location","care_type","work_arrangement"],physiotherapist:["first_name","last_name","phone","preferred_location","license_number","years_experience","specialty","service_mode"],family:["family_name","phone","care_location","service_type","patient_age","duration","patient_condition"],doctor:["first_name","last_name","phone","specialty","license_number","years_experience","workplace","preferred_location","availability","service_mode"],member:["first_name","last_name","phone","preferred_location","benefit_interest"]};
 for(const field of requiredFields[role]||[])if(!clean(form.get(field),5000))return json({ok:false,error:"يرجى استكمال جميع الحقول المطلوبة."},400);
 const requiredDocs:Record<string,string[]>={nurse:["cv","nursing_certificate","nursing_license"],caregiver:["cv"],physiotherapist:["cv","certificate"],doctor:["cv","certificate"]};
 for(const required of (requiredDocs[role]||[])){if(!categories.includes(required))return json({ok:false,error:"يرجى إرفاق جميع الوثائق المطلوبة قبل الإرسال."},400)}
 const first=clean(form.get("first_name"),80),lastName=clean(form.get("last_name"),80),familyName=clean(form.get("family_name"),160),phone=clean(form.get("phone"),40);
 const applicantName=(role==="family"?familyName:(first+" "+lastName).trim())||clean(form.get("name"),160);
 if(!applicantName||!phone)return json({ok:false,error:"الاسم ورقم الهاتف حقول مطلوبة."},400);
 for(const [key,value] of form.entries()){if(value instanceof File||key==="consent"||key==="role"||key==="website"||key==="document_category")continue;payload[key]=clean(value,5000)}
 payload.role=role;payload.submitted_without_account=true;payload.submitted_at=new Date().toISOString();
 const applicationType=({family:"طلب رعاية عائلية",caregiver:"انتساب مقدم رعاية",nurse:"انتساب ممرض/ة",physiotherapist:"انتساب معالج فيزيائي",doctor:"انتساب عام",member:"انتساب عام"} as Record<string,string>)[role];
 const area=clean(form.get(role==="family"?"care_location":"preferred_location"),250);
 const {data:intake,error}=await admin.from("application_intakes").insert({application_type:applicationType,applicant_name:applicantName,phone,area,status:"review",payload,source:"platform"}).select("*").single();
 if(error||!intake){console.error(JSON.stringify({event:"public_intake_create_failed",code:error?.code||null,status:error?.status||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502)}
 const requestId="RAFIQ-REQ-"+String(intake.application_number).padStart(6,"0");await admin.from("application_intakes").update({payload:{...(intake.payload||{}),request_id:requestId},updated_at:new Date().toISOString()}).eq("id",intake.id);
 let uploaded=0;for(let i=0;i<files.length;i++){const file=files[i],category=categories[i]||"other",path="intakes/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:file.type,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_intake_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("application_intake_files").insert({intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:"pending",document_category:category});if(!ins.error)uploaded++}
 const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active");if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب جديد من منصة RAFIQ",message:"تم استلام طلب جديد رقم "+String(intake.application_number)+" — "+applicantName,type:"new_public_intake"})));
 return json({ok:true,status:"received",request_id:requestId,application_number:intake.application_number,uploaded});
});
