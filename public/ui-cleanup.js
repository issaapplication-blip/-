(() => {
  const run = () => {
    try {
      const headerInner = document.querySelector('.header-inner');
      const brand = document.querySelector('.brand');
      const lang = document.querySelector('.lang');
      if (headerInner && brand && lang) {
        headerInner.style.cssText = 'max-width:none;width:100%;padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;direction:rtl';
        brand.style.cssText = 'order:1;display:flex;align-items:center;gap:9px;margin:0';
        lang.style.cssText = 'order:2;display:flex;align-items:center;gap:6px;margin:0';
      }

      const logoUrl = '/rafig-approved-logo.jpg?v=19';
      document.querySelectorAll('.brand img, .hero-logo').forEach(img => {
        img.src = logoUrl;
        img.removeAttribute('srcset');
        img.loading = 'eager';
        img.decoding = 'async';
      });
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
        link.href = '/rafig-approved-logo-512.jpg?v=19';
      });

      const greetings = ['أهلًا بكم في RAFIQ','مرحبًا بكم في RAFIQ','يسعدنا استقبالكم في RAFIQ','أهلًا وسهلًا بكم في RAFIQ','RAFIQ يرحّب بكم اليوم','مع RAFIQ تبدأ الرعاية بثقة وأمان','نرحّب بكم اليوم في RAFIQ'];
      const title = document.querySelector('.hero h1');
      if (title) {
        const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        let index = 0;
        for (let i = 0; i < dayKey.length; i++) index = (index * 31 + dayKey.charCodeAt(i)) % greetings.length;
        title.innerHTML = greetings[index].replace('RAFIQ', '<span>RAFIQ</span>');
      }

      const cvPanel = document.getElementById('panel-cv');
      if (cvPanel) {
        cvPanel.querySelectorAll('.rafig-inline-cv-price').forEach(el => el.remove());
        const box = document.createElement('div');
        box.className = 'notice rafig-inline-cv-price';
        box.innerHTML = '<strong>CV + Cover Letter — عرض الإطلاق الأول لمدة 15 يومًا</strong><br><strong>داخل العرض:</strong> CV احترافي 25$ · Cover Letter 10$ · <strong>CV + Cover Letter 35$</strong> · لغة إضافية +20$.<br><strong>خارج العرض:</strong> CV احترافي 35$ · Cover Letter 16$ · <strong>CV + Cover Letter 51$</strong> · لغة إضافية +28$.<br>الخدمة الأساسية تشمل العربية والإنكليزية مع التسليم بصيغتي <strong>PDF وWord</strong>. كل لغة إضافية تشمل <strong>CV + Cover Letter</strong> باللغة الإضافية مع PDF وWord، حسب الطلب.<br>الصياغة احترافية ومتوافقة مع ATS وقابلة للقراءة الآلية، مع تخصيص المحتوى حسب الوظيفة، ومنع اختلاق أي خبرة أو شهادة أو تاريخ أو مهارة، ومراجعة الترجمة والمعنى قبل اعتماد النسخة النهائية.<br><strong>الدفع عبر Whish Money</strong>، وإثبات الدفع مطلوب قبل اعتماد الطلب.';
        const heading = cvPanel.querySelector('h3');
        if (heading) heading.insertAdjacentElement('afterend', box); else cvPanel.prepend(box);
      }

      const careSection = document.querySelector('#care');
      if (careSection && !careSection.querySelector('.rafig-inline-care-price')) {
        const box = document.createElement('div');
        box.className = 'notice rafig-inline-care-price';
        box.style.cssText = 'grid-column:1/-1;margin-top:4px;text-align:center;border-right-color:var(--g)';
        box.innerHTML = '<strong>الأسعار الأساسية:</strong> رعاية مسن 11 ساعة <strong>30$–35$</strong> يوميًا · رعاية مسن 24 ساعة <strong>50$–55$</strong> يوميًا أو <strong>45$</strong> للترتيب الأسبوعي المستمر · تمريض/رعاية طبية 11 ساعة <strong>40$–50$</strong> حسب الحالة والخدمات.';
        careSection.appendChild(box);
      }

      document.querySelectorAll('a[href*="wa.me/96170600157"],a[href*="wa.me/96170600157?"]').forEach(link => {
        const span = document.createElement('span');
        span.className = link.className || 'phone';
        span.dir = 'ltr';
        span.textContent = '+961 70 600 157';
        link.replaceWith(span);
      });

      const style = document.createElement('style');
      style.id = 'rafig-final-ui-fixes';
      style.textContent = `
        .header-inner{min-height:62px}
        .brand img{width:58px!important;height:58px!important;object-fit:contain!important}
        .hero-logo{width:min(420px,88vw)!important;max-height:none!important}
        .hero .cta{display:flex!important;visibility:visible!important;opacity:1!important}
        .hero .status{display:block!important;visibility:visible!important;opacity:1!important}
        .forms .btn{min-height:48px;width:100%;white-space:normal;line-height:1.3}
        .panel .btn{min-height:48px}
        .rafig-inline-cv-price,.rafig-inline-care-price{line-height:1.85}
        @media(max-width:700px){.header-inner{padding:6px 9px;flex-wrap:wrap}.brand img{width:50px!important;height:50px!important}.brand strong{font-size:18px}.brand small{font-size:10px}.lang select{max-width:120px}.hero-card{padding:20px 14px}.hero-logo{width:min(380px,90vw)}.hero h1{font-size:27px}.hero .cta{flex-direction:column}.hero .cta .btn{width:100%}}
      `;
      document.head.appendChild(style);
    } catch (error) {
      console.warn('RAFIQ UI enhancement skipped:', error);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();

/* RAFIQ secure provider intake: browser-safe publishable key only; RLS remains the security boundary. */
(() => {
  const SUPABASE_URL = 'https://qmuxaehrahfsnabyjens.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD';
  const BUCKET = 'private_documents';
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED = new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']);

  const value = (fd, names) => {
    for (const name of names) {
      const v = fd.get(name);
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const boolValue = (fd, names) => ['true','1','yes','on','نعم','نعم/yes'].includes(value(fd,names).toLowerCase());
  const escapePath = name => String(name).replace(/[^a-zA-Z0-9._-]/g,'_').slice(-140);

  const addField = (form, name, label, type='text', required=false, accept='') => {
    if (form.elements.namedItem(name)) return form.elements.namedItem(name);
    const wrap = document.createElement('div'); wrap.className='field';
    const lab = document.createElement('label'); lab.textContent=label; wrap.appendChild(lab);
    const input = document.createElement('input'); input.name=name; input.type=type; input.required=required;
    if (accept) input.accept=accept;
    if (type==='password') input.minLength=12;
    wrap.appendChild(input); form.querySelector('.form-grid')?.appendChild(wrap);
    return input;
  };

  const prepare = (form, kind) => {
    addField(form,'email','البريد الإلكتروني للحساب','email',true);
    addField(form,'account_password','كلمة مرور الحساب (12 حرفًا على الأقل)','password',true);
    addField(form,'account_password_confirm','تأكيد كلمة المرور','password',true);
    const fileSpecs = kind === 'caregiver'
      ? [['cv','السيرة الذاتية CV','application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['certificates','الشهادات والخبرات','application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['identity','الهوية أو جواز السفر','application/pdf,image/jpeg,image/png'],['driver_license','رخصة القيادة (اختياري)','application/pdf,image/jpeg,image/png'],['portrait','صورة شخصية واضحة (اختياري)','image/jpeg,image/png']]
      : [['cv','السيرة الذاتية CV','application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['nursing_certificate','شهادة التمريض','application/pdf,image/jpeg,image/png'],['professional_license','الترخيص المهني','application/pdf,image/jpeg,image/png'],['identity','الهوية أو جواز السفر','application/pdf,image/jpeg,image/png'],['portrait','صورة شخصية واضحة (اختياري)','image/jpeg,image/png']];
    fileSpecs.forEach(([name,label,accept]) => addField(form,name,label,'file',name !== 'driver_license' && name !== 'portrait',accept));
    const notice = form.querySelector('.rafig-secure-notice') || document.createElement('div');
    notice.className='notice rafig-secure-notice';
    notice.innerHTML='سيتم إنشاء حساب آمن، وحفظ الملف المهني في RAFIQ، ورفع المستندات إلى <strong>Private Storage</strong>. لا تظهر المستندات للعامة، وتبقى المراجعة والقبول بيد الإدارة.';
    if (!notice.parentElement) form.prepend(notice);
  };

  const auth = async (email,password) => {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const data = await response.json().catch(()=>({}));
    if (response.ok && data.access_token) return data;
    if (response.ok && data.user && !data.access_token) throw new Error('تم إنشاء الحساب. يجب تأكيد البريد الإلكتروني قبل إرسال الطلب.');
    if (response.status === 422 || response.status === 400) {
      const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const loginData = await login.json().catch(()=>({}));
      if (login.ok && loginData.access_token) return loginData;
    }
    throw new Error(data.msg || data.message || data.error_description || 'تعذر إنشاء الحساب أو تسجيل الدخول.');
  };

  const rest = async (path, token, options={}) => {
    const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})} });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.message || data.error || data.msg || `Supabase request failed (${response.status})`);
    return data;
  };

  const upload = async (uid, token, file, kind, documentType) => {
    if (!(file instanceof File) || !file.size) throw new Error(`الملف المطلوب غير موجود: ${documentType}`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`حجم ${documentType} يتجاوز 10MB.`);
    if (!ALLOWED.has(file.type)) throw new Error(`نوع ملف غير مسموح: ${documentType}.`);
    const path = `${uid}/${kind}/${crypto.randomUUID()}-${escapePath(file.name)}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${token}`,'Content-Type':file.type,'x-upsert':'false'},body:file});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.message || `فشل رفع ${documentType}.`);
    return {path,file};
  };

  const submitProvider = async (event, form, kind) => {
    event.preventDefault(); event.stopImmediatePropagation();
    const button = form.querySelector('button[type="submit"]');
    const success = form.parentElement?.querySelector('.success');
    if (button) { button.disabled=true; button.textContent='جارٍ حفظ الطلب بأمان…'; }
    try {
      const fd = new FormData(form);
      const email=value(fd,['email']).toLowerCase();
      const password=value(fd,['account_password']);
      const confirm=value(fd,['account_password_confirm']);
      if (!email || !password || password.length < 12 || password !== confirm) throw new Error('تحقق من البريد وكلمة المرور. كلمة المرور يجب أن تكون 12 حرفًا على الأقل ومتطابقة.');
      const session = await auth(email,password);
      const token=session.access_token, uid=session.user?.id;
      if (!uid) throw new Error('لم يتم إنشاء جلسة آمنة للحساب.');

      const first=value(fd,['first','first_name','name']);
      const last=value(fd,['last','last_name','family_name']);
      const phone=value(fd,['phone','mobile','mobile_phone']);
      const father=value(fd,['father','father_name']);
      const birth=value(fd,['birth_date','birthdate','dob']);
      if (!first || !last || !phone || !father || !birth) throw new Error('الاسم، اسم العائلة، الهاتف، اسم الأب وتاريخ الميلاد مطلوبة.');

      await rest('/rest/v1/profiles',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:uid,first_name:first,last_name:last,phone,email,address:value(fd,['address','area']),role:kind,status:'pending'})});

      const common={user_id:uid,father_name:father,birth_date:birth,languages:value(fd,['languages','other_languages']),experience:value(fd,['experience']),services:value(fd,['services']),preferred_location:value(fd,['preferred_location','area','location']),verification_status:'pending'};
      let profile;
      if(kind==='caregiver') profile={...common,has_car:boolValue(fd,['has_car','car']),car_type:value(fd,['car_type']),car_year:Number(value(fd,['car_year']))||null,availability:value(fd,['availability','schedule']),live_in:boolValue(fd,['live_in'])};
      else profile={...common,specialty:value(fd,['specialty']),availability:value(fd,['availability','schedule'])};
      await rest(`/rest/v1/${kind==='caregiver'?'caregivers':'nurses'}`,token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(profile)});
      await rest('/rest/v1/applications',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:uid,application_type:kind,status:'pending',notes:'Provider intake submitted through secure RAFIQ web intake.'})});

      const fileNames = kind==='caregiver' ? [['cv','CV'],['certificates','الشهادات والخبرات'],['identity','الهوية/جواز السفر'],['driver_license','رخصة القيادة'],['portrait','الصورة الشخصية']] : [['cv','CV'],['nursing_certificate','شهادة التمريض'],['professional_license','الترخيص المهني'],['identity','الهوية/جواز السفر'],['portrait','الصورة الشخصية']];
      for (const [field,label] of fileNames) {
        const file=fd.get(field);
        if (!(file instanceof File) || !file.size) { if (!['driver_license','portrait'].includes(field)) throw new Error(`يرجى رفع ${label}.`); continue; }
        const uploaded=await upload(uid,token,file,kind,field);
        await rest('/rest/v1/documents',token,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:uid,document_type:field,storage_path:uploaded.path,file_name:file.name,mime_type:file.type,file_size:file.size,verification_status:'pending'})});
      }
      if(success){success.textContent='تم استلام طلبك بنجاح. تم إنشاء الحساب وحفظ البيانات والمستندات في مساحة خاصة، وحالة الطلب الآن: قيد المراجعة الإدارية.';success.classList.add('show');}
      form.reset();
    } catch(error) {
      if(success){success.textContent=error instanceof Error?error.message:'تعذر إرسال الطلب. حاول مرة أخرى.';success.classList.add('show');success.style.background='#fff4f4';success.style.borderColor='#e7b8b8';}
    } finally {
      if(button){button.disabled=false;button.textContent=kind==='caregiver'?'إرسال طلب الانتساب بأمان':'إرسال طلب الانتساب بأمان';}
    }
  };

  const init = () => {
    const caregiver=document.querySelector('#panel-caregiver form');
    const nurse=document.querySelector('#panel-nurse form');
    if(caregiver){prepare(caregiver,'caregiver');caregiver.addEventListener('submit',e=>submitProvider(e,caregiver,'caregiver'),true);const b=caregiver.querySelector('button[type="submit"]);if(b)b.textContent='إرسال طلب الانتساب بأمان';}
    if(nurse){prepare(nurse,'nurse');nurse.addEventListener('submit',e=>submitProvider(e,nurse,'nurse'),true);const b=nurse.querySelector('button[type="submit"]');if(b)b.textContent='إرسال طلب الانتساب بأمان';}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
