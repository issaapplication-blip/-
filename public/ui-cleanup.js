(() => {
  const run = () => {
    // Keep the hero focused: the detailed actions already exist lower on the page.
    document.querySelectorAll('.cta a[href="#join"], .cta a[href="#care"]').forEach(el => el.remove());
    document.querySelectorAll('.cta a[href*="wa.me"]').forEach(el => el.remove());

    // Move the technical system check out of the hero and into the footer.
    const statusBox = document.querySelector('.hero .status');
    const footer = document.querySelector('footer');
    if (statusBox && footer && !footer.querySelector('.rafig-system-status')) {
      const wrap = document.createElement('div');
      wrap.className = 'rafig-system-status';
      wrap.style.cssText = 'max-width:760px;margin:16px auto 0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;text-align:center';
      wrap.innerHTML = '<strong>حالة النظام</strong> <span id="rafig-footer-status">جاهزة</span> <button id="rafig-footer-status-button" class="btn outline" type="button" style="margin-inline-start:8px;min-height:38px;padding:8px 13px">فحص النظام</button>';
      footer.appendChild(wrap);
      const sourceStatus = document.getElementById('status');
      const sourceButton = document.getElementById('status-button');
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

    // Use the approved vector logo everywhere for crisp rendering.
    document.querySelectorAll('img').forEach(img => {
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const src = img.getAttribute('src') || '';
      if (alt.includes('rafiq') || src.includes('rafig-approved-logo')) {
        img.src = '/rafig-approved-logo.svg?v=23';
        img.removeAttribute('srcset');
      }
    });

    // Rotate the welcome message automatically once every 24 hours.
    const greetings = [
      'أهلًا بكم في RAFIQ',
      'مرحبًا بكم في RAFIQ',
      'يسعدنا استقبالكم في RAFIQ',
      'أهلًا وسهلًا بكم في RAFIQ',
      'RAFIQ يرحّب بكم اليوم',
      'مع RAFIQ تبدأ الرعاية بثقة وأمان',
      'نرحّب بكم اليوم في RAFIQ'
    ];
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
