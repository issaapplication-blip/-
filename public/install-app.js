/* ==========================================================
   RAFIQ | رفيق — install helper
   Gives the user a one-tap install path on every device,
   including plain HTTP where Chrome hides its own button.
   ========================================================== */
(function () {
  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  if (standalone()) return;

  /* ---------- Android / Chrome: the real one-tap prompt ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    document.querySelectorAll('[data-rafiq-install]').forEach(function (b) {
      b.hidden = false;
    });
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    document.querySelectorAll('[data-rafiq-install]').forEach(function (b) {
      b.hidden = true;
    });
  });

  /* ---------- every platform: manual instructions ---------- */
  function instructions() {
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      return 'لتثبيت التطبيق على iPhone:\n\n' +
             '1. اضغط زر المشاركة (المربّع والسهم لأعلى) في أسفل الشاشة\n' +
             '2. اختر "إضافة إلى الشاشة الرئيسية"\n' +
             '3. اضغط "إضافة"\n\n' +
             'سيظهر التطبيق بعدها كأيقونة على شاشتك ويُفتح مباشرة.';
    }
    if (/Android/i.test(ua)) {
      return 'لتثبيت التطبيق على أندرويد:\n\n' +
             '1. اضغط قائمة المتصفح ⋮ (أعلى اليمين)\n' +
             '2. اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"\n' +
             '3. اضغط "تثبيت"\n\n' +
             'سيظهر التطبيق بعدها كأيقونة على شاشتك ويُفتح مباشرة.';
    }
    return 'لتثبيت التطبيق:\n\n' +
           'أندرويد: قائمة Chrome ⋮ ← "تثبيت التطبيق"\n' +
           'iPhone: زر المشاركة ← "إضافة إلى الشاشة الرئيسية"\n' +
           'كمبيوتر: أيقونة التثبيت ⊕ في شريط العنوان.';
  }

  window.RAFIQ_INSTALL = {
    prompt: function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; });
        return true;
      }
      return false;
    },
    instructions: instructions
  };

  /* ---------- attach to any button marked for install ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rafiq-install]');
    if (!b) return;
    e.preventDefault();
    if (!RAFIQ_INSTALL.prompt()) alert(instructions());
  });

  /* ---------- add a bar when no button exists on the page ---------- */
  window.addEventListener('load', function () {
    if (document.querySelector('[data-rafiq-install]')) return;

    var bar = document.createElement('div');
    bar.setAttribute('data-rafiq-bar', '1');
    bar.style.cssText =
      'position:fixed;inset-inline:0;bottom:0;z-index:9999;display:none;' +
      'gap:10px;align-items:center;justify-content:center;padding:11px 12px;' +
      'background:#087f58;color:#fff;font-weight:800;font-size:14px;' +
      'box-shadow:0 -6px 22px rgba(0,0,0,.2);font-family:system-ui,sans-serif';
    bar.innerHTML =
      '<span>ثبّت منصة رفيق على جهازك</span>' +
      '<button type="button" data-rafiq-install ' +
      'style="background:#fff;color:#087f58;border:0;border-radius:10px;' +
      'padding:10px 18px;font-weight:900;cursor:pointer">تثبيت الآن</button>';
    document.body.appendChild(bar);

    var show = function () { bar.style.display = 'flex'; };
    if (deferred) show();
    setTimeout(show, 2500);
  });
})();
