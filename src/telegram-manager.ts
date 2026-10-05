import type { } from "./telegram";

export type ManagerCommandInput = { chatId: string | number; chatType?: string; text?: string | null };
export type ManagerRpcResult = { data: any; error: { message?: string } | null };
export type ManagerDeps = {
  managerChatIds: string[];
  rpc: (fn: string, args: Record<string, unknown>) => Promise<ManagerRpcResult>;
  send: (chatId: string | number, text: string) => Promise<unknown>;
  photoUrl?: (storagePath: string) => Promise<string | null>;
  sendPhoto?: (chatId: string | number, url: string, caption?: string) => Promise<unknown>;
};

const categoryAliases: Record<string,string> = {
  nurse:"nurse", nurses:"nurse", "ممرض":"nurse", "ممرضة":"nurse", "ممرض/ة":"nurse", "تمريض":"nurse",
  physiotherapist:"physiotherapist", physio:"physiotherapist", "معالج":"physiotherapist", "معالج فيزيائي":"physiotherapist", "علاج فيزيائي":"physiotherapist",
  caregiver:"caregiver", "مقدم":"caregiver", "مقدم رعاية":"caregiver", "مقدمة رعاية":"caregiver",
  family:"family_request", family_request:"family_request", "عائلة":"family_request", "طلب رعاية":"family_request", "طلب رعاية عائلية":"family_request",
  cv:"cv", "السيرة":"cv", "cv + cover letter":"cv"
};
const folderAliases: Record<string,string> = {
  new:"new", "جديد":"new", "الجديد":"new", review:"review", "مراجعة":"review", "قيد المراجعة":"review",
  accepted:"accepted", approved:"accepted", "مقبول":"accepted", "مقبولة":"accepted", rejected:"rejected", "مرفوض":"rejected", "مرفوضة":"rejected"
};
const categoryLabels: Record<string,string> = {nurse:"الممرضون",physiotherapist:"المعالجون الفيزيائيون",caregiver:"مقدمو الرعاية",family_request:"طلبات الرعاية العائلية",cv:"طلبات CV",general:"عام"};
const folderLabels: Record<string,string> = {new:"جديد",review:"قيد المراجعة",accepted:"مقبول",rejected:"مرفوض"};

export function parseManagerChatIds(value?: string | null): string[] {
  return Array.from(new Set((value || "").split(",").map(function(v){return v.trim();}).filter(function(v){return /^\d+$/.test(v);})));
}
function commandOf(text:string): {name:string,args:string[]} | null {
  const m=text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  if(!m) return null;
  return {name:m[1].split("@")[0].toLowerCase(),args:m[2]?m[2].trim().split(/\s+/):[]};
}
function category(v?:string){ return v ? categoryAliases[v.trim().toLowerCase()] || null : null; }
function folder(v?:string){ return v ? folderAliases[v.trim().toLowerCase()] || null : null; }
function safeError(e:unknown){ return (e instanceof Error ? e.message : String(e || "")).slice(0,180); }
function helpText(){ return ["🛡️ لوحة مدير RAFIQ — Telegram","","/folders — ملخص كل الملفات","/folder nurse accepted — قائمة فئة ومجلد","/folder caregiver review 20 — تحديد العدد","/member 12345 — بطاقة عضو برقم الطلب أو العضوية","/assign 12345 RFQ-CGV-01001 ملاحظة — إسناد مقدم رعاية لحالة","","الأوامر الإدارية لا تعمل إلا من محادثة المدير الخاصة."].join("\n"); }
export function formatCard(card:any):string {
  if(!card) return "❌ لم أجد هذا الطلب أو العضوية.";
  const social=Object.entries(card.social || {}).filter(function(x){return x[1];}).map(function(x){return String(x[0])+": "+String(x[1]);}).join(" | ");
  return [
    "🪪 بطاقة عضو RAFIQ","",
    "الاسم: "+(card.full_name || "—"),
    "الصفة: "+(card.member_type || "—"),
    "الحالة: "+(card.status || "—"),
    "الملف: "+(card.folder || "—"),
    "رقم الطلب: "+(card.application_number == null ? "—" : card.application_number),
    "رقم العضوية: "+(card.membership_number || "—"),
    "حالة الباركود: "+(card.barcode_status || "—"),
    "اسم الوالدة: "+(card.mother_name || "—"),
    "تاريخ الميلاد: "+(card.date_of_birth || "—"),
    "العنوان: "+(card.address || "—"),
    "الهاتف: "+(card.phone || "—"),
    "Telegram: "+(card.telegram || "—"),
    social ? "التواصل الاجتماعي: "+social : "",
    card.decided_at ? "تاريخ القرار: "+card.decided_at : "",
    card.admin_notes ? "ملاحظات المدير: "+card.admin_notes : ""
  ].filter(Boolean).join("\n");
}
async function fail(send:any,chatId:any,command:string,error:unknown){ console.error(JSON.stringify({event:"rafig_telegram_manager_command_failed",command:command,error:safeError(error)})); await send(chatId,"⚠️ حدث خطأ أثناء تنفيذ الأمر. لم يتم عرض تفاصيل النظام هنا."); }

export async function handleManagerCommand(input:ManagerCommandInput,deps:ManagerDeps):Promise<boolean>{
  const chatId=String(input.chatId);
  if(input.chatType !== "private" || !deps.managerChatIds.includes(chatId) || !input.text) return false;
  const command=commandOf(input.text); if(!command) return false;
  try {
    if(command.name==="manager" || command.name==="help"){ await deps.send(input.chatId,helpText()); return true; }
    if(command.name==="folders"){
      const r=await deps.rpc("manager_folder_counts",{}); if(r.error) throw new Error(safeError(r.error.message));
      const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){await deps.send(input.chatId,"📁 لا توجد ملفات مسجلة حاليًا.");return true;}
      const grouped=new Map<string,string[]>();
      for(const row of rows){const c=String(row.category||"general"),f=String(row.folder||"new");const a=grouped.get(c)||[];a.push((folderLabels[f]||f)+": "+Number(row.total||0));grouped.set(c,a);}
      const body=["📁 ملفات RAFIQ",""]; for(const entry of grouped) body.push("• "+(categoryLabels[entry[0]]||entry[0])+"\n  "+entry[1].join(" | "));
      await deps.send(input.chatId,body.join("\n").slice(0,3900)); return true;
    }
    if(command.name==="folder"){
      if(command.args.length<2 || command.args.length>3){await deps.send(input.chatId,"الصيغة: /folder <الفئة> <المجلد> [العدد 1-50]");return true;}
      const c=category(command.args[0]),f=folder(command.args[1]),limit=command.args[2]?Number(command.args[2]):20;
      if(!c || !f || !Number.isInteger(limit) || limit<1 || limit>50){await deps.send(input.chatId,"⚠️ الفئة أو المجلد أو العدد غير صحيح. مثال: /folder nurse accepted 20");return true;}
      const r=await deps.rpc("manager_list_applications",{p_category:c,p_folder:f,p_limit:limit}); if(r.error) throw new Error(safeError(r.error.message));
      const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){await deps.send(input.chatId,"📂 "+(categoryLabels[c]||c)+" — "+(folderLabels[f]||f)+"\nلا توجد ملفات.");return true;}
      const lines=["📂 "+(categoryLabels[c]||c)+" — "+(folderLabels[f]||f),""];
      for(const row of rows) lines.push("• #"+(row.application_number==null?"—":row.application_number)+" | "+(row.membership_number||"—")+"\n  "+(row.full_name||"—")+" | "+(row.area||"—")+(row.specialty?" | "+row.specialty:""));
      await deps.send(input.chatId,lines.join("\n").slice(0,3900)); return true;
    }
    if(command.name==="member"){
      if(command.args.length!==1){await deps.send(input.chatId,"الصيغة: /member <رقم الطلب أو رقم العضوية>");return true;}
      const r=await deps.rpc("manager_get_application",{p_ref:command.args[0]}); if(r.error) throw new Error(safeError(r.error.message));
      if(!r.data){await deps.send(input.chatId,"❌ لم أجد هذا الطلب أو العضوية.");return true;}
      await deps.send(input.chatId,formatCard(r.data));
      if(r.data.photo_path && deps.photoUrl && deps.sendPhoto){try{const url=await deps.photoUrl(String(r.data.photo_path));if(url)await deps.sendPhoto(input.chatId,url,"📷 صورة "+(r.data.full_name||"العضو"));}catch(e){console.error(JSON.stringify({event:"rafig_telegram_manager_photo_failed",error:safeError(e)}));}}
      return true;
    }
    if(command.name==="assign"){
      if(command.args.length<2){await deps.send(input.chatId,"الصيغة: /assign <رقم الحالة> <رقم العضوية> [ملاحظة]");return true;}
      const r=await deps.rpc("manager_assign_case",{p_case_ref:command.args[0],p_member_ref:command.args[1],p_assigned_by:chatId,p_note:command.args.slice(2).join(" ")||null});
      if(r.error){const m=safeError(r.error.message);const friendly=m.includes("case_already_assigned")?"هذه الحالة مسندة مسبقًا.":m.includes("member_not_approved")?"العضو غير مقبول أو لا يملك عضوية فعالة.":m.includes("member_not_found")?"لم أجد العضو.":m.includes("case_not_found")?"لم أجد طلب الرعاية العائلية.":"تعذر إسناد الحالة.";await deps.send(input.chatId,"⚠️ "+friendly);return true;}
      await deps.send(input.chatId,["✅ تم إسناد الحالة.","رقم الحالة: "+(r.data&&r.data.case_number||"—"),"رقم العضوية: "+(r.data&&r.data.membership_number||"—"),"مقدم الرعاية: "+(r.data&&r.data.member_name||"—"),"لم يتم إرسال أي رسالة للعضو تلقائيًا."].join("\n"));return true;
    }
    return false;
  } catch(error){ await fail(deps.send,input.chatId,command.name,error); return true; }
}