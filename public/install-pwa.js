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
    if (document.getElementById('rafig-install-app') || isStandalone) return;
    const target = document.querySelector('.hero .cta') || document.querySelector('.header-inner') || document.querySelector('header');
    if (!target) return;

    const button = document.createElement('button');
    button.id = 'rafig-install-app';
    button.type = 'button';
    button.className = 'btn gold rafig-install-app';
    button.textContent = '📲 تثبيت التطبيق';
    button.setAttribute('aria-label', 'تثبيت تطبيق RAFIQ على الجهاز');
    button.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        return;
      }
      alert(instructions());
    });
    target.appendChild(button);

    const style = document.createElement('style');
    style.id = 'rafig-install-style';
    style.textContent = `
      .rafig-install-app{min-height:46px!important}
      @media(max-width:700px){.rafig-install-app{width:100%!important}}
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
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
