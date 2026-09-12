(() => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  let deferredPrompt = null;

  const mount = () => {
    if (document.getElementById('rafig-install-app') || isStandalone) return;
    const headerInner = document.querySelector('.header-inner');
    if (!headerInner) return;
    const button = document.createElement('button');
    button.id = 'rafig-install-app';
    button.type = 'button';
    button.className = 'rafig-install-app';
    button.textContent = 'تثبيت المنصة';
    button.setAttribute('aria-label', 'تثبيت منصة RAFIQ على الجهاز');
    button.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        button.remove();
        return;
      }
      if (isIOS) {
        alert('على iPhone/iPad: اضغط زر المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية».');
      } else {
        alert('إذا لم يظهر تثبيت تلقائي، افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».');
      }
    });
    headerInner.appendChild(button);
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
