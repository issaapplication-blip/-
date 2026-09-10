(() => {
  const run = () => {
    document.querySelectorAll('.cta a[href="#join"], .cta a[href="#care"]').forEach(el => el.remove());
    document.querySelectorAll('.cta a[href*="wa.me"]').forEach(el => el.remove());
    const statusBox = document.querySelector('.hero .status');
    const footer = document.querySelector('footer');
    if (statusBox && footer && !footer.querySelector('.rafig-system-status')) {
      const wrap = document.createElement('div');
      wrap.className = 'rafig-system-status';
      wrap.style.cssText = 'max-width:760px;margin:16px auto 0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;text-align:center';
      wrap.innerHTML = '<strong>حالة النظام</strong> <span id="rafig-footer-status">جاهزة</span> <button id="rafig-footer-status-button" class="btn outline" type="button" style="margin-inline-start:8px;min-height:38px;padding:8px 13px">فحص النظام</button>';
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
        } finally {
          targetButton.disabled = false;
        }
      });
      if (sourceStatus) sourceStatus.closest('.status')?.remove();
    }
    document.querySelectorAll('img').forEach(img => {
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const src = img.getAttribute('src') || '';
      if (alt.includes('rafiq') || src.includes('rafig-approved-logo')) {
        img.src = '/rafig-approved-logo.svg?v=24';
        img.removeAttribute('srcset');
      }
    });
    document.querySelectorAll('a[href*="wa.me/96170600157"], a[href*="wa.me/96170600157?"]').forEach(link => {
      const replacement = document.createElement('span');
      replacement.className = link.className || 'phone';
      replacement.dir = 'ltr';
      replacement.textContent = '+961 70 600 157';
      link.replaceWith(replacement);
    });
    document.querySelectorAll('.contact.finance').forEach(card => {
      const blocks = [...card.querySelectorAll('div')].filter(x => !x.classList.contains('phone'));
      const text = blocks[0];
      if (text) text.textContent = 'هذا الرقم مخصص للتحويلات والأمور المالية عبر Whish Money فقط، وليس للمراسلات أو تشغيل وكيل RAFIQ.';
    });
    const greetings = ['أهلًا بكم في RAFIQ','مرحبًا بكم في RAFIQ','يسعدنا استقبالكم في RAFIQ','أهلًا وسهلًا بكم في RAFIQ','RAFIQ يرحّب بكم اليوم','مع RAFIQ تبدأ الرعاية بثقة وأمان','نرحّب بكم اليوم في RAFIQ'];
    const title = document.querySelector('.hero h1');
    if (title) {
      const day = Math.floor(Date.now() / 86400000);
      const greeting = greetings[((day % greetings.length) + greetings.length) % greetings.length];
      title.innerHTML = `${greeting.replace('RAFIQ', '<span>RAFIQ</span>')}`;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
