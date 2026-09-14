(() => {
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

  const mount = () => {
    if (isStandalone) return;
    document.querySelectorAll('#rafig-install-app').forEach((el, i) => { if (i > 0) el.remove(); });
    if (document.getElementById('rafig-install-app')) return;

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

    const style = document.createElement('style');
    style.id = 'rafig-install-style';
    style.textContent = `
      .rafig-install-slot{display:flex;justify-content:center;align-items:center;margin:12px 0 2px}
      .rafig-install-app{min-height:48px!important;padding-inline:24px!important;font-size:15px!important;box-shadow:0 8px 24px rgba(23,55,45,.12)}
      @media(max-width:700px){.rafig-install-slot{margin:12px 0 4px}.rafig-install-app{width:100%!important}}
    `;
    document.head.appendChild(style);
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