export type ManagerCommandInput = { chatId: string | number; chatType?: string; text?: string | null };
export type ManagerRpcResult = { data: any; error: { message?: string } | null };
export type ManagerDeps = {
  managerChatIds: string[];
  rpc: (fn: string, args: Record<string, unknown>) => Promise<ManagerRpcResult>;
  send: (chatId: string | number, text: string) => Promise<unknown>;
  photoUrl?: (storagePath: string) => Promise<string | null>;
  sendPhoto?: (chatId: string | number, url: string, caption?: string, replyMarkup?: Record<string, unknown>) => Promise<unknown>;
  broadcast?: (text: string, testOnly: boolean) => Promise<{sent:number;failed:number;blocked:number;targets:number}>;
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
function helpText(){ return ["🛡️ لوحة مدير RAFIQ — Telegram","","/broadcast نص الإعلان — بث الإعلان للمشتركين مع صورة وزر رابط","/broadcast_test نص — اختبار البث لحساب المدير فقط","/folders — ملخص كل الملفات","/folder nurse accepted — قائمة فئة ومجلد","/folder caregiver review 20 — تحديد العدد","/member 12345 — بطاقة عضو برقم الطلب أو العضوية","/assign 12345 RFQ-CGV-01001 ملاحظة — إسناد مقدم رعاية لحالة","","أوامر المستخدمين: /start /services /request /help /contact /invite /stop /subscribe","","الأوامر الإدارية لا تعمل إلا من محادثة المدير الخاصة."].join("\n"); }
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
    if(command.name==="manager" || command.name==="help"){ await deps.send(input.chatId,helpText()); return true; }    if(command.name==="broadcast" || command.name==="broadcast_test"){
      if(!deps.broadcast){ await deps.send(input.chatId,"⚠️ نظام البث غير متاح حاليًا."); return true; }
      const custom=command.args.join(" ").trim();
      const body=custom || "🇱🇧 RAFIQ | رفيق\n\nنصل بالحب والأمان لرعاية العائلة.\n\n🌐 https://rafiq-o6qd.onrender.com\n🤖 https://t.me/RAFIQ_Care_Bot\n📢 https://t.me/+a7CDblNyGkw1Yjg8";
      const report=await deps.broadcast(body,command.name==="broadcast_test");
      await deps.send(input.chatId,[
        command.name==="broadcast_test" ? "🧪 نتيجة بث تجريبي للمدير" : "📣 تقرير البث",
        "",
        "🟢 المرسل: "+report.sent,
        "🔴 الفاشل: "+report.failed,
        "⛔ المحظورون: "+report.blocked,
        "📢 القنوات/المجموعات المستهدفة: "+report.targets
      ].join("\n"));
      return true;
    }

    if(command.name==="publish_ads"){
      const target=String(process.env.TELEGRAM_MARKETING_CHAT_ID||"").trim();
      if(!target){await deps.send(input.chatId,"⚠️ TELEGRAM_MARKETING_CHAT_ID غير مضبوط.");return true;}
      const invite="https://t.me/+a7CDblNyGkw1Yjg8";
      const ads=[
        "🌿 RAFIQ | رفيق\\n\\nرعاية كبار السن والمرضى تبدأ بخطوة صحيحة.\\nنقدّم خدمات رعاية كبار السن، رعاية المرضى داخل المنزل، التمريض المنزلي، والعلاج الفيزيائي المنزلي.\\n\\n💚 انضموا إلى مجتمع رفيق وتابعوا خدماتنا ومستجداتنا.\\n👉 "+invite,
        "💚 عندما تحتاج عائلتك إلى رعاية منزلية، رفيق معكم بخطوات واضحة وآمنة.\\n\\n👴 كبار السن\\n🏠 المرضى\\n👩‍⚕️ التمريض المنزلي\\n🦿 العلاج الفيزيائي المنزلي\\n\\nانضموا إلى مجموعة RAFIQ: "+invite,
        "🌱 رعاية أفضل تبدأ بمعلومة صحيحة واختيار مقدم الخدمة المناسب.\\n\\nRAFIQ | رفيق يعمل على تنظيم طلبات الرعاية المنزلية وربطها بالمسار المناسب.\\n\\n📲 انضموا إلينا: "+invite,
        "🤝 رفيق معكم خطوة بخطوة: من السؤال، إلى تحديد الخدمة المطلوبة، إلى متابعة الطلب وفق إجراءات المنصة.\\n\\nللانضمام إلى مجتمع RAFIQ: "+invite,
        "📢 مجتمع RAFIQ يكبر بكم.\\n\\nتابعوا الإعلانات والتحديثات المتعلقة بالرعاية المنزلية، وشاركونا مع من يحتاج إلى رعاية موثوقة ومنظمة.\\n\\n👉 "+invite,
        "📌 ماذا يقدم رفيق؟\\n\\n👴 رعاية كبار السن\\n🏠 رعاية المرضى داخل المنزل\\n👩‍⚕️ التمريض المنزلي\\n🦿 العلاج الفيزيائي المنزلي\\n\\nللمتابعة والانضمام: "+invite,
        "👩‍⚕️ لمقدمي الخدمات الصحية والرعاية المنزلية: رفيق يتيح استقبال طلبات الانتساب ومراجعة الملفات ضمن مسار منظم.\\n\\nممرض/ة، مقدم/ة رعاية، أو معالج/ة فيزيائي/ة؟ تابعوا RAFIQ: "+invite,
        "🏠 للعائلات: لا تبقوا وحدكم أمام احتياجات الرعاية المنزلية.\\n\\nاكتبوا طلبكم بوضوح، وسيتم التعامل معه وفق الخدمة المطلوبة ومسار المراجعة المناسب.\\n\\n💚 انضموا إلى RAFIQ: "+invite,
        "🩺 للممرضين ومقدمي الرعاية والمعالجين الفيزيائيين: إذا كنت تبحث عن الانضمام إلى شبكة رفيق، ابدأ من مجتمعنا وتابع خطوات الانتساب.\\n\\n👉 "+invite,
        "🌟 RAFIQ منصة تجمع العائلات وطلبات الرعاية المنزلية ومقدمي الخدمات ضمن مسار منظم.\\n\\nتابعوا المجتمع لتصلكم الإعلانات والتحديثات الجديدة.\\n\\n📲 "+invite,
        "🚀 هل تريد الانضمام كمقدم رعاية؟\\n\\nابدأ بالتعرّف إلى رفيق وخدماته، ثم تابع إجراءات الانتساب الرسمية عبر المنصة.\\n\\n👉 انضم إلى المجموعة: "+invite,
        "👩‍⚕️ ممرض/ة؟ 🦿 معالج/ة فيزيائي/ة؟ 🤝 مقدم/ة رعاية؟\\n\\nرفيق يرحب بطلبات الانتساب ويعمل على مراجعة الملفات وفق الإجراءات المعتمدة.\\n\\nابدأ من هنا: "+invite,
        "💚 تحتاج عائلتكم إلى رعاية منزلية؟\\n\\nتعرّفوا إلى خدمات رفيق وابدؤوا طلبكم بالمعلومات الأساسية، ليتم توجيهكم إلى المسار المناسب.\\n\\n📲 انضموا: "+invite,
        "🔔 خطوة واحدة قد تكون بداية الطريق المناسب للرعاية.\\n\\nتابعوا RAFIQ | رفيق لمعرفة الخدمات، تقديم الطلبات، ومتابعة الإعلانات الجديدة.\\n\\n👉 "+invite,
        "🇱🇧 دعوة لكل من يهتم بالرعاية المنزلية في لبنان: عائلات، ممرضون، مقدمو رعاية، ومعالجون فيزيائيون.\\n\\nكونوا جزءًا من مجتمع RAFIQ وشاركونا في بناء خدمة رعاية منزلية أكثر تنظيمًا.\\n\\n💚 "+invite
      ];
      let sent=0;
      for(const ad of ads){
        try{await deps.send(target,ad);sent++;}catch(error){console.error(JSON.stringify({event:"rafig_telegram_marketing_send_failed",index:sent+1,error:safeError(error)}));break;}
        await new Promise(resolve=>setTimeout(resolve,3200));
      }
      await deps.send(input.chatId,"📣 تم تنفيذ نشر "+sent+" من أصل "+ads.length+" إعلانات في مجموعة RAFIQ.");
      return true;
    }
    if(command.name==="publish_specialty_ads"){
      const target=String(process.env.TELEGRAM_MARKETING_CHAT_ID||"").trim();
      if(!target){await deps.send(input.chatId,"⚠️ TELEGRAM_MARKETING_CHAT_ID غير مضبوط.");return true;}
      const site="https://rafiq-o6qd.onrender.com/";
      const bot="https://t.me/RAFIQ_Care_Bot";
      const group="https://t.me/+a7CDblNyGkw1Yjg8";
      const wa="https://whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K";
      const footer="\\n\\n🌐 المنصة: "+site+"\\n🤖 بوت Telegram: "+bot+"\\n📢 مجموعة Telegram: "+group+"\\n📱 قناة WhatsApp: "+wa;
      const ads=[
        "👩‍⚕️ RAFIQ | رفيق — للممرضين والممرضات\\n\\nإذا كنت ممرضًا أو ممرضة وتعمل في مجال الرعاية المنزلية، ندعوك للانضمام إلى RAFIQ وتقديم طلب الانتساب. نعمل على تنظيم الطلبات ومراجعة الملفات ضمن إجراءات المنصة.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer,
        "🤝 RAFIQ | رفيق — لمقدمي الرعاية\\n\\nإذا كنت مقدم رعاية وتملك خبرة في رعاية كبار السن أو المرضى، ندعوك للتسجيل وتقديم طلب الانضمام إلى RAFIQ. اجعل خبرتك جزءًا من شبكة الرعاية المنزلية التي نبنيها.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer,
        "🧑‍🦽 RAFIQ | رفيق — للمعالجين الفيزيائيين\\n\\nإذا كنت معالجًا أو معالجة فيزيائية وتقدم خدمات العلاج الفيزيائي المنزلي، ندعوك إلى تقديم طلب الانضمام إلى RAFIQ والتعرّف إلى إجراءات الانتساب.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer,
        "🧪 RAFIQ | رفيق — للمختبرات الطبية\\n\\nإلى أصحاب ومديري المختبرات الطبية: نرحب بانضمام مؤسستكم إلى شبكة RAFIQ. تواصلوا معنا للتعرّف إلى آلية التعاون واستكمال إجراءات العقد الخاصة بالمختبر، لتكون خدماتكم أقرب إلى العائلات التي تحتاج إليها.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer,
        "🩻 RAFIQ | رفيق — لمراكز التصوير الطبي\\n\\nإلى أصحاب ومديري مراكز التصوير الطبي: ندعوكم للانضمام إلى شبكة RAFIQ والتعاون معنا في تقديم خدمات التصوير الطبي للعائلات. تواصلوا معنا للتعرّف إلى شروط التعاون واستكمال إجراءات العقد الخاصة بالمركز.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer,
        "🩺 RAFIQ | رفيق — لمراكز بيع وتجهيز المعدات الطبية\\n\\nإلى شركات ومراكز بيع وتجهيز المعدات الطبية: ندعوكم للانضمام إلى شبكة RAFIQ والتعاون معنا لتسهيل الوصول إلى المعدات الطبية التي تحتاجها العائلات. تواصلوا معنا للتعرّف إلى آلية التعاون واستكمال إجراءات العقد الخاصة بجهتكم.\\n\\n🤍 RAFIQ — نصل بالحب والأمان لرعاية العائلة"+footer
      ];
      let sent=0;
      for(const ad of ads){
        try{await deps.send(target,ad);sent++;}catch(error){console.error(JSON.stringify({event:"rafig_telegram_specialty_marketing_send_failed",index:sent+1,error:safeError(error)}));break;}
        await new Promise(resolve=>setTimeout(resolve,3200));
      }
      await deps.send(input.chatId,"📣 تم تنفيذ نشر "+sent+" من أصل "+ads.length+" إعلانات تخصصية في مجموعة RAFIQ.");
      return true;
    }
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