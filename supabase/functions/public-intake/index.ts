import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors}})}
function clean(s:any,max:number){return String(s??"").trim().slice(0,max)}
function safeName(s:string){return (s||"file").replace(/[^A-Za-z0-9._-]/g,"_").slice(-120)||"file"}
const url=Deno.env.get("SUPABASE_URL")!;
const secretKeysRaw=Deno.env.get("SUPABASE_SECRET_KEYS")||"";
let secretKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
try{if(!secretKey&&secretKeysRaw){const keys=JSON.parse(secretKeysRaw);secretKey=keys.default||""}}catch{}
const admin=createClient(url,secretKey,{auth:{autoRefreshToken:false,persistSession:false}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(!secretKey)return json({ok:false,error:"server_configuration_incomplete"},500);
  const len=Number(req.headers.get("content-length")||0); if(len>18*1024*1024)return json({ok:false,error:"حجم الطلب يتجاوز الحد المسموح"},413);
  const form=await req.formData().catch(()=>null); if(!form)return json({ok:false,error:"invalid form"},400);
  // The hidden honeypot is never stored or forwarded. Return a bland success to bots.
  if(clean(form.get("website"),160))return json({ok:true,status:"received"});
  const allowedMime=new Set(["application/pdf","image/jpeg","image/png"]);
  const allowedCategories=new Set(["cv","certificate","experience","nursing_license","nursing_certificate","institution_logo","institution_image","other"]);
  const directFiles=form.getAll("files").filter((v):v is File=>v instanceof File&&v.size>0);
  const directCategories=form.getAll("document_category").map(v=>clean(v,80));
  const legacyCv=form.getAll("cv").filter((v):v is File=>v instanceof File&&v.size>0);
  const legacyPhotos=form.getAll("profile_photo").filter((v):v is File=>v instanceof File&&v.size>0);
  const fileEntries=[...directFiles,...legacyCv,...legacyPhotos];
  const fileCategories=[...directCategories,...legacyCv.map(()=>"cv"),...legacyPhotos.map(()=>"portrait")];
  const validateFiles=()=>{
    if(fileEntries.length>8)return "يمكن إرفاق 8 ملفات كحد أقصى";
    if(fileEntries.some(file=>!allowedMime.has(file.type)))return "نوع ملف غير مسموح. استخدم PDF أو JPG أو PNG فقط.";
    if(fileEntries.some(file=>file.size>8*1024*1024))return "الحد الأقصى لحجم الملف الواحد 8MB.";
    if(fileEntries.some((_file,index)=>!allowedCategories.has(fileCategories[index]||"")))return "تصنيف ملف غير صالح.";
    return null;
  };
  const institutionType=clean(form.get("institution_type"),80);
  const isInstitution=["laboratory","radiology_center","medical_equipment_center"].includes(institutionType);
  const files=form.getAll("files").filter((v):v is File=>v instanceof File&&v.size>0); const payload:any={};
  if(isInstitution){
    if(files.length>10)return json({ok:false,error:"يمكن إرفاق 10 ملفات كحد أقصى"},400);
    if(files.some(f=>f.size>8*1024*1024))return json({ok:false,error:"الحد الأقصى لحجم الملف الواحد 8MB"},413);
    const institutionName=clean(form.get("institution_name"),250),contactName=clean(form.get("contact_name"),200),phone=clean(form.get("phone"),40);
    if(!institutionName||!contactName||!phone)return json({ok:false,error:"اسم الجهة واسم المسؤول ورقم الهاتف مطلوبة"},400);
    for(const [key,value] of form.entries()){if(value instanceof File||key==="institution_type")continue;payload[key]=clean(value,5000)}
    payload.institution_type=institutionType;payload.submitted_at=new Date().toISOString();
    const {data:intake,error}=await admin.from("institution_intakes").insert({institution_type:institutionType,institution_name:institutionName,contact_name:contactName,phone,email:clean(form.get("email"),250)||null,address:clean(form.get("address"),500)||null,governorate:clean(form.get("governorate"),120)||null,district:clean(form.get("district"),120)||null,locality:clean(form.get("locality"),160)||null,license_number:clean(form.get("license_number"),160)||null,services:clean(form.get("services"),4000)||null,notes:clean(form.get("notes"),4000)||null,payload,status:"pending"}).select("*").single();
    if(error||!intake){console.error(JSON.stringify({event:"public_institution_create_failed",code:error?.code||null,status:error?.status||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502)}
    let uploaded=0; for(let index=0;index<files.length;index++){const file=files[index],category=fileCategories[index],path="institutions/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:file.type,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_institution_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("institution_intake_files").insert({institution_intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:"pending",document_category:category});if(!ins.error)uploaded++}
    const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active"); if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب تسجيل جهة صحية جديد",message:"تم استلام طلب تسجيل "+institutionName+" برقم "+String(intake.request_id),type:"new_institution_intake"})));
    return json({ok:true,status:"received",request_id:intake.request_id,uploaded});
  }
  const role=clean(form.get("role"),50); if(!new Set(["caregiver","nurse","physiotherapist","doctor","family","member"]).has(role))return json({ok:false,error:"نوع الطلب غير معروف"},400);
  const first=clean(form.get("first_name"),80),lastName=clean(form.get("last_name"),80),familyName=clean(form.get("family_name"),160),patientName=clean(form.get("patient_name"),160);
  const applicantName=(role==="family"?familyName:(clean(form.get("name"),200)||(first+" "+lastName).trim()))||patientName,phone=clean(form.get("phone"),40); if(!applicantName||!phone)return json({ok:false,error:"الاسم ورقم الهاتف مطلوبان"},400);
  const fileError=validateFiles(); if(fileError)return json({ok:false,error:fileError},400);
  for(const [key,value] of form.entries()){if(value instanceof File||key==="consent"||key==="role")continue;payload[key]=clean(value,5000)}
  payload.role=role;payload.submitted_without_account=true;payload.submitted_at=new Date().toISOString();
  const applicationType=({family:"طلب رعاية عائلية",caregiver:"انتساب مقدم رعاية",nurse:"انتساب ممرض/ة",physiotherapist:"انتساب معالج فيزيائي",doctor:"انتساب طبيب",member:"انتساب عام"} as Record<string,string>)[role],area=clean(form.get(role==="family"?"care_location":"preferred_location"),250);
  const {data:intake,error}=await admin.from("application_intakes").insert({application_type:applicationType,applicant_name:applicantName,phone,area,status:"review",payload,source:"platform"}).select("*").single();
  if(error||!intake){console.error(JSON.stringify({event:"public_intake_create_failed",code:error?.code||null,status:error?.status||null}));return json({ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."},502)}
  const requestId="RAFIQ-REQ-"+String(intake.application_number).padStart(6,"0"); await admin.from("application_intakes").update({payload:{...(intake.payload||{}),request_id:requestId},updated_at:new Date().toISOString()}).eq("id",intake.id);
  let uploaded=0; for(let index=0;index<fileEntries.length;index++){const file=fileEntries[index],category=fileCategories[index],path="intakes/"+intake.id+"/"+crypto.randomUUID()+"-"+safeName(file.name);const up=await admin.storage.from("private_documents").upload(path,file,{contentType:file.type,upsert:false});if(up.error){console.error(JSON.stringify({event:"public_intake_upload_failed",intakeId:intake.id,status:up.error.statusCode||null}));continue}const ins=await admin.from("application_intake_files").insert({intake_id:intake.id,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:"pending",document_category:category});if(!ins.error)uploaded++}
  const {data:admins}=await admin.from("profiles").select("id").eq("role","admin").eq("status","active"); if(admins?.length)await admin.from("notifications").insert(admins.map(a=>({user_id:a.id,title:"طلب جديد من منصة RAFIQ",message:"تم استلام طلب جديد رقم "+String(intake.application_number)+" — "+applicantName,type:"new_public_intake"})));
  return json({ok:true,status:"received",request_id:requestId,application_number:intake.application_number,uploaded});
});