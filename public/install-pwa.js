(() => {
  if (window.__RAFIQ_UI_GUARD_V9__) return;
  window.__RAFIQ_UI_GUARD_V9__ = true;

  const INTAKE_URL = 'https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/public-application-intake';
  const UPLOAD_URL = 'https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/public-application-upload';
  const MAX_FILES = 8;
  const MAX_SIZE = 10 * 1024 * 1024;

  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(reg => reg.unregister()))).catch(() => {});
    if ('caches' in window) caches.keys().then(keys => Promise.all(keys.filter(k => /^rafig-v/i.test(k)).map(k => caches.delete(k)))).catch(() => {});
  } catch (_) {}

  const fixedIds = ['joinBtn', 'careBtn', 'status-button', 'language', 'rafig-install-app'];
  const uniqueLabels = new Set(['الانتساب إلى المنصة','طلب رعاية منزلية','WhatsApp — 81','تقديم طلب رعاية','الانتساب كمقدم رعاية','الانتساب كممرض/ة','الانتساب كمعالج فيزيائي','بدء الطلب','تثبيت تطبيق رفيق']);

  function cleanDuplicates() {
    for (const id of fixedIds) { const nodes = document.querySelectorAll('#' + id.replace(/([:.])/g, '\\$1')); for (let i=1;i<nodes.length;i++) nodes[i].remove(); }
    document.querySelectorAll('.status').forEach(el => el.remove());
    const seen=new Set(); document.querySelectorAll('button,a.btn').forEach(el=>{if(!el.isConnected)return;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!uniqueLabels.has(text))return;const key=el.tagName+'|'+text;if(seen.has(key))el.remove();else seen.add(key)});
  }

  function ensureInstallButton(){
    if(!window.__RAFIQ_DEFERRED_INSTALL_PROMPT__||document.getElementById('rafig-install-app'))return;const cta=document.querySelector('.cta');if(!cta)return;
    const slot=document.createElement('div');slot.className='rafig-install-slot';slot.style.cssText='display:flex;justify-content:center;margin:12px 0 2px;width:100%';
    const button=document.createElement('button');button.id='rafig-install-app';button.type='button';button.className='btn outline rafig-install-app';button.textContent='تثبيت تطبيق رفيق';
    button.addEventListener('click',async()=>{const prompt=window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;if(!prompt)return;try{await prompt.prompt();await prompt.userChoice}catch(_){}window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;slot.remove()});slot.appendChild(button);cta.insertAdjacentElement('afterend',slot);
  }

  function ensureDocumentInputs(form){
    if(form.querySelector('.rafig-doc-upload'))return;
    const wrap=document.createElement('div');wrap.className='field full rafig-doc-upload';
    wrap.innerHTML=`<label>المستندات الرسمية المطلوبة لجميع الطلبات</label>
      <div style="display:grid;gap:9px">
        <label style="font-weight:700">🪪 الهوية الشخصية — الوجه والخلفية <input name="identity_files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf"></label>
        <label style="font-weight:700">📷 صورة شخصية واضحة لمقدم الطلب <input name="personal_photo" type="file" accept=".jpg,.jpeg,.png"></label>
        <label style="font-weight:700">🚗 دفتر السوق / رخصة القيادة — الوجه والخلفية (إن وجد) <input name="driver_license_files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf"></label>
        <label style="font-weight:700">🛂 جواز السفر — صورة واضحة (إن وجد) <input name="passport_file" type="file" accept=".jpg,.jpeg,.png,.pdf"></label>
        <label style="font-weight:700">📄 السيرة الذاتية CV (إن وجدت) <input name="cv_file" type="file" accept=".pdf,.doc,.docx"></label>
        <label style="font-weight:700">🎓 إفادات وشهادات أخرى / شهادات الخبرة / الترخيص المهني <input name="certificates_files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"></label>
      </div>
      <small style="color:#64756e">يمكن اختيار أكثر من ملف للهوية ودفتر السوق والشهادات. الحد الأقصى الإجمالي 8 ملفات، و10MB لكل ملف. تُحفظ الملفات في مساحة Supabase الخاصة وتبقى قيد مراجعة الإدارة.</small>`;
    const grid=form.querySelector('.form-grid');if(grid)grid.appendChild(wrap);else form.insertBefore(wrap,form.firstChild);
  }

  function showIntakeResult(form,ok,application,message){
    let box=form.parentElement?.querySelector('.success');if(!box){box=document.createElement('div');box.className='success';form.insertAdjacentElement('afterend',box)}box.classList.add('show');
    if(ok){box.innerHTML=`<strong>تم استلام طلبك بنجاح.</strong><br>رقم طلبك: <strong>${application.application_number}</strong><br>الحالة: قيد المراجعة.<br><small>${message||'تم حفظ معلوماتك بأمان. احتفظ برقم الطلب.'}</small>`;form.reset()}
    else box.innerHTML='<strong>تعذر حفظ الطلب حالياً.</strong><br>'+String(message||'يرجى المحاولة مرة أخرى بعد لحظات.');
  }

  function installApplicationPersistence(){
    document.querySelectorAll('.app-form').forEach(form=>{
      ensureDocumentInputs(form);
      if(form.dataset.rafigIntakeBound==='1')return;
      const cleanForm=form.cloneNode(true);form.replaceWith(cleanForm);cleanForm.dataset.rafigIntakeBound='1';ensureDocumentInputs(cleanForm);
      cleanForm.addEventListener('submit',async event=>{
        event.preventDefault();
        const submit=cleanForm.querySelector('button[type="submit"]');
        if(submit){submit.disabled=true;submit.textContent='جارٍ حفظ الطلب والمستندات…'}
        const fd=new FormData(cleanForm),payload={};const files=[];
        for(const [key,value] of fd.entries()){
          if(value instanceof File){if(value.size)files.push({file:value,category:key});}
          else if(typeof value==='string'&&value.trim())payload[key]=value.trim();
        }
        try{
          if(files.length>MAX_FILES)throw new Error('too_many_files');
          for(const item of files)if(item.file.size>MAX_SIZE)throw new Error('file_too_large');
          const response=await fetch(INTAKE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({application_type:cleanForm.dataset.type,payload,website:''})});
          const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'intake_failed');
          let uploadNote='';
          if(files.length){
            const uploadFd=new FormData();uploadFd.append('intake_id',result.application.id);
            files.forEach(item=>{uploadFd.append('files',item.file,item.file.name);uploadFd.append('document_category',item.category)});
            const ur=await fetch(UPLOAD_URL,{method:'POST',body:uploadFd});const uj=await ur.json();
            if(!ur.ok||!uj.ok)throw new Error(uj.error||'upload_failed');
            uploadNote=`تم حفظ ${uj.files.length} مستنداً بأمان.`;
          }
          showIntakeResult(cleanForm,true,result.application,uploadNote+' سيقوم فريق رفيق بمراجعة الطلب والتواصل عند الحاجة.');
        }catch(err){
          const msg=err?.message==='too_many_files'?'الحد الأقصى هو 8 ملفات إجمالاً.':err?.message==='file_too_large'?'يوجد ملف أكبر من 10MB.':err?.message==='unsupported_file_type'?'نوع ملف غير مدعوم.':'حدث خطأ أثناء الحفظ، ولم نعتبر الطلب مسجلاً بعد.';
          showIntakeResult(cleanForm,false,{},msg);
        }finally{if(submit){submit.disabled=false;submit.textContent='إرسال الطلب إلى RAFIQ'}}
      });
    });
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=e;ensureInstallButton()},{once:true});
  window.addEventListener('appinstalled',()=>{window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;document.querySelectorAll('#rafig-install-app,.rafig-install-slot').forEach(el=>el.remove())});
  const start=()=>{cleanDuplicates();installApplicationPersistence();ensureInstallButton();let runs=0;const timer=setInterval(()=>{cleanDuplicates();installApplicationPersistence();ensureInstallButton();runs++;if(runs>=20)clearInterval(timer)},250)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();