(() => {
  const run = () => {
    document.querySelectorAll('.hero .cta, .hero .status').forEach(el => el.remove());
    document.querySelectorAll('.rafig-system-status, #rafig-cv-pricing, #rafig-care-pricing').forEach(el => el.remove());

    const headerInner = document.querySelector('.header-inner');
    const brand = document.querySelector('.brand');
    const lang = document.querySelector('.lang');
    if (headerInner && brand && lang) {
      headerInner.style.cssText = 'max-width:none;width:100%;padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;direction:rtl';
      brand.style.cssText = 'order:1;display:flex;align-items:center;gap:9px;margin:0';
      lang.style.cssText = 'order:2;display:flex;align-items:center;gap:6px;margin:0';
    }

    const logoUrl = '/rafig-approved-logo-2048.png?v=17';
    document.querySelectorAll('.brand img, .hero-logo').forEach(img => {
      img.src = logoUrl;
      img.removeAttribute('srcset');
      img.loading = 'eager';
      img.decoding = 'async';
    });
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
      link.href = '/rafig-approved-logo-512.png?v=17';
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
      box.innerHTML = '<strong>أسعار CV + Cover Letter الاحترافية</strong><br>لغتان: <strong>60$</strong> · 3 لغات: <strong>90$</strong> · 4 لغات: <strong>120$</strong> · كل لغة إضافية: <strong>30$</strong>.<br>التسليم خلال <strong>24 ساعة كحد أقصى</strong> بعد تأكيد الدفع والمراجعة الإدارية، بصيغتي <strong>PDF + Word</strong>.<br><strong>الدفع عبر Whish Money</strong>، وإثبات الدفع مطلوب قبل اعتماد الطلب.';
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
      .hero .cta,.hero .status{display:none!important}
      .header-inner{min-height:62px}
      .brand img{width:58px!important;height:58px!important;object-fit:contain!important}
      .hero-logo{width:min(420px,88vw)!important;max-height:none!important}
      .forms .btn{min-height:48px;width:100%;white-space:normal;line-height:1.3}
      .panel .btn{min-height:48px}
      .rafig-inline-cv-price,.rafig-inline-care-price{line-height:1.85}
      .rafig-install-app{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:8px 12px;border:1px solid var(--g);border-radius:12px;background:var(--g);color:#fff;font:800 13px system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 4px 14px rgba(8,127,88,.16)}
      @media(max-width:700px){.header-inner{padding:6px 9px;flex-wrap:wrap}.brand img{width:50px!important;height:50px!important}.brand strong{font-size:18px}.brand small{font-size:10px}.lang select{max-width:120px}.hero-card{padding:20px 14px}.hero-logo{width:min(380px,90vw)!important}.hero h1{font-size:27px}.rafig-install-app{font-size:12px;min-height:40px;padding:7px 10px}}
    `;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
