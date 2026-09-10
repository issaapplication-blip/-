(() => {
  const run = () => {
    const remove = (el) => el?.remove();
    document.querySelectorAll('.cta a[href*="wa.me"]').forEach(remove);
    const statusBox = document.querySelector('.hero .status');
    const footer = document.querySelector('footer');
    if (statusBox && footer && !footer.querySelector('.rafig-system-status')) {
      const wrap = document.createElement('div');
      wrap.className = 'rafig-system-status';
      wrap.style.cssText = 'max-width:760px;margin:16px auto 0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;text-align:center';
      wrap.innerHTML = '<strong>حالة النظام</strong> <span id="rafig-footer-status">جاهزة</span> <button id="rafig-footer-status-button" class="btn outline" type="button">فحص النظام</button>';
      footer.appendChild(wrap);
      const sourceStatus = document.getElementById('status');
      const targetStatus = document.getElementById('rafig-footer-status');
      const targetButton = document.getElementById('rafig-footer-status-button');
      targetButton.addEventListener('click', async () => {
        targetStatus.textContent = 'جارٍ الفحص…';
        targetButton.disabled = true;
        try {
          const response = await fetch('/api/status', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
          if (!response.ok) throw new Error('status request failed');
          const data = await response.json();
          targetStatus.textContent = data.ok ? 'النظام يعمل · الإرسال الخارجي متوقف · الموافقة البشرية مطلوبة.' : 'تعذر التحقق.';
        } catch {
          targetStatus.textContent = 'الخادم غير متاح حاليًا.';
        } finally { targetButton.disabled = false; }
      });
      if (sourceStatus) sourceStatus.closest('.status')?.remove();
    }

    // Use the approved vector logo everywhere: sharper on every screen and density.
    document.querySelectorAll('img[alt*="RAFIQ" i], img[alt*="رفيق"], img[src*="rafig-approved-logo"], .hero-logo, .brand img').forEach(img => {
      img.src = '/rafig-approved-logo.svg?v=27';
      img.removeAttribute('srcset');
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.style.objectFit = 'contain';
      img.style.imageRendering = 'auto';
    });

    // Stable, touch-friendly button layout inside the app.
    const style = document.createElement('style');
    style.id = 'rafig-ui-final-fixes';
    style.textContent = `
      .cta,.forms,.cards{align-items:stretch}
      .cta .btn,.form-card .btn,.panel .btn{min-height:48px;line-height:1.25;white-space:normal}
      .cta .btn{flex:1 1 210px;max-width:280px}
      .forms .form-card{min-width:0}
      .forms .form-card .btn{margin-top:auto}
      button:disabled{opacity:.6;cursor:wait}
      @media(max-width:700px){.cta{gap:9px}.cta .btn{max-width:none;width:100%}.forms{gap:12px}.form-card{padding:16px}.panel{padding:16px}.brand img{width:54px;height:54px}.hero-logo{width:min(330px,84vw);max-height:330px}}
      @media(min-width:701px) and (max-width:980px){.forms .form-card:last-child{grid-column:1/-1;max-width:50%;margin-inline:auto;width:100%}}
    `;
    document.head.appendChild(style);

    // Whish number is financial-only.
    document.querySelectorAll('a[href*="wa.me/96170600157"], a[href*="wa.me/96170600157?"]').forEach(link => {
      const replacement = document.createElement('span');
      replacement.className = link.className || 'phone';
      replacement.dir = 'ltr';
      replacement.textContent = '+961 70 600 157';
      link.replaceWith(replacement);
    });
    document.querySelectorAll('.contact.finance').forEach(card => {
      const blocks = [...card.querySelectorAll('div')].filter(x => !x.classList.contains('phone'));
      if (blocks[0]) blocks[0].textContent = 'هذا الرقم مخصص للتحويلات والأمور المالية عبر Whish Money فقط، وليس للمراسلات أو تشغيل وكيل RAFIQ.';
    });

    // Separate, complete CV price list.
    const formsSection = document.querySelector('.forms');
    if (formsSection && !document.getElementById('rafig-cv-pricing')) {
      const section = document.createElement('section');
      section.id = 'rafig-cv-pricing';
      section.style.cssText = 'margin:18px 0;padding:20px;border:1px solid var(--line);border-radius:20px;background:#fffaf0';
      section.innerHTML = '<div class="section-title" style="margin-top:0"><h2>قائمة أسعار خدمة CV الاحترافي</h2><p>السعر واضح قبل بدء تعبئة الطلب.</p></div><div class="card" style="max-width:760px;margin:auto;text-align:right"><h3 style="color:var(--green);margin-top:0">CV احترافي — 20$</h3><ul class="benefit-list"><li>إعداد CV احترافي باللغة العربية والإنجليزية.</li><li>التسليم بصيغة PDF + Word.</li><li>التسليم خلال مدة أقصاها 24 ساعة بعد تأكيد الدفع والمراجعة الإدارية.</li><li>الدفع عبر Whish Money.</li><li>إثبات الدفع مطلوب عند تقديم طلب الـCV.</li></ul></div>';
      formsSection.parentNode.insertBefore(section, formsSection.nextSibling);
    }

    // Separate, complete care/nursing price list.
    const careAnchor = document.querySelector('#care');
    if (careAnchor && !document.getElementById('rafig-care-pricing')) {
      const section = document.createElement('section');
      section.id = 'rafig-care-pricing';
      section.style.cssText = 'margin:18px 0;padding:20px;border:1px solid var(--line);border-radius:20px;background:#effaf5';
      section.innerHTML = '<div class="section-title" style="margin-top:0"><h2>قائمة أسعار خدمات الرعاية والتمريض</h2><p>الأسعار الأساسية المتفق عليها، وتُحدد القيمة النهائية حسب الحالة والخدمات والاتفاق.</p></div><div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr))"><article class="card"><h3>رعاية مسن — 11 ساعة</h3><p><strong>30$–35$ يوميًا</strong><br>دوام نهاري أو ليلي.</p></article><article class="card"><h3>رعاية مسن — 24 ساعة</h3><p><strong>50$–55$ يوميًا</strong><br>أو <strong>45$ يوميًا</strong> للترتيب الأسبوعي المستمر.</p></article><article class="card"><h3>تمريض / رعاية طبية — 11 ساعة</h3><p><strong>40$–50$</strong><br>بحسب الحالة والخدمات الطبية المطلوبة.</p></article></div>';
      careAnchor.parentNode.insertBefore(section, careAnchor.nextSibling);
    }

    // Partner goodwill commitment.
    const main = document.querySelector('main');
    if (main && !document.getElementById('rafig-partner-goodwill')) {
      const notice = document.createElement('section');
      notice.id = 'rafig-partner-goodwill';
      notice.style.cssText = 'margin:20px 0;padding:18px 20px;border:1px solid #b9e4d1;border-radius:18px;background:#effaf5;line-height:1.9;text-align:center';
      notice.innerHTML = '<h2 style="margin:0 0 8px;color:var(--green);font-size:22px">مبادرة RAFIQ للشركاء</h2><p style="margin:0;color:var(--dark)">بعد إبرام اتفاق مع المختبرات ومؤسسات بيع المعدات الطبية ومراكز التصوير الطبي وعيادات العلاج الفيزيائي، تلتزم منصة RAFIQ بوضع إعلان تعريفي لكل مؤسسة أو مركز أو عيادة على المنصة <strong>دون أي مقابل مالي</strong>، كبادرة حسن نية وطيلة فترة الالتزام بالاتفاقات المبرمة مع المنصة، وفق شروط الاتفاق ومراجعة الإدارة. لا يُعد هذا الإعلان اعتمادًا أو ضمانًا للخدمة أو حصريةً ما لم ينص اتفاق مكتوب على ذلك.</p>';
      main.appendChild(notice);
    }

    const greetings = ['أهلًا بكم في RAFIQ','مرحبًا بكم في RAFIQ','يسعدنا استقبالكم في RAFIQ','أهلًا وسهلًا بكم في RAFIQ','RAFIQ يرحّب بكم اليوم','مع RAFIQ تبدأ الرعاية بثقة وأمان','نرحّب بكم اليوم في RAFIQ'];
    const title = document.querySelector('.hero h1');
    if (title) {
      const day = Math.floor(Date.now() / 86400000);
      const greeting = greetings[((day % greetings.length) + greetings.length) % greetings.length];
      title.innerHTML = `${greeting.replace('RAFIQ', '<span>RAFIQ</span>')}`;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
