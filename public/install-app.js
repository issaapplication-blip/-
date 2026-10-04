/* ==========================================================
   RAFIQ | رفيق — install button, kept deliberately simple.

   One rule: the button is always there. If the browser can install the app
   itself we use that; if it cannot, the same button shows the two taps to
   do it by hand. No floating bar, no alerts, no hidden buttons.

   Markup contract - put this anywhere you want the button:
       <button data-rafiq-install>تثبيت التطبيق</button>
       <p data-rafiq-install-hint hidden></p>
   ========================================================== */
(function () {
  'use strict';

  var deferred = null;

  /* ---------- language ----------
     Every user-visible string here goes through T(). The key is resolved
     by the language engine when it is on the page; if it is not, the
     Arabic fallback that sits next to the key is used. That way this file
     never has to guess the current language, and it still works on a page
     that does not load the engine at all. */
  function T(key, fallback) {
    try {
      if (window.RAFIQ_I18N && window.RAFIQ_I18N.translate) {
        var v = window.RAFIQ_I18N.translate(key);
        if (v) return v;
      }
    } catch (e) { /* engine not ready */ }
    return fallback;
  }

  /* the key of the message currently on screen, so a language change can
     repaint it without having to re-derive the whole diagnosis */
  var currentHintKey = null;
  var currentHintFallback = null;

  document.addEventListener('rafiq:i18n', function () {
    if (currentHintKey) say(currentHintKey, currentHintFallback);
  });

  function standalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  function isIOS() {
    var ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* the manual steps, as one short block */
  function steps() {
    if (isIOS()) {
      return T('install.steps.ios',
        'اضغط زر المشاركة ⬆︎ في الأسفل ← "إضافة إلى الشاشة الرئيسية" ← "إضافة".');
    }
    if (/Android/i.test(navigator.userAgent)) {
      return T('install.steps.android',
        'افتح قائمة المتصفح ⋮ ← "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
    }
    return T('install.steps.desktop',
      'اضغط أيقونة التثبيت ⊕ في شريط عنوان المتصفح.');
  }

  function buttons() {
    return document.querySelectorAll('[data-rafiq-install], #installApp');
  }

  function hints() {
    return document.querySelectorAll('[data-rafiq-install-hint], #installHint');
  }

  /* say() always takes a key plus its Arabic fallback, so the message can
     be repainted the moment the visitor changes language. */
  function say(key, fallback) {
    currentHintKey = key;
    currentHintFallback = fallback;
    var text = T(key, fallback);
    hints().forEach(function (el) {
      el.textContent = text;
      el.hidden = false;
    });
  }

  function hide() {
    buttons().forEach(function (b) { b.hidden = true; });
    hints().forEach(function (h) { h.hidden = true; });
  }

  function show() {
    if (standalone()) { hide(); return false; }
    buttons().forEach(function (b) { b.hidden = false; });
    return true;
  }

  /* ---------- the browser can install it: use its own prompt ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hide();
    say('install.done', 'تم التثبيت ✅ التطبيق الآن على شاشتك.');
  });

  /* ---------- make the manifest installable on ANY host -------------
     Chrome refuses to install unless it can fetch both a 192 and a 512 icon.
     Some hosts serve only part of the site, so a correct manifest can still
     leave the user with no install button at all. When we detect that, we
     publish a repaired manifest built from the one image that always loads. */
  function iconLoads(src) {
    return fetch(src, { cache: 'force-cache' })
      .then(function (r) {
        return !!r.ok && (r.headers.get('content-type') || '').indexOf('image') === 0;
      })
      .catch(function () { return false; });
  }

  function repairManifest() {
    var link = document.querySelector('link[rel=manifest]');
    if (!link || !window.fetch || !window.Blob) return Promise.resolve(false);

    return fetch(link.href, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (m) {
        var icons = m.icons || [];
        if (!icons.length) return false;

        return Promise.all(icons.map(function (i) {
          return iconLoads(new URL(i.src, location.href).href);
        })).then(function (results) {
          var size = function (i) { return parseInt(String(i.sizes).split('x')[0], 10) || 0; };
          var ok192 = false, ok512 = false;
          icons.forEach(function (i, n) {
            if (!results[n]) return;
            var s = size(i);
            if (s >= 512) ok512 = true;
            else if (s >= 192) ok192 = true;
          });
          if (ok192 && ok512) return false;          // nothing to repair

          var logo = '/assets/rafig-logo.png';       // always served
          m.icons = [
            { src: logo, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: logo, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ];
          (m.shortcuts || []).forEach(function (s) {
            s.icons = [{ src: logo, sizes: '192x192' }];
          });
          link.href = URL.createObjectURL(
            new Blob([JSON.stringify(m)], { type: 'application/manifest+json' })
          );
          if (window.console) console.info('RAFIQ: manifest repaired (host was missing an icon)');
          return true;
        });
      })
      .catch(function () { return false; });
  }

  /* ---------- service worker: required for installability ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js?v=72', { updateViaCache: 'none' })
        .catch(function () { /* the site still works without it */ });
    });
  }

  /* ---------- one click, whatever the platform ---------- */
  function install(e) {
    if (e) e.preventDefault();
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        deferred = null;
        if (choice && choice.outcome === 'accepted') hide();
        else sayWhy();
      }).catch(function () { sayWhy(); });
      return;
    }
    sayWhy();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rafiq-install], #installApp');
    if (b) install(e);
  });

  /* a short, honest fallback for browsers that hide the button entirely
     (plain HTTP, or a browser with no install path at all) */
  function unsupported() {
    if (!window.isSecureContext) {
      return T('install.https',
        'التثبيت يحتاج اتصالاً آمناً (https). الموقع يعمل عادياً الآن.');
    }
    return T('install.noButton', 'المتصفح لا يعرض زر التثبيت. ') + steps();
  }

  /* ---------- diagnose: WHY can the browser not install right now? ----------
     The button must never be a dead end, so each state gets its own wording
     instead of one generic instruction. */
  function diagnose() {
    return {
      secureContext: !!window.isSecureContext,
      hasManifest: !!document.querySelector('link[rel=manifest]'),
      swSupported: 'serviceWorker' in navigator,
      standalone: standalone(),
      canPrompt: !!deferred
    };
  }

  /* The diagnosis as a key plus its Arabic source, so a language change can
     repaint the same reason in the new language. */
  function reasonEntry() {
    var d = diagnose();
    if (d.standalone) return { key: 'reason.installed', ar: 'التطبيق مثبَّت بالفعل على هذا الجهاز.' };
    if (!d.secureContext) return { key: 'reason.https', ar: 'التثبيت يحتاج رابطاً آمناً https — سيعمل الزر مباشرة عند فتحه.' };
    if (!d.swSupported) return { key: 'reason.noSW', ar: 'هذا المتصفح لا يدعم تثبيت التطبيقات. افتح الموقع في Chrome.' };
    if (!d.hasManifest) return { key: 'reason.noManifest', ar: 'ملف التطبيق غير متاح على هذا الخادم بعد.' };
    if (isIOS()) return { key: 'reason.ios', ar: 'على iPhone: زر المشاركة ⬆︎ ← "إضافة إلى الشاشة الرئيسية" ← "إضافة".' };
    if (!d.canPrompt) {
      return { key: 'reason.noPrompt', ar: 'اضغط قائمة المتصفح ⋮ ← "تثبيت التطبيق". إن لم يظهر الخيار، أعد فتح الموقع من الرابط المباشر.' };
    }
    return null;
  }

  /* the reason, already in the current language (public API) */
  function reason() {
    var e = reasonEntry();
    return e ? T(e.key, e.ar) : '';
  }

  /* show the reason if there is one, otherwise the manual steps */
  function sayWhy() {
    var e = reasonEntry();
    if (e) { say(e.key, e.ar); return; }
    if (isIOS()) {
      say('install.steps.ios', 'اضغط زر المشاركة ⬆︎ في الأسفل ← "إضافة إلى الشاشة الرئيسية" ← "إضافة".');
    } else if (/Android/i.test(navigator.userAgent)) {
      say('install.steps.android', 'افتح قائمة المتصفح ⋮ ← "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".');
    } else {
      say('install.steps.desktop', 'اضغط أيقونة التثبيت ⊕ في شريط عنوان المتصفح.');
    }
  }

window.RAFIQ_INSTALL = {
    install: install,
    steps: steps,
    show: show,
    hide: hide,
    repair: repairManifest,
    manifestRepaired: false,
    diagnose: diagnose,
    reason: reason,
    reasonEntry: reasonEntry,
    canPrompt: function () { return !!deferred; },
    unsupported: unsupported
  };

  /* ---------- wire up on load ---------- */
  function boot() {
    if (standalone()) { hide(); return; }
    show();

    // verify the manifest is really installable on THIS host, and repair it
    // when the host is missing an icon
    repairManifest().then(function (repaired) {
      window.RAFIQ_INSTALL.manifestRepaired = repaired;
      try {
        document.dispatchEvent(new CustomEvent('rafiq:manifest', { detail: { repaired: repaired } }));
      } catch (e) { /* older browser */ }
    });

    // give the browser a moment to fire beforeinstallprompt
    setTimeout(function () {
      if (deferred) { say('install.ready', 'اضغط «تثبيت التطبيق» لإضافته إلى جهازك.'); return; }
      sayWhy();
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();