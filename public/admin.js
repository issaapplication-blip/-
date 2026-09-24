const SUPABASE_URL='https://qmuxaehrahfsnabyjens.supabase.co';
const SUPABASE_KEY='sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD';
const ADMIN_EMAIL='issaapplication@gmail.com';
if(!window.supabase){
  const box=document.getElementById('loginError');
  if(box){box.className='error';box.textContent='تعذر تحميل نظام الدخول الآمن. أعد تحميل الصفحة مرة واحدة.';box.classList.remove('hidden');}
  throw new Error('Supabase client library unavailable');
}
const {createClient}=window.supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let state={apps:[],docs:[],care:[],profiles:[],approvals:[],providers:{caregiver:[],nurse:[],physiotherapist:[]},tab:'applications'};
const $=id=>document.getElementById(id);
document.body.classList.remove('rafig-admin-authorized');
const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status=s=>`<span class="status ${esc(s)}">${esc(s||'—')}</span>`;
function setMsg(text,error=false){$('message').innerHTML=text?`<div class="${error?'error':'notice'}">${esc(text)}</div>`:'';}
async function ensureAdmin(){
 const {data:{session}}=await sb.auth.getSession(); if(!session)return false;
 const email=(session.user.email||'').trim().toLowerCase();
 let p=null;
 const profileResult=await sb.from('profiles').select('id,email,role,status').eq('id',session.user.id).maybeSingle();
 if(profileResult.data)p=profileResult.data;
 const ownerByEmail=email==='issaapplication@gmail.com';
 let dbAdmin=false;
 try{
   const r=await sb.rpc('is_admin');
   dbAdmin=r.data===true;
 }catch(_){}
 const isAdmin=ownerByEmail||dbAdmin||p?.role==='admin';
 if(!isAdmin){
   await sb.auth.signOut();
   $('loginError').textContent='تم تسجيل الدخول، لكن هذا الحساب غير مفعّل كحساب إدارة.';
   $('loginError').classList.remove('hidden');
   return false;
 }
 $('adminEmail').textContent=session.user.email||p?.email||'issaapplication@gmail.com';document.body.classList.add('rafig-admin-authorized');
 $('login').classList.add('hidden');$('dashboard').classList.remove('hidden');$('adminActions').classList.remove('hidden');window.dispatchEvent(new CustomEvent('rafig-admin-ready'));return true;
}
async function load(){
 setMsg('جاري تحميل البيانات…');
 const optional=async(q,label)=>{const r=await q;if(r.error)return {data:[],error:{message:r.error.message,label}};return r};
 const [a,p,d,c,ap,cg,nr,ph]=await Promise.all([
  sb.from('applications').select('*').order('created_at',{ascending:false}),
  sb.from('profiles').select('id,first_name,last_name,phone,email,address,role,status,created_at').order('created_at',{ascending:false}),
  optional(sb.from('documents').select('*').order('created_at',{ascending:false),'documents'),
  sb.from('care_requests').select('*').order('created_at',{ascending:false}),
  optional(sb.from('application_approvals').select('*'),'application_approvals'),
  optional(sb.from('caregivers').select('*'),'caregivers'),
  optional(sb.from('nurses').select('*'),'nurses'),
  optional(sb.from('physiotherapists').select('*'),'physiotherapists')
 ]);
 const essential=[a,p,c].find(x=>x.error);
 if(essential){setMsg(essential.error.message,true);return}
 state.apps=a.data||[];state.profiles=p.data||[];state.docs=d.data||[];state.care=c.data||[];state.approvals=ap.data||[];
 state.providers={caregiver:cg.data||[],nurse:nr.data||[],physiotherapist:ph.data||[]};
 render();
 const warnings=[d,ap,cg,nr,ph].filter(x=>x.error).map(x=>x.error.label+': '+x.error.message);
 setMsg(warnings.length?'تم تحميل الطلبات الأساسية. توجد مكونات اختيارية تحتاج مزامنة قاعدة البيانات: '+warnings.join(' | '):'تم تحميل الطلبات. لطلبات الانتساب المرسلة من نماذج المنصة افتح تبويب «طلبات الانتساب الجديدة».');
}
function profile(uid){return state.profiles.find(x=>x.id===uid)||{}};
function provider(uid,type){return (state.providers[type]||[]).find(x=>x.user_id===uid)||{};}
function approvalFor(appId){return state.approvals.find(x=>x.application_id===appId)||null;}
function appType(a){return a.application_type||'—'}
function render(){
 const counts={pending:0,review:0,approved:0,rejected:0};state.apps.forEach(a=>{if(counts[a.status]!=null)counts[a.status]++});$('sPending').textContent=counts.pending;$('sReview').textContent=counts.review;$('sApproved').textContent=counts.approved;$('sRejected').textContent=counts.rejected;$('sDocs').textContent=state.docs.length;
 renderApps();renderCare();renderDocs();
}
function renderApps(){
 const q=($('appSearch').value||'').toLowerCase(),st=$('appStatus').value,tp=$('appType').value;
 const rows=state.apps.filter(a=>{const p=profile(a.user_id);const text=`${p.first_name||''} ${p.last_name||''} ${p.email||''} ${p.phone||''}`.toLowerCase();return(!q||text.includes(q))&&(!st||a.status===st)&&(!tp||a.application_type===tp)});
 $('appRows').innerHTML=rows.length?rows.map(a=>{const p=profile(a.user_id);const docs=state.docs.filter(d=>d.user_id===a.user_id);return `<tr><td><b>${esc((p.first_name||'')+' '+(p.last_name||''))||'—'}</b><br><small>${esc(p.email||p.phone||'')}</small></td><td>${esc(appType(a))}</td><td>${status(a.status)}</td><td>${docs.length} <button class="btn ghost" onclick="openDetails('${a.id}')">عرض/تصحيح</button></td><td>${new Date(a.created_at).toLocaleString('ar-LB')}</td><td><div class="actions"><button class="btn ghost" onclick="editApplication('${a.id}')">تصحيح</button><button class="btn gold" onclick="setApp('${a.id}','review')">مراجعة</button><button class="btn primary" onclick="setApp('${a.id}','approved')">قبول</button><button class="btn danger" onclick="setApp('${a.id}','rejected')">رفض</button></div></td></tr>`}).join(''):`<tr><td colspan="6" class="loading">لا توجد طلبات.</td></tr>`;
}
function renderCare(){
 const q=($('careSearch').value||'').toLowerCase(),st=$('careStatus').value;const rows=state.care.filter(c=>(!q||`${c.request_number||''} ${c.service_type||''} ${c.required_services||''}`.toLowerCase().includes(q))&&(!st||c.status===st));
 $('careRows').innerHTML=rows.length?rows.map(c=>`<tr><td>${esc(c.request_number||c.id)}</td><td>${esc(c.service_type||'')}<br><small>${esc(c.required_services||'')}</small></td><td>${esc(c.schedule||'')}${c.live_in?' · إقامة':''}</td><td>${status(c.status)}</td><td>${esc(c.notes||'')}</td><td><div class="actions"><button class="btn ghost" onclick="openCare('${c.id}')">تفاصيل</button><select onchange="setCare('${c.id}',this.value)"><option value="">تغيير الحالة</option><option>review</option><option>matching</option><option>matched</option><option>contracted</option><option>active</option><option>completed</option><option>cancelled</option></select></div></td></tr>`).join(''):`<tr><td colspan="6" class="loading">لا توجد طلبات رعاية.</td></tr>`;
}
function renderDocs(){
 const q=($('docSearch').value||'').toLowerCase(),st=$('docStatus').value;const rows=state.docs.filter(d=>{const p=profile(d.user_id);return(!q||`${d.file_name||''} ${d.document_type||''} ${p.first_name||''} ${p.last_name||''}`.toLowerCase().includes(q))&&(!st||d.verification_status===st)});
 $('docRows').innerHTML=rows.length?rows.map(d=>{const p=profile(d.user_id);return `<tr><td>${esc((p.first_name||'')+' '+(p.last_name||''))}<br><small>${esc(p.email||p.phone||'')}</small></td><td>${esc(d.document_type||'')}</td><td><b>${esc(d.file_name||'file')}</b><br><small>${esc(d.mime_type||'')} · ${d.file_size?Math.round(d.file_size/1024):0} KB</small></td><td>${status(d.verification_status)}</td><td>${new Date(d.created_at).toLocaleString('ar-LB')}</td><td><div class="actions"><button class="btn ghost" onclick="openDoc('${d.id}')">فتح</button><button class="btn ghost" onclick="replaceDocument('${d.id}')">رفع نسخة</button><button class="btn primary" onclick="setDoc('${d.id}','approved')">قبول</button><button class="btn danger" onclick="setDoc('${d.id}','rejected')">رفض</button></div></td></tr>`}).join(''):`<tr><td colspan="6" class="loading">لا توجد مستندات.</td></tr>`;
}
async function setApp(id,statusValue){const a=state.apps.find(x=>x.id===id);if(!a)return;const current=a.notes||'';const promptLabel=statusValue==='rejected'?'سبب الرفض (اختياري):':'ملاحظات المدير (اختياري):';const notes=prompt(promptLabel,current)||null;const {error}=await sb.rpc('admin_set_application_status',{p_application_id:id,p_status:statusValue,p_notes:notes});if(error){setMsg(error.message,true);return}a.status=statusValue;a.notes=notes;if(a.user_id)await sb.from('notifications').insert({user_id:a.user_id,title:'تحديث طلب RAFIQ',message:'تم تحديث حالة طلبك إلى: '+statusValue,type:'application'});render();setMsg('تم تحديث حالة الطلب وحفظ ملاحظات المدير.');}
async function editApplication(id){const a=state.apps.find(x=>x.id===id);if(!a)return;const notes=prompt('تصحيح/ملاحظة إدارية للطلب:',a.notes||'');if(notes===null)return;const {error}=await sb.rpc('admin_set_application_status',{p_application_id:id,p_status:a.status||'pending',p_notes:notes});if(error){setMsg(error.message,true);return}a.notes=notes;render();setMsg('تم تصحيح ملاحظات الطلب وحفظها.');}
async function replaceDocument(id){const d=state.docs.find(x=>x.id===id);if(!d)return;const input=document.createElement('input');input.type='file';input.accept='.pdf,.doc,.docx,.jpg,.jpeg,.png';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>10485760){setMsg('الملف أكبر من 10MB.',true);return}const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'];if(!allowed.includes(file.type)){setMsg('نوع الملف غير مدعوم.',true);return}try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=d.user_id+'/'+Date.now()+'-admin-'+safe;const up=await sb.storage.from('private_documents').upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;const upd=await sb.from('documents').update({storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:'pending'}).eq('id',id);if(upd.error)throw upd.error;await sb.from('audit_logs').insert({action:'admin_replace_document',table_name:'documents',record_id:id,user_id:(await sb.auth.getUser()).data.user.id});await load();setMsg('تم رفع النسخة الجديدة وإعادتها إلى حالة المراجعة.');}catch(e){setMsg(e.message||'تعذر رفع الوثيقة.',true)}};input.click();}
async function setProvider(uid,type,statusValue){const {error}=await sb.rpc('admin_set_provider_status',{p_user_id:uid,p_provider_type:type,p_status:statusValue,p_notes:null});if(error){setMsg(error.message,true);return}await sb.from('notifications').insert({user_id:uid,title:'تحديث ملف RAFIQ',message:`تم تحديث حالة ملفك إلى: ${statusValue}`,type:'provider_review'});await load();}
async function setDoc(id,v){const {error}=await sb.rpc('admin_review_document',{p_document_id:id,p_status:v});if(error){setMsg(error.message,true);return}const d=state.docs.find(x=>x.id===id);if(d)d.verification_status=v;render();setMsg('تم تحديث المستند.');}
async function setCare(id,v){if(!v)return;const {error}=await sb.from('care_requests').update({status:v,updated_at:new Date().toISOString()}).eq('id',id);if(error){setMsg(error.message,true);return}await sb.from('audit_logs').insert({action:'care_request_status_'+v,table_name:'care_requests',record_id:id,user_id:(await sb.auth.getUser()).data.user.id});await load();setMsg('تم تحديث حالة طلب الرعاية.');}
async function signed(path){const {data,error}=await sb.storage.from('private_documents').createSignedUrl(path,600);if(error)throw error;return data.signedUrl}
window.openDetails=async id=>{const a=state.apps.find(x=>x.id===id);if(!a)return;const p=profile(a.user_id),docs=state.docs.filter(d=>d.user_id===a.user_id),approval=approvalFor(a.id);let extra={};const type=a.application_type;if(type==='caregiver')extra=provider(a.user_id,'caregiver');if(type==='nurse')extra=provider(a.user_id,'nurse');if(type==='physiotherapist')extra=provider(a.user_id,'physiotherapist');$('modalTitle').textContent='تفاصيل الطلب';$('modalBody').innerHTML=`<div class="grid2"><div class="detail"><b>المتقدم</b>${esc((p.first_name||'')+' '+(p.last_name||''))}</div><div class="detail"><b>الحالة</b>${status(a.status)}</div><div class="detail"><b>البريد</b>${esc(p.email||'')}</div><div class="detail"><b>الهاتف</b>${esc(p.phone||'')}</div><div class="detail"><b>النوع</b>${esc(type)}</div><div class="detail"><b>العنوان</b>${esc(p.address||'')}</div></div><h3>بيانات المهنة</h3><div class="detail">${Object.entries(extra).filter(([k])=>!['id','user_id','created_at','updated_at'].includes(k)).map(([k,v])=>`<div><b>${esc(k)}</b>${esc(v)}</div>`).join('')||'لا توجد بيانات إضافية.'}</div><h3>المستندات</h3><div class="docs">${docs.map(d=>`<div class="doc"><b>${esc(d.file_name||d.document_type)}</b> — ${status(d.verification_status)} <button class="btn ghost" onclick="openDoc('${d.id}')">فتح المستند</button></div>`).join('')||'لا توجد مستندات.'}</div>`;
if(approval){$('modalBody').innerHTML += '<h3>اعتماد المتقدم والباركود</h3><div class="detail"><b>رمز الاعتماد</b>'+esc(approval.approval_code)+'<div id="approvalQr" style="display:flex;justify-content:center;margin:14px 0"></div><button class="btn primary" onclick="downloadApprovalQr(\''+esc(approval.approval_code)+'\')">حفظ الباركود</button></div>';if(window.QRCode)new QRCode($('approvalQr'),{text:approval.qr_payload,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});}
$('modal').classList.remove('hidden')}
window.downloadApprovalQr=code=>{const canvas=$('approvalQr')?.querySelector('canvas');if(!canvas)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=code+'.png';a.click()};
window.openDoc=async id=>{const d=state.docs.find(x=>x.id===id);if(!d)return;try{const url=await signed(d.storage_path);window.open(url,'_blank','noopener');}catch(e){setMsg(e.message,true)}};
window.openCare=id=>{const c=state.care.find(x=>x.id===id);if(!c)return;$('modalTitle').textContent='تفاصيل طلب الرعاية';$('modalBody').innerHTML=`<div class="grid2">${Object.entries(c).filter(([k])=>!['id','family_id','patient_id'].includes(k)).map(([k,v])=>`<div class="detail"><b>${esc(k)}</b>${esc(v)}</div>`).join('')}</div>`;$('modal').classList.remove('hidden')};
window.closeModal=()=> $('modal').classList.add('hidden');
$('loginBtn').onclick=async()=>{
 const email=$('email').value.trim().toLowerCase()||ADMIN_EMAIL,password=$('password').value;
 $('loginError').classList.add('hidden');
 if(!email||!password){$('loginError').textContent='أدخل البريد الإلكتروني وكلمة المرور.';$('loginError').classList.remove('hidden');return}
 const {error}=await sb.auth.signInWithPassword({email,password});
 if(error){
   const msg=error.message?.toLowerCase().includes('invalid login credentials')
     ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
     : error.message;
   $('loginError').textContent=msg;$('loginError').classList.remove('hidden');return
 }
 if(await ensureAdmin())load()
};
$('magicBtn').onclick=async()=>{
 const email=$('email').value.trim().toLowerCase()||ADMIN_EMAIL;
 $('loginError').className='error hidden';
 if(!email){$('loginError').textContent='اكتب بريد المدير أولًا.';$('loginError').className='error';$('loginError').classList.remove('hidden');return}
 const redirectTo='https://rafiq-o6qd.onrender.com/admin.html';
 const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:false}});
 if(error){$('loginError').textContent='تعذر إرسال رابط الدخول: '+error.message;$('loginError').className='error';$('loginError').classList.remove('hidden');return}
 $('loginError').className='notice';$('loginError').textContent='تم إرسال رابط دخول آمن إلى البريد. افتحه من نفس الجهاز للعودة مباشرة إلى لوحة الإدارة.';$('loginError').classList.remove('hidden');
};
$('resetBtn').onclick=async()=>{
 const email=$('email').value.trim().toLowerCase()||ADMIN_EMAIL;
 $('loginError').classList.add('hidden');
 if(!email){$('loginError').textContent='اكتب بريدك الإلكتروني أولًا.';$('loginError').classList.remove('hidden');return}
 const redirectTo='https://rafiq-o6qd.onrender.com/admin.html';
 const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
 if(error){$('loginError').textContent='تعذر إرسال رابط إعادة التعيين: '+error.message;$('loginError').classList.remove('hidden');return}
 $('loginError').className='notice';$('loginError').textContent='تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد إذا كان الحساب مسجلًا.';$('loginError').classList.remove('hidden');
};
function showRecoveryForm(){
 const login=$('login');
 if(!login||document.getElementById('recoveryBox'))return;
 const box=document.createElement('div');box.id='recoveryBox';box.className='notice';box.innerHTML='<b>تعيين كلمة مرور المدير الجديدة</b><div class="field" style="margin-top:10px"><label>كلمة المرور الجديدة</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="8 أحرف على الأقل"></div><div class="field"><label>تأكيد كلمة المرور</label><input id="newPassword2" type="password" minlength="8" autocomplete="new-password"></div><button id="saveNewPassword" class="btn primary" style="width:100%">حفظ كلمة المرور الجديدة</button><div id="recoveryMsg"></div>';
 login.appendChild(box);
 $('saveNewPassword').onclick=async()=>{const p=$('newPassword').value,p2=$('newPassword2').value;const m=$('recoveryMsg');if(p.length<8){m.textContent='كلمة المرور يجب أن تكون 8 أحرف على الأقل.';return}if(p!==p2){m.textContent='كلمتا المرور غير متطابقتين.';return}const {error}=await sb.auth.updateUser({password:p});if(error){m.textContent='تعذر حفظ كلمة المرور: '+error.message;return}m.innerHTML='<span class="notice">تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بها.</span>';setTimeout(()=>location.reload(),1200)};
}
async function checkRecovery(){
 const {data:{session}}=await sb.auth.getSession();
 const url=new URL(location.href);
 if(session&&(url.hash.includes('type=recovery')||url.searchParams.get('type')==='recovery'))showRecoveryForm();
}

sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')showRecoveryForm();else if(event==='SIGNED_OUT'){document.body.classList.remove('rafig-admin-authorized');$('dashboard').classList.add('hidden');$('login').classList.remove('hidden');}});
$('logout').onclick=async()=>{document.body.classList.remove('rafig-admin-authorized');document.getElementById('adminRafiqCounters')?.remove();await sb.auth.signOut();location.reload()};
$('refresh').onclick=()=>load();
if(!window.supabase){$('loginError').textContent='تعذر تحميل مكوّن الدخول الآمن. أعد تحميل الصفحة مرة واحدة.';$('loginError').classList.remove('hidden');}
checkRecovery();
(async()=>{try{const ok=await ensureAdmin();if(ok)await load();}catch(e){$('loginError').textContent='تعذر تهيئة جلسة الإدارة: '+(e?.message||'خطأ غير معروف');$('loginError').classList.remove('hidden');}})();
['appSearch','appStatus','appType','careSearch','careStatus','docSearch','docStatus'].forEach(id=>$(id).addEventListener('input',()=>{if(id.startsWith('app'))renderApps();else if(id.startsWith('care'))renderCare();else renderDocs()}));
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('hidden',x.id!==state.tab))});
ensureAdmin().then(ok=>{if(ok)load()}).catch(err=>{const box=$('loginError');box.textContent='تعذر تهيئة جلسة الإدارة: '+(err?.message||'خطأ غير معروف');box.className='error';box.classList.remove('hidden');});