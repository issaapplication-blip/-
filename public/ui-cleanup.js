(() => {
  const run = () => {
    // Final RAFIQ home layout: keep the approved large center logo; remove only duplicate hero controls.
    document.querySelectorAll('.hero .cta, .hero .status').forEach(el => el.remove());
    document.querySelectorAll('.rafig-system-status, #rafig-cv-pricing, #rafig-care-pricing').forEach(el => el.remove());

    // Header: small approved logo at the far right, language selector at the far left.
    // Do not replace logo assets after page load: the approved JPG in index.html is authoritative.
    const headerInner = document.querySelector('.header-inner');
    const brand = document.querySelector('.brand');
    const lang = document.querySelector('.lang');
    if (headerInner && brand && lang) {
      headerInner.style.cssText = 'max-width:none;width:100%;padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;direction:rtl';
      brand.style.cssText = 'order:1;display:flex;align-items:center;gap:9px;margin:0';
      lang.style.cssText = 'order:2;display:flex;align-items:center;gap:6px;margin:0';
    }

    // One greeting per Beirut calendar day (24-hour rotation).
    const greetings = ['أهلًا بكم في RAFIQ','مرحبًا بكم في RAFIQ','يسعدنا استقبالكم في RAFIQ','أهلًا وسهلًا بكم في RAFIQ','RAFIQ يرحّب بكم اليوم','مع RAFIQ تبدأ الرعاية بثقة وأمان','نرحّب بكم اليوم في RAFIQ'];
    const title = document.querySelector('.hero h1');
    if (title) {
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      let index = 0;
      for (let i = 0; i < dayKey.length; i++) index = (index * 31 + dayKey.charCodeAt(i)) % greetings.length;
      title.innerHTML = greetings[index].replace('RAFIQ', '<span>RAFIQ</span>');
    }

    // CV offer remains inside the CV request panel before the form.
    const cvPanel = document.getElementById('panel-cv');
    if (cvPanel) {
      cvPanel.querySelectorAll('.rafig-inline-cv-price').forEach(el => el.remove());
      const box = document.createElement('div');
      box.className = 'notice rafig-inline-cv-price';
      box.innerHTML = '<strong>عرض CV الاحترافي — 20$</strong><br>إعداد CV احترافي <strong>بالعربية + English</strong> وتسليمه بصيغتي <strong>PDF + Word</strong>.<br>التسليم خلال <strong>24 ساعة كحد أقصى</strong> بعد تأكيد الدفع والمراجعة الإدارية.<br><strong>الدفع عبر Whish Money</strong>، وإثبات الدفع (صورة الإيصال أو رقم التحويل) مطلوب قبل إرسال الطلب.';
      const heading = cvPanel.querySelector('h3');
      if (heading) heading.insertAdjacentElement('afterend', box); else cvPanel.prepend(box);
    }

    const careSection = document.querySelector('#care');
    if (careSection && !careSection.querySelector('.rafig-inline-care-price')) {
      const box = document.createElement('div');
      box.className = 'notice rafig-inline-care-price';
      box.style.cssText = 'grid-column:1/-1;margin-top:4px;text-align:center;border-right-color:var(--green)';
      box.innerHTML = '<strong>الأسعار الأساسية:</strong> رعاية مسن 11 ساعة <strong>30$–35$</strong> يوميًا · رعاية مسن 24 ساعة <strong>50$–55$</strong> يوميًا أو <strong>45$</strong> للترتيب الأسبوعي المستمر · تمريض/رعاية طبية 11 ساعة <strong>40$–50$</strong> حسب الحالة والخدمات.';
      careSection.appendChild(box);
    }

    // Financial-only Whish number is text, never a WhatsApp CTA.
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
      .hero .cta,.hero .status{display:none!important}
      .header-inner{min-height:62px}
      .brand img{width:58px!important;height:58px!important;object-fit:contain!important}
      .forms .btn{min-height:48px;width:100%;white-space:normal;line-height:1.3}
      .panel .btn{min-height:48px}
      .rafig-inline-cv-price,.rafig-inline-care-price{line-height:1.85}
      @media(max-width:700px){.header-inner{padding:6px 9px}.brand img{width:50px!important;height:50px!important}.brand strong{font-size:18px}.brand small{font-size:10px}.lang select{max-width:120px}.hero-card{padding:20px 14px}.hero-logo{width:min(330px,82vw)!important}.hero h1{font-size:27px}}
    `;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
