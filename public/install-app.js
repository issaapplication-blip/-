/* RAFIQ | رفيق — reliable PWA install helper */
(function () {
  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }
  if (standalone()) return;

  // Register the PWA service worker before waiting for Chrome's installability signal.
  // This is required for the intended PWA install flow on supported browsers.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=72', { scope: '/' })
      .catch(function (err) { console.warn('RAFIQ service worker registration failed', err); });
  }

  var deferred = null;

  function showControls() {
    document.querySelectorAll('[data-rafiq-install]').forEach(function (b) {
      b.hidden = false;
      b.style.display = '';
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    showControls();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    document.querySelectorAll('[data-rafiq-install]').forEach(function (b) {
      b.hidden = true;
      b.style.display = 'none';
    });
  });

  function instructions() {
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      return 'لتثبيت رفيق على iPhone:\n\n1. اضغط زر المشاركة ↗\n2. اختر «إضافة إلى الشاشة الرئيسية»\n3. اضغط «إضافة».';
    }
    if (/Android/i.test(ua)) {
      return 'لتثبيت رفيق على Android:\n\n1. افتح القائمة ⋮ في Chrome\n2. اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»\n3. اضغط «تثبيت».';
    }
    return 'لتثبيت رفيق:\n\nAndroid: Chrome ⋮ ← «تثبيت التطبيق»\niPhone: المشاركة ← «إضافة إلى الشاشة الرئيسية»\nالكمبيوتر: استخدم أيقونة التثبيت ⊕ في شريط العنوان.';
  }

  window.RAFIQ_INSTALL = {
    prompt: function () {
      if (!deferred) return false;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; });
      return true;
    },
    instructions: instructions
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rafiq-install]');
    if (!b) return;
    e.preventDefault();
    if (!window.RAFIQ_INSTALL.prompt()) alert(instructions());
  });

  window.addEventListener('load', function () {
    showControls();

    if (!document.querySelector('[data-rafiq-install]')) {
      var bar = document.createElement('div');
      bar.setAttribute('data-rafiq-bar', '1');
      bar.style.cssText =
        'position:fixed;inset-inline:0;bottom:0;z-index:9999;display:flex;' +
        'gap:10px;align-items:center;justify-content:center;padding:11px 12px;' +
        'background:#087f58;color:#fff;font-weight:800;font-size:14px;' +
        'box-shadow:0 -6px 22px rgba(0,0,0,.2);font-family:system-ui,sans-serif';
      bar.innerHTML =
        '<span>ثبّت منصة رفيق على جهازك</span>' +
        '<button type="button" data-rafiq-install style="' +
        'background:#fff;color:#087f58;border:0;border-radius:10px;' +
        'padding:10px 18px;font-weight:900;cursor:pointer">تثبيت الآن</button>';
      document.body.appendChild(bar);
    }
  });
})();