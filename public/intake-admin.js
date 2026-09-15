(() => {
  const URL='https://qmuxaehrahfsnabyjens.supabase.co';
  const KEY='sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD';
  const sb2=window.supabase.createClient(URL,KEY);
  const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function loadIntakes(){
    const {data:{session}}=await sb2.auth.getSession(); if(!session)return;
    let box=document.getElementById('publicIntakes');
    if(!box){box=document.createElement('section');box.id='publicIntakes';box.className='dashboard';box.style.marginTop='15px';document.getElementById('dashboard').after(box)}
    const {data,error}=await sb2.from('application_intakes').select('*').order('created_at',{ascending:false});
    if(error){box.innerHTML='<div class="error">تعذر تحميل طلبات الانتساب الجديدة: '+esc(error.message)+'</div>';return}
    box.innerHTML='<div class="topbar"><div><h2 style="margin:0">طلبات الانتساب الجديدة من المنصة</h2><small style="color:var(--muted)">هذه هي الطلبات التي أصبحت محفوظة فعلياً في Supabase.</small></div><button id="refreshIntakes" class="btn ghost">↻ تحديث</button></div>'+
      (data?.length?'<div class="table-wrap"><table class="table"><thead><tr><th>رقم الطلب</th><th>المتقدم</th><th>النوع</th><th>الهاتف</th><th>المنطقة</th><th>الحالة</th><th>التاريخ</th><th>التفاصيل</th></tr></thead><tbody>'+data.map(x=>`<tr><td><b>${esc(x.application_number)}</b></td><td>${esc(x.applicant_name)}</td><td>${esc(x.application_type)}</td><td dir="ltr">${esc(x.phone)}</td><td>${esc(x.area)}</td><td><span class="status ${esc(x.status)}">${esc(x.status)}</span></td><td>${new Date(x.created_at).toLocaleString('ar-LB')}</td><td><button class="btn gold" data-intake="${esc(x.id)}">عرض</button></td></tr>`).join('')+'</tbody></table></div>':'<div class="loading">لا توجد طلبات جديدة محفوظة حتى الآن.</div>');
    box.querySelector('#refreshIntakes')?.addEventListener('click',loadIntakes);
    box.querySelectorAll('[data-intake]').forEach(btn=>btn.addEventListener('click',()=>{const x=data.find(v=>v.id===btn.dataset.intake);if(!x)return;const payload=Object.entries(x.payload||{}).map(([k,v])=>`<div class="detail"><b>${esc(k)}</b>${esc(v)}</div>`).join('');document.getElementById('modalTitle').textContent='طلب انتساب رقم '+x.application_number;document.getElementById('modalBody').innerHTML=`<div class="grid2"><div class="detail"><b>المتقدم</b>${esc(x.applicant_name)}</div><div class="detail"><b>الهاتف</b>${esc(x.phone)}</div><div class="detail"><b>النوع</b>${esc(x.application_type)}</div><div class="detail"><b>المنطقة</b>${esc(x.area)}</div><div class="detail"><b>الحالة</b>${esc(x.status)}</div><div class="detail"><b>التاريخ</b>${new Date(x.created_at).toLocaleString('ar-LB')}</div></div><h3>بيانات الطلب</h3><div class="grid2">${payload}</div><div class="actions" style="margin-top:15px"><button class="btn gold" data-review="review">قيد المراجعة</button><button class="btn primary" data-review="approved">قبول</button><button class="btn danger" data-review="rejected">رفض</button></div>`;document.getElementById('modal').classList.remove('hidden');document.getElementById('modalBody').querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',async()=>{const {error}=await sb2.from('application_intakes').update({status:b.dataset.review,updated_at:new Date().toISOString()}).eq('id',x.id);if(error){alert(error.message);return}document.getElementById('modal').classList.add('hidden');loadIntakes()}));}));
  }
  const start=()=>{loadIntakes();setInterval(loadIntakes,30000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
