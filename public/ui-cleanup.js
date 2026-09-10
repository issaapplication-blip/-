(() => {
  const run = () => {
    // Final RAFIQ layout: no duplicate hero controls; bottom application buttons remain.
    document.querySelectorAll('.hero .hero-logo, .hero .cta, .hero .status').forEach(el => el.remove());
    document.querySelectorAll('.rafig-system-status, #rafig-cv-pricing, #rafig-care-pricing').forEach(el => el.remove());

    const headerInner = document.querySelector('.header-inner');
    const brand = document.querySelector('.brand');
    const lang = document.querySelector('.lang');
    if (headerInner && brand && lang) {
      headerInner.style.cssText = 'max-width:none;width:100%;padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;direction:rtl';
      brand.style.cssText = 'order:2;display:flex;align-items:center;gap:9px;margin-left:0;margin-right:auto';
      lang.style.cssText = 'order:1;display:flex;align-items:center;gap:6px;margin-left:auto;margin-right:0';
    }

    // Restore the approved RAFIQ logo asset supplied for the project; never substitute a new design.
    document.querySelectorAll('img[alt*="RAFIQ" i], img[alt*="رفيق"], img[src*="rafig-approved-logo"], .brand img').forEach(img => {
      img.src = '/rafig-approved-logo.svg?v=32';
      img.removeAttribute('srcset');
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.style.objectFit = 'contain';
      img.style.imageRendering = 'auto';
    });

    // One greeting per 24 hours, determined by Beirut calendar day.
    const greetings = ['أهلًا بكم في RAFIQ','مرحبًا بكم في RAFIQ','يسعدنا استقبالكم في RAFIQ','أهلًا وسهلًا بكم في RAFIQ','RAFIQ يرحّب بكم اليوم','مع RAFIQ تبدأ الرعاية بثقة وأمان','نرحّب بكم اليوم في RAFIQ'];
    const title = document.querySelector('.hero h1');
    if (title) {
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      let index = 0;
      for (let i = 0; i < dayKey.length; i++) index = (index * 31 + dayKey.charCodeAt(i)) % greetings.length;
      title.innerHTML = greetings[index].replace('RAFIQ', '<span>RAFIQ</span>');
    }

    // Prices live in their designated service/request panels, not as standalone blocks.
    const cvPanel = document.getElementById('panel-cv');
    if (cvPanel && !cvPanel.querySelector('.rafig-inline-cv-price')) {
      const box = document.createElement('div');
      box.className = 'notice rafig-inline-cv-price';
      box.innerHTML = '<strong>سعر CV الاحترافي: 20$</strong><br>عربي + English · PDF + Word · التسليم خلال 24 ساعة كحد أقصى بعد تأكيد الدفع والمراجعة الإدارية · الدفع عبر Whish Money · إثبات الدفع مطلوب قبل إرسال الطلب.';
      cvPanel.prepend(box);
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
      .hero .hero-logo,.hero .cta,.hero .status{display:none!important}
      .header-inner{min-height:62px}
      .forms .btn{min-height:48px;width:100%;white-space:normal;line-height:1.3}
      .panel .btn{min-height:48px}
      .rafig-inline-cv-price,.rafig-inline-care-price{line-height:1.8}
      @media(max-width:700px){.header-inner{padding:6px 9px}.brand img{width:50px!important;height:50px!important}.brand strong{font-size:18px}.brand small{font-size:10px}.lang select{max-width:120px}.hero-card{padding:20px 14px}.hero h1{font-size:27px}}
    `;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
