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
        box.innerHTML = '<strong>خدمة CV + Cover Letter — عرض الإطلاق الأول لمدة 15 يومًا</strong><br><strong>لغتان: 60$</strong> · <strong>3 لغات: 90$</strong> · <strong>4 لغات: 120$</strong>.<br>كل لغة إضافية بعد اللغتين الأساسيتين: <strong>+30$</strong> وتشمل CV + Cover Letter معًا.<br>الخدمة تشمل: صياغة احترافية ومتوافقة مع ATS، PDF وWord، العربية والإنكليزية، والفرنسية والإيطالية عند الطلب، مع عدم اختلاق أي خبرة أو شهادة أو تاريخ أو مهارة ومراجعة الترجمة والمعنى قبل اعتماد النسخة النهائية.<br><strong>الدفع عبر Whish Money</strong>، وإثبات الدفع مطلوب قبل اعتماد الطلب.';
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
