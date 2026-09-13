const SUPABASE_URL='https://qmuxaehrahfsnabyjens.supabase.co';
const SUPABASE_KEY='sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD';
const {createClient}=window.supabase;
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
let state={apps:[],docs:[],care:[],profiles:[],providers:{caregiver:[],nurse:[],physiotherapist:[]},tab:'applications'};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const status=s=>`<span class="status ${esc(s)}">${esc(s||'—')}</span>`;
function setMsg(text,error=false){$('message').innerHTML=text?`<div class="${error?'error':'notice'}">${esc(text)}</div>`:'';}
async function ensureAdmin(){
 const {data:{session}}=await sb.auth.getSession(); if(!session)return false;
 const {data:p,error}=await sb.from('profiles').select('id,email,role,status').eq('id',session.user.id).single();
 if(error||!p||p.role!=='admin'){await sb.auth.signOut(); $('loginError').textContent='هذا الحساب ليس حساب إدارة.';$('loginError').classList.remove('hidden');return false}
 $('adminEmail').textContent=p.email||session.user.email||'';$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');return true;
}
async function load(){
 setMsg('جاري تحميل البيانات…');
 const [a,p,d,c,cg,nr,ph]=await Promise.all([
  sb.from('applications').select('*').order('created_at',{ascending:false}),
  sb.from('profiles').select('id,first_name,last_name,phone,email,address,role,status,created_at').order('created_at',{ascending:false}),
  sb.from('documents').select('*').order('created_at',{ascending:false}),
  sb.from('care_requests').select('*').order('created_at',{ascending:false}),
  sb.from('caregivers').select('*'),sb.from('nurses').select('*'),sb.from('physiotherapists').select('*')
 ]);
 const err=[a,p,d,c,cg,nr,ph].find(x=>x.error); if(err){setMsg(err.error.message,true);return}
 state.apps=a.data||[];state.profiles=p.data||[];state.docs=d.data||[];state.care=c.data||[];state.providers={caregiver:cg.data||[],nurse:nr.data||[],physiotherapist:ph.data||[]};
 render();setMsg('');
}
function profile(uid){return state.profiles.find(x=>x.id===uid)||{}};
function provider(uid,type){return (state.providers[type]||[]).find(x=>x.user_id===uid)||{};}
function appType(a){return a.application_type||'—'}
function render(){
 const counts={pending:0,review:0,approved:0,rejected:0};state.apps.forEach(a=>{if(counts[a.status]!=null)counts[a.status]++});$('sPending').textContent=counts.pending;$('sReview').textContent=counts.review;$('sApproved').textContent=counts.approved;$('sRejected').textContent=counts.rejected;$('sDocs').textContent=state.docs.length;
 renderApps();renderCare();renderDocs();
}
function renderApps(){
 const q=($('appSearch').value||'').toLowerCase(),st=$('appStatus').value,tp=$('appType').value;
 const rows=state.apps.filter(a=>{const p=profile(a.user_id);const text=`${p.first_name||''} ${p.last_name||''} ${p.email||''} ${p.phone||''}`.toLowerCase();return(!q||text.includes(q))&&(!st||a.status===st)&&(!tp||a.application_type===tp)});
 $('appRows').innerHTML=rows.length?rows.map(a=>{const p=profile(a.user_id);const docs=state.docs.filter(d=>d.user_id===a.user_id);return `<tr><td><b>${esc((p.first_name||'')+' '+(p.last_name||''))||'—'}</b><br><small>${esc(p.email||p.phone||'')}</small></td><td>${esc(appType(a))}</td><td>${status(a.status)}</td><td>${docs.length} <button class="btn ghost" onclick="openDetails('${a.id}')">عرض</button></td><td>${new Date(a.created_at).toLocaleString('ar-LB')}</td><td><div class="actions"><button class="btn gold" onclick="setApp('${a.id}','review')">مراجعة</button><button class="btn primary" onclick="setApp('${a.id}','approved')">قبول</button><button class="btn danger" onclick="setApp('${a.id}','rejected')">رفض</button></div></td></tr>`}).join(''):`<tr><td colspan="6" class="loading">لا توجد طلبات.</td></tr>`;
}
function renderCare(){
 const q=($('careSearch').value||'').toLowerCase(),st=$('careStatus').value;const rows=state.care.filter(c=>(!q||`${c.request_number||''} ${c.service_type||''} ${c.required_services||''}`.toLowerCase().includes(q))&&(!st||c.status===st));
 $('careRows').innerHTML=rows.length?rows.map(c=>`<tr><td>${esc(c.request_number||c.id)}</td><td>${esc(c.service_type||'')}<br><small>${esc(c.required_services||'')}</small></td><td>${esc(c.schedule||'')}${c.live_in?' · إقامة':''}</td><td>${status(c.status)}</td><td>${esc(c.notes||'')}</td><td><div class="actions"><button class="btn ghost" onclick="openCare('${c.id}')">تفاصيل</button><select onchange="setCare('${c.id}',this.value)"><option value="">تغيير الحالة</option><option>review</option><option>matching</option><option>matched</option><option>contracted</option><option>active</option><option>completed</option><option>cancelled</option></select></div></td></tr>`).join(''):`<tr><td colspan="6" class="loading">لا توجد طلبات رعاية.</td></tr>`;
}
function renderDocs(){
 const q=($('docSearch').value||'').toLowerCase(),st=$('docStatus').value;const rows=state.docs.filter(d=>{const p=profile(d.user_id);return(!q||`${d.file_name||''} ${d.document_type||''} ${p.first_name||''} ${p.last_name||''}`.toLowerCase().includes(q))&&(!st||d.verification_status===st)});
 $('docRows').innerHTML=rows.length?rows.map(d=>{const p=profile(d.user_id);return `<tr><td>${esc((p.first_name||'')+' '+(p.last_name||''))}<br><small>${esc(p.email||p.phone||'')}</small></td><td>${esc(d.document_type||'')}</td><td><b>${esc(d.file_name||'file')}</b><br><small>${esc(d.mime_type||'')} · ${d.file_size?Math.round(d.file_size/1024):0} KB</small></td><td>${status(d.verification_status)}</td><td>${new Date(d.created_at).toLocaleString('ar-LB')}</td><td><div class="actions"><button class="btn ghost" onclick="openDoc('${d.id}')">فتح</button><button class="btn primary" onclick="setDoc('${d.id}','approved')">قبول</button><button class="btn danger" onclick="setDoc('${d.id}','rejected')">رفض</button></div></td></tr>`}).join(''):`<tr><td colspan="6" class="loading">لا توجد مستندات.</td></tr>`;
}
async function setApp(id,statusValue){const notes=statusValue==='rejected'?prompt('سبب الرفض (اختياري):')||null:null;const {error}=await sb.rpc('admin_set_application_status',{p_application_id:id,p_status:statusValue,p_notes:notes});if(error){setMsg(error.message,true);return}const a=state.apps.find(x=>x.id===id);if(a)a.status=statusValue;if(a&&a.user_id)await sb.from('notifications').insert({user_id:a.user_id,title:`تحديث طلب RAFIQ`,message:`تم تحديث حالة طلبك إلى: ${statusValue}`,type:'application'});render();setMsg('تم تحديث حالة الطلب.');}
async function setProvider(uid,type,statusValue){const {error}=await sb.rpc('admin_set_provider_status',{p_user_id:uid,p_provider_type:type,p_status:statusValue,p_notes:null});if(error){setMsg(error.message,true);return}await sb.from('notifications').insert({user_id:uid,title:'تحديث ملف RAFIQ',message:`تم تحديث حالة ملفك إلى: ${statusValue}`,type:'provider_review'});await load();}
async function setDoc(id,v){const {error}=await sb.from('documents').update({verification_status:v}).eq('id',id);if(error){setMsg(error.message,true);return}const d=state.docs.find(x=>x.id===id);if(d)d.verification_status=v;await sb.from('audit_logs').insert({action:'document_status_'+v,table_name:'documents',record_id:id,user_id:(await sb.auth.getUser()).data.user.id});render();setMsg('تم تحديث المستند.');}
async function setCare(id,v){if(!v)return;const {error}=await sb.from('care_requests').update({status:v,updated_at:new Date().toISOString()}).eq('id',id);if(error){setMsg(error.message,true);return}await sb.from('audit_logs').insert({action:'care_request_status_'+v,table_name:'care_requests',record_id:id,user_id:(await sb.auth.getUser()).data.user.id});await load();setMsg('تم تحديث حالة طلب الرعاية.');}
async function signed(path){const {data,error}=await sb.storage.from('private_documents').createSignedUrl(path,600);if(error)throw error;return data.signedUrl}
window.openDetails=async id=>{const a=state.apps.find(x=>x.id===id);if(!a)return;const p=profile(a.user_id),docs=state.docs.filter(d=>d.user_id===a.user_id);let extra={};const type=a.application_type;if(type==='caregiver')extra=provider(a.user_id,'caregiver');if(type==='nurse')extra=provider(a.user_id,'nurse');if(type==='physiotherapist')extra=provider(a.user_id,'physiotherapist');$('modalTitle').textContent='تفاصيل الطلب';$('modalBody').innerHTML=`<div class="grid2"><div class="detail"><b>المتقدم</b>${esc((p.first_name||'')+' '+(p.last_name||''))}</div><div class="detail"><b>الحالة</b>${status(a.status)}</div><div class="detail"><b>البريد</b>${esc(p.email||'')}</div><div class="detail"><b>الهاتف</b>${esc(p.phone||'')}</div><div class="detail"><b>النوع</b>${esc(type)}</div><div class="detail"><b>العنوان</b>${esc(p.address||'')}</div></div><h3>بيانات المهنة</h3><div class="detail">${Object.entries(extra).filter(([k])=>!['id','user_id','created_at','updated_at'].includes(k)).map(([k,v])=>`<div><b>${esc(k)}</b>${esc(v)}</div>`).join('')||'لا توجد بيانات إضافية.'}</div><h3>المستندات</h3><div class="docs">${docs.map(d=>`<div class="doc"><b>${esc(d.file_name||d.document_type)}</b> — ${status(d.verification_status)} <button class="btn ghost" onclick="openDoc('${d.id}')">فتح المستند</button></div>`).join('')||'لا توجد مستندات.'}</div>`;$('modal').classList.remove('hidden')}
window.openDoc=async id=>{const d=state.docs.find(x=>x.id===id);if(!d)return;try{const url=await signed(d.storage_path);window.open(url,'_blank','noopener');}catch(e){setMsg(e.message,true)}};
window.openCare=id=>{const c=state.care.find(x=>x.id===id);if(!c)return;$('modalTitle').textContent='تفاصيل طلب الرعاية';$('modalBody').innerHTML=`<div class="grid2">${Object.entries(c).filter(([k])=>!['id','family_id','patient_id'].includes(k)).map(([k,v])=>`<div class="detail"><b>${esc(k)}</b>${esc(v)}</div>`).join('')}</div>`;$('modal').classList.remove('hidden')};
window.closeModal=()=> $('modal').classList.add('hidden');
$('loginBtn').onclick=async()=>{const email=$('email').value.trim(),password=$('password').value; $('loginError').classList.add('hidden');const {error}=await sb.auth.signInWithPassword({email,password});if(error){$('loginError').textContent=error.message;$('loginError').classList.remove('hidden');return}if(await ensureAdmin())load()};
$('logout').onclick=async()=>{await sb.auth.signOut();location.reload()};$('refresh').onclick=()=>load();
['appSearch','appStatus','appType','careSearch','careStatus','docSearch','docStatus'].forEach(id=>$(id).addEventListener('input',()=>{if(id.startsWith('app'))renderApps();else if(id.startsWith('care'))renderCare();else renderDocs()}));
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('hidden',x.id!==state.tab))});
sb.auth.onAuthStateChange(async(_e)=>{if(await ensureAdmin())load()});
ensureAdmin().then(ok=>{if(ok)load()});