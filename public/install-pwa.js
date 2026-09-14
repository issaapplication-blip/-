(() => {
  if (window.__RAFIQ_PWA_INSTALL_V2__) return;
  window.__RAFIQ_PWA_INSTALL_V2__ = true;

  // The old PWA worker can keep a stale DOM shell alive on mobile browsers.
  // Remove it and its caches so the next navigation always starts from Render.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
    }
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => {});
    }
  } catch (_) {}

  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isWindows = /windows/i.test(ua);
  const isMac = /macintosh|mac os x/i.test(ua) && !isIOS;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferredPrompt = null;

  const instructions = () => {
    if (isIOS) return 'على iPhone/iPad: افتح الصفحة في Safari، اضغط «مشاركة»، ثم اختر «إضافة إلى الشاشة الرئيسية». ';
    if (isAndroid) return 'على Android: استخدم Chrome أو Edge، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح.';
    if (isWindows) return 'على Windows: استخدم Chrome أو Edge ثم اختر «تثبيت التطبيق» من شريط العنوان أو قائمة المتصفح.';
    if (isMac) return 'على Mac: استخدم Safari أو Chrome أو Edge، ثم اختر «Add to Dock / Install» من قائمة المتصفح حسب المتصفح.';
    return 'إذا لم يظهر التثبيت التلقائي، افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». ';
  };

  const removeDuplicates = () => {
    // Fixed IDs: only one element is ever allowed for each control.
    ['joinBtn', 'careBtn', 'status-button', 'language'].forEach(id => {
      const nodes = document.querySelectorAll(`#${CSS.escape(id)}`);
      nodes.forEach((el, i) => { if (i > 0) el.remove(); });
    });

    // Repeated semantic CTA labels from an old/stale DOM injection.
    const labels = new Set([
      'الانتساب إلى المنصة', 'طلب رعاية منزلية', 'WhatsApp — 81',
      'تقديم طلب رعاية', 'الانتساب كمقدم رعاية', 'الانتساب كممرض/ة',
      'الانتساب كمعالج فيزيائي', 'بدء الطلب', 'فحص النظام'
    ]);
    const seen = new Map();
    document.querySelectorAll('button, a').forEach(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!labels.has(text)) return;
      const key = `${el.tagName}:${text}`;
      const count = seen.get(key) || 0;
      if (count > 0) el.remove();
      seen.set(key, count + 1);
    });

    const slots = document.querySelectorAll('.rafig-install-slot');
    slots.forEach((slot, i) => { if (i > 0) slot.remove(); });
    const buttons = document.querySelectorAll('#rafig-install-app');
    buttons.forEach((el, i) => { if (i > 0) el.remove(); });
  };

  const mount = () => {
    removeDuplicates();
    if (isStandalone || document.getElementById('rafig-install-app')) return;

    const hero = document.querySelector('.hero-card');
    if (!hero) return;
    let slot = document.querySelector('.rafig-install-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'rafig-install-slot';
      const cta = hero.querySelector('.cta');
      if (cta) cta.insertAdjacentElement('afterend', slot);
      else hero.appendChild(slot);
    }

    const button = document.createElement('button');
    button.id = 'rafig-install-app';
    button.type = 'button';
    button.className = 'btn gold rafig-install-app';
    button.textContent = '📲 تثبيت منصة RAFIQ';
    button.setAttribute('aria-label', 'تثبيت منصة RAFIQ على الجهاز');
    button.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        return;
      }
      alert(instructions());
    });
    slot.appendChild(button);

    if (!document.getElementById('rafig-install-style')) {
      const style = document.createElement('style');
      style.id = 'rafig-install-style';
      style.textContent = `
        .rafig-install-slot{display:flex;justify-content:center;align-items:center;margin:12px 0 2px}
        .rafig-install-app{min-height:48px!important;padding-inline:24px!important;font-size:15px!important;box-shadow:0 8px 24px rgba(23,55,45,.12)}
        @media(max-width:700px){.rafig-install-slot{margin:12px 0 4px}.rafig-install-app{width:100%!important}}
      `;
      document.head.appendChild(style);
    }
    removeDuplicates();
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    mount();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.getElementById('rafig-install-app')?.remove();
    document.querySelector('.rafig-install-slot')?.remove();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();