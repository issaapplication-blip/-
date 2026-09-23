(() => {
  if (window.__RAFIQ_UI_GUARD_V15__) return;
  window.__RAFIQ_UI_GUARD_V14__ = true;

  const INTAKE_URL = 'https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/public-application-intake';
  const UPLOAD_URL = 'https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/public-application-upload';
  const MAX_FILES = 8;
  const MAX_SIZE = 10 * 1024 * 1024;

  const fixedIds = ['joinBtn', 'careBtn', 'status-button', 'language', 'rafig-install-app'];
  const uniqueLabels = new Set(['الانتساب إلى المنصة','طلب رعاية منزلية','WhatsApp — 81','تقديم طلب رعاية','الانتساب كمقدم رعاية','الانتساب كممرض/ة','الانتساب كمعالج فيزيائي','بدء الطلب','تثبيت تطبيق رفيق']);

  function cleanDuplicates() {
    for (const id of fixedIds) { const nodes = document.querySelectorAll('#' + id.replace(/([:.])/g, '\\$1')); for (let i=1;i<nodes.length;i++) nodes[i].remove(); }
    document.querySelectorAll('.status').forEach(el => el.remove());
    const seen=new Set(); document.querySelectorAll('button,a.btn').forEach(el=>{if(!el.isConnected)return;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!uniqueLabels.has(text))return;const key=el.tagName+'|'+text;if(seen.has(key))el.remove();else seen.add(key)});
  }

  function ensureInstallButton(){
    let button=document.getElementById('rafig-install-app');
    if(!button){
      const cta=document.querySelector('.cta');if(!cta)return;
      const slot=document.createElement('div');slot.className='rafig-install-slot';
      button=document.createElement('button');button.id='rafig-install-app';button.type='button';button.className='btn outline rafig-install-app';button.textContent='تثبيت تطبيق رفيق';
      slot.appendChild(button);cta.insertAdjacentElement('afterend',slot);
    }
    if(button.dataset.rafigInstallBound==='1')return;
    button.dataset.rafigInstallBound='1';
    button.addEventListener('click',async()=>{
      const prompt=window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;
      if(prompt){
        try{
          await prompt.prompt();
          const choice=await prompt.userChoice;
          if(choice?.outcome==='accepted'){
            window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;
            button.remove();
            document.querySelectorAll('.rafig-install-slot').forEach(el=>el.remove());
          }
        }catch(_){}
        return;
      }
      let msg=document.getElementById('rafig-install-status');
      if(!msg){
        msg=document.createElement('div');msg.id='rafig-install-status';msg.className='notice';
        msg.style.cssText='margin:10px auto 0;max-width:720px;line-height:1.9;text-align:right';
        button.insertAdjacentElement('afterend',msg);
      }
      const standalone=isStandalone();
      const swReady=!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
      const isAndroid=/Android/i.test(navigator.userAgent);
      const isChrome=/Chrome\\//i.test(navigator.userAgent)&&!/Edg\\//i.test(navigator.userAgent);
      msg.innerHTML='<strong>تثبيت RAFIQ</strong><br>'+
        (standalone?'التطبيق مثبت بالفعل على هذا الجهاز.':(isAndroid&&isChrome?
          (swReady?'RAFIQ جاهز للتثبيت. إذا لم يظهر طلب التثبيت داخل الزر بعد، افتح قائمة ⋮ في Chrome ثم اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.':
           'يجري تجهيز خدمة التثبيت الآن. بعد اكتمالها أعد تحميل الصفحة مرة واحدة ثم استخدم زر <b>تثبيت تطبيق رفيق</b>.'):
          'للتثبيت استخدم Google Chrome على Android.'))+
        '<br><small style="opacity:.82">سيظهر زر التثبيت المباشر داخل RAFIQ عندما يرسل Chrome حدث التثبيت. هذا الحدث يعتمد على شروط Chrome، ومنها تفاعل المستخدم مع الصفحة.</small>';
      msg.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  }

  function ensurePublicMembershipUi(){
    if(document.getElementById('rafig-public-membership'))return;
    const join=document.getElementById('join'); if(!join)return;
    const wrap=document.createElement('section'); wrap.id='rafig-public-membership'; wrap.style.cssText='margin:18px 0;padding:20px;border:2px solid #087f58;border-radius:20px;background:#effaf5;position:relative';
    wrap.innerHTML=`<div style="text-align:center"><div style="font-size:34px">👨‍👩‍👧‍👦</div><h3 style="margin:6px 0;color:#087f58">الانتساب العام إلى منصة رفيق</h3><p style="margin:0 auto 10px;max-width:720px;line-height:1.8">الانتساب العام مجاني للجميع. انضم إلى رفيق للاستفادة من الخدمات والعروض والمفاجآت التي ستعلن عبر قناة رفيق، والمشاركة في شبكة الخدمات التي تتوسع من الضنية إلى جميع المناطق اللبنانية.</p><div id="rafig-public-count" style="font-weight:900;color:#17372d;margin:8px 0">عدد المنتسبين المقبولين حاليًا: —</div><button type="button" class="btn primary" id="rafig-public-join-btn">طلب الانتساب العام مجانًا</button></div><div id="rafig-public-membership-panel" style="display:none;margin-top:15px"></div>`;
    join.insertAdjacentElement('afterend',wrap);
    loadPublicMemberCount();
    document.getElementById('rafig-public-join-btn').addEventListener('click',()=>openPublicMembershipForm());
  }

  async function loadPublicMemberCount(){
    try{
      const r=await fetch('https://qmuxaehrahfsnabyjens.supabase.co/rest/v1/rpc/public_member_count',{method:'POST',headers:{apikey:'sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD','Content-Type':'application/json'},body:'{}'});
      if(r.ok){const n=await r.json();const el=document.getElementById('rafig-public-count');if(el)el.textContent='عدد المنتسبين المقبولين حاليًا: '+Number(n||0);}
    }catch(_){}
  }

  function openPublicMembershipForm(){
    const panel=document.getElementById('rafig-public-membership-panel'); if(!panel)return;
    panel.style.display='block'; panel.innerHTML=`<form id="rafig-public-membership-form" class="app-form" data-type="انتساب عام"><div class="notice">بيانات الأسرة والمستندات تستخدم فقط لمراجعة طلب العضوية والتحقق من عدد أفراد المنزل والاستفادة من خدمات رفيق. لا يتم عرض هذه البيانات في بطاقة الباركود العامة.</div><div class="form-grid">
      <div class="field"><label>الاسم الأول</label><input name="first_name" required></div>
      <div class="field"><label>اسم العائلة</label><input name="family_name" required></div>
      <div class="field"><label>العمر</label><input name="age" type="number" min="0" max="120" required></div>
      <div class="field"><label>رقم الهاتف</label><input name="phone" inputmode="tel" required></div>
      <div class="field"><label>المنطقة</label><input name="area" required></div>
      <div class="field"><label>عدد الأشخاص الموجودين في المنزل</label><input name="household_size" type="number" min="1" max="50" required></div>
      <div class="field full"><label>أعمار أفراد المنزل</label><textarea name="household_members" placeholder="مثال: 45، 18، 12، 7"></textarea></div>
      <div class="field"><label>نوع إثبات عدد أفراد الأسرة</label><select name="proof_type" required><option value="identity">هوية/هويات</option><option value="family_extract">إخراج قيد عائلي</option><option value="family_registry">سجل/وثيقة عائلية</option><option value="other">وثيقة أخرى تثبت عدد الأفراد</option></select></div>
      <div class="field"><label>البريد الإلكتروني (اختياري)</label><input name="email" type="email"></div>
      <div class="field full"><label>إثبات الأسرة / المستندات</label><input name="family_proof_files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"><small style="color:#64756e">يمكن رفع المستندات التي تثبت أفراد المنزل. الحد الأقصى الإجمالي 8 ملفات، و10MB لكل ملف.</small></div>
      <div class="field full"><label><input name="channel_consent" type="checkbox" value="yes" required> أوافق على الانضمام إلى منصة رفيق ومتابعة الإعلانات والخدمات عبر قناة رفيق على واتساب.</label></div>
    </div><button class="btn primary" type="submit">إرسال طلب الانتساب العام</button></form><div class="success" id="rafig-public-result"></div>`;
    const form=document.getElementById('rafig-public-membership-form');
    form.addEventListener('submit',submitPublicMembership);
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function submitPublicMembership(e){
    e.preventDefault(); const form=e.currentTarget, submit=form.querySelector('button[type=submit]'); if(submit){submit.disabled=true;submit.textContent='جارٍ حفظ طلب الانتساب…'}
    const fd=new FormData(form),payload={},files=[];
    for(const [key,value] of fd.entries()){if(value instanceof File){if(value.size)files.push({file:value,category:key});}else if(typeof value==='string'&&value.trim()&&key!=='channel_consent')payload[key]=value.trim();}
    payload.household_members=payload.household_members?payload.household_members.split(',').map(v=>v.trim()).filter(Boolean):[];
    try{
      if(payload.channel_consent!=='yes' && !form.querySelector('[name=channel_consent]').checked)throw new Error('channel_consent_required');
      if(files.length>MAX_FILES)throw new Error('too_many_files'); for(const item of files)if(item.file.size>MAX_SIZE)throw new Error('file_too_large');
      payload.name=[payload.first_name,payload.family_name].filter(Boolean).join(' '); payload.service_interest='public_membership'; payload.channel='whatsapp';
      const response=await fetch(INTAKE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({application_type:'انتساب عام',payload,website:''})});
      const result=await response.json(); if(!response.ok||!result.ok)throw new Error(result.error||'intake_failed');
      if(files.length){const uploadFd=new FormData();uploadFd.append('intake_id',result.application.id);files.forEach(item=>{uploadFd.append('files',item.file,item.file.name);uploadFd.append('document_category',item.category)});const ur=await fetch(UPLOAD_URL,{method:'POST',body:uploadFd});const uj=await ur.json();if(!ur.ok||!uj.ok)throw new Error(uj.error||'upload_failed');}
      const box=document.getElementById('rafig-public-result');box.classList.add('show');box.innerHTML=`<strong>تم استلام طلب الانتساب العام بنجاح 🎉</strong><br>رقم الطلب: <strong>${result.application.application_number}</strong><br>الحالة: قيد مراجعة الإدارة.<br><small>بعد الموافقة يتم إنشاء عضوية رفيق وتجهيز بطاقة/باركود العضوية. القرار النهائي للإدارة.</small>`;form.reset();
    }catch(err){const box=document.getElementById('rafig-public-result');box.classList.add('show');box.innerHTML='<strong>تعذر إرسال الطلب.</strong><br>'+({channel_consent_required:'يجب الموافقة على الانضمام ومتابعة قناة رفيق.',too_many_files:'الحد الأقصى هو 8 ملفات.',file_too_large:'يوجد ملف أكبر من 10MB.'}[err.message]||'يرجى المحاولة مرة أخرى بعد لحظات.');}
    finally{if(submit){submit.disabled=false;submit.textContent='إرسال طلب الانتساب العام'}}
  }

  function ensureDocumentInputs(form){
    if(form.querySelector('.rafig-doc-upload'))return;
    const wrap=document.createElement('div');wrap.className='field full rafig-doc-upload';
    wrap.innerHTML=`<label>المستندات الرسمية المطلوبة لجميع الطلبات</label><div style="display:grid;gap:9px"><label style="font-weight:700">🪪 الهوية الشخصية — الوجه والخلفية <input name="identity_files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf"></label><label style="font-weight:700">📷 صورة شخصية واضحة لمقدم الطلب <input name="personal_photo" type="file" accept=".jpg,.jpeg,.png"></label><label style="font-weight:700">🚗 دفتر السوق / رخصة القيادة — الوجه والخلفية (إن وجد) <input name="driver_license_files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf"></label><label style="font-weight:700">🛂 جواز السفر — صورة واضحة (إن وجد) <input name="passport_file" type="file" accept=".jpg,.jpeg,.png,.pdf"></label><label style="font-weight:700">📄 السيرة الذاتية CV (إن وجدت) <input name="cv_file" type="file" accept=".pdf,.doc,.docx"></label><label style="font-weight:700">🎓 إفادات وشهادات أخرى / شهادات الخبرة / الترخيص المهني <input name="certificates_files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"></label></div><small style="color:#64756e">يمكن اختيار أكثر من ملف. الحد الأقصى الإجمالي 8 ملفات، و10MB لكل ملف. تُحفظ الملفات في مساحة Supabase الخاصة وتبقى قيد مراجعة الإدارة.</small>`;
    const grid=form.querySelector('.form-grid');if(grid)grid.appendChild(wrap);else form.insertBefore(wrap,form.firstChild);
  }

  function ensureCvPayment(form){
    if(form.dataset.type!=='طلب CV وCover Letter'||form.querySelector('.rafig-cv-payment'))return;
    const wrap=document.createElement('div');wrap.className='field full rafig-cv-payment';
    wrap.innerHTML=`<div style="padding:14px;border:1px solid #ead7a8;background:#fffaf0;border-radius:14px;display:grid;gap:8px"><strong>💳 تأكيد طلب الدفع — Whish Money</strong><span>رسوم خدمة CV + Cover Letter: <b>35 USD</b> للباقة الأساسية، وتشمل العربية والإنكليزية وPDF + Word. كل لغة إضافية: <b>+30 USD</b> مع CV وCover Letter باللغة الإضافية.</span><div>رقم Whish Money المالي: <b dir="ltr">+961 70 600 157</b></div><label style="font-weight:700">رقم هاتف المُرسل <input name="whish_sender_phone" inputmode="tel"></label><label style="font-weight:700">مرجع/رقم عملية Whish <input name="whish_reference"></label><label style="font-weight:700"><input name="whish_payment_confirmation" type="checkbox" value="yes"> أؤكد أنني أرسلت/سأرسل الدفع عبر Whish Money وأطلب مراجعة الدفع من الإدارة.</label><small style="color:#64756e">لا يعتبر الدفع مؤكداً نهائياً إلا بعد مراجعة الإدارة.</small></div>`;
    const grid=form.querySelector('.form-grid');if(grid)grid.appendChild(wrap);else form.appendChild(wrap);
  }

  function showIntakeResult(form,ok,application,message){let box=form.parentElement?.querySelector('.success');if(!box){box=document.createElement('div');box.className='success';form.insertAdjacentElement('afterend',box)}box.classList.add('show');if(ok){const agent=application.agent_reply?`<hr style="border:0;border-top:1px solid #b9e4d1;margin:10px 0"><strong>رد رفيق:</strong><br>${String(application.agent_reply).replace(/\n/g,'<br>')}`:'';box.innerHTML=`<strong>تم استلام طلبك بنجاح.</strong><br>رقم طلبك: <strong>${application.application_number}</strong><br>الحالة: قيد المراجعة.<br><small>${message||'تم حفظ معلوماتك بأمان. احتفظ برقم الطلب.'}</small>${agent}`;form.reset()}else box.innerHTML='<strong>تعذر حفظ الطلب حالياً.</strong><br>'+String(message||'يرجى المحاولة مرة أخرى بعد لحظات.')}

  function installApplicationPersistence(){
    document.querySelectorAll('.app-form').forEach(form=>{ensureDocumentInputs(form);ensureCvPayment(form);if(form.dataset.rafigIntakeBound==='1')return;const cleanForm=form.cloneNode(true);form.replaceWith(cleanForm);cleanForm.dataset.rafigIntakeBound='1';ensureDocumentInputs(cleanForm);ensureCvPayment(cleanForm);cleanForm.addEventListener('submit',async event=>{event.preventDefault();const submit=cleanForm.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.textContent='جارٍ حفظ الطلب والمستندات…'}const fd=new FormData(cleanForm),payload={},files=[];for(const [key,value] of fd.entries()){if(value instanceof File){if(value.size)files.push({file:value,category:key})}else if(typeof value==='string'&&value.trim())payload[key]=value.trim()}try{if(cleanForm.dataset.type==='طلب CV وCover Letter'){if(payload.whish_payment_confirmation!=='yes'||!payload.whish_reference)throw new Error('payment_confirmation_required');payload.payment_method='Whish Money';payload.payment_status='submitted_for_admin_confirmation';payload.service_fee_usd='35'}if(files.length>MAX_FILES)throw new Error('too_many_files');for(const item of files)if(item.file.size>MAX_SIZE)throw new Error('file_too_large');const response=await fetch(INTAKE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({application_type:cleanForm.dataset.type,payload,website:''})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'intake_failed');let uploadNote='';if(files.length){const uploadFd=new FormData();uploadFd.append('intake_id',result.application.id);files.forEach(item=>{uploadFd.append('files',item.file,item.file.name);uploadFd.append('document_category',item.category)});const ur=await fetch(UPLOAD_URL,{method:'POST',body:uploadFd});const uj=await ur.json();if(!ur.ok||!uj.ok)throw new Error(uj.error||'upload_failed');uploadNote=`تم حفظ ${uj.files.length} مستنداً بأمان.`}showIntakeResult(cleanForm,true,result.application,uploadNote+' سيقوم فريق رفيق بمراجعة الطلب والتواصل عند الحاجة.')}catch(err){const msg=err?.message==='too_many_files'?'الحد الأقصى هو 8 ملفات إجمالاً.':err?.message==='file_too_large'?'يوجد ملف أكبر من 10MB.':err?.message==='payment_confirmation_required'?'لإرسال طلب CV، يجب إدخال مرجع عملية Whish وتأكيد إرسال الدفع.':'حدث خطأ أثناء الحفظ، ولم نعتبر الطلب مسجلاً بعد.';showIntakeResult(cleanForm,false,{},msg)}finally{if(submit){submit.disabled=false;submit.textContent='إرسال الطلب إلى RAFIQ'}}})})
  }

  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(isStandalone())document.querySelectorAll('#rafig-install-app,.rafig-install-slot').forEach(el=>el.remove());
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=e;ensureInstallButton();const s=document.getElementById('rafig-install-status');if(s)s.remove()});
  window.addEventListener('appinstalled',()=>{window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;document.querySelectorAll('#rafig-install-app,.rafig-install-slot,#rafig-install-status').forEach(el=>el.remove())});
  const start=()=>{
    cleanDuplicates();ensurePublicMembershipUi();installApplicationPersistence();ensureInstallButton();
    if(navigator.serviceWorker){
      navigator.serviceWorker.register('/sw.js?v=52',{updateViaCache:'none'}).catch(()=>{});navigator.serviceWorker.ready.then(()=>{
        if(!navigator.serviceWorker.controller&&!sessionStorage.getItem('RAFIQ_SW_CONTROL_RELOAD_20260923_V1')){
          sessionStorage.setItem('RAFIQ_SW_CONTROL_RELOAD_20260922_V2','1');
          location.reload();
        }
      }).catch(()=>{});
    }
    let runs=0;const timer=setInterval(()=>{cleanDuplicates();ensurePublicMembershipUi();installApplicationPersistence();ensureInstallButton();runs++;if(runs>=40)clearInterval(timer)},250);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
