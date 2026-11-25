/* ==========================================================
   RAFIQ | رفيق — language engine
   ------------------------------------------------------------
   One button at the top-left of every page, five languages.

   Design rules, in order of importance:
     1. Never show a blank string. Anything with no translation
        falls back to the Arabic text already in the page.
     2. Never break the layout. Long Latin words wrap instead of
        overflowing, and the page stays readable at 320px.
     3. Remember the choice, and set <html lang> and <html dir>
        so screen readers and the browser agree with what is shown.

   Translations live in js/locales/<lang>.js and are keyed. A page
   marks its text with data-i18n="key"; the engine fills it in.
   ========================================================== */

/* Cache-buster. install-app.js defines RAFIQ_VERSION, but the language
   engine must work on pages that never load it, so we fall back. */
if (typeof globalThis.RAFIQ_VERSION === 'undefined') globalThis.RAFIQ_VERSION = '73';

const RAFIQ_I18N = (function () {
  'use strict';

  var LANGS = [
    { code: 'ar', label: 'العربية',  flag: '🇱🇧', dir: 'rtl' },
    { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' },
    { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
    { code: 'it', label: 'Italiano', flag: '🇮🇹', dir: 'ltr' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' }
  ];

  var DEFAULT = 'ar';
  var KEY = 'rafiq.lang';
  var bundles = {};      // code -> { key: text }
  var current = DEFAULT;
  var startPromise = null;
  var pendingBundles = Object.create(null);
  var switchSequence = 0;
  var originalDocumentTitle = document.title || '';
  var originalTextNodes = new WeakMap();
  var originalAttributes = new WeakMap();
  var originalMarkedText = new WeakMap();

  function langMeta(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  function isKnown(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return true;
    return false;
  }

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(code) {
    try { localStorage.setItem(KEY, code); } catch (e) { /* private mode */ }
  }

  /* ---------- which language does this visitor actually read? ----------

     A member who opens the site on a phone set to French should not
     have to hunt for the button. On the very first visit the browser's
     own language list decides, and the answer is remembered from then
     on so the site never flip-flops between visits.

     The whole list is walked, not just the first entry. A phone set to
     Spanish with English listed second gets English, which is a
     language that person actually reads; dropping them into Arabic
     instead would be worse. Only when nothing in the list is
     supported does it fall back to Arabic, the source language. */
  var detected = null;

  function detect() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        list = Array.prototype.slice.call(navigator.languages);
      }
    } catch (e) { /* older browser */ }
    try { if (navigator.language) list.push(navigator.language); } catch (e) {}

    for (var i = 0; i < list.length; i++) {
      var raw = String(list[i] || '').toLowerCase().replace(/_/g, '-');
      if (!raw) continue;
      // "fr-CA" -> "fr"; an exact match on the full tag wins first
      if (isKnown(raw)) { detected = raw; return raw; }
      var base = raw.split('-')[0];
      if (isKnown(base)) { detected = base; return base; }
    }
    return DEFAULT;
  }

  function loadScript(code) {
    if (bundles[code]) return Promise.resolve(bundles[code]);
    if (pendingBundles[code]) return pendingBundles[code];
    var request = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/js/locales/' + code + '.js?v=' + RAFIQ_VERSION;
      script.async = true;
      script.onload = function () { resolve(bundles[code] || null); };
      script.onerror = function () { resolve(null); };
      document.head.appendChild(script);
    });
    pendingBundles[code] = request.then(function (result) {
      delete pendingBundles[code];
      return result;
    });
    return pendingBundles[code];
  }

  /* Register a bundle: called by every js/locales/<lang>.js file */
  function register(code, dict) {
    bundles[code] = dict || {};
  }

  function translate(key, lang) {
    var d = bundles[lang || current];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    return null;
  }

  /* Some older public pages were written before data-i18n markers were
     added. Their Arabic copy is still valid source copy, so translate it
     by looking it up in the Arabic source bundle. This keeps old pages
     compatible without rewriting their SEO/content structure. */

  var sourceToKey = Object.create(null);
  var sourceKeys = [];
  var legacyKeys = {
    'RAFIQ | رفيق': 'home.h1',
    'نصل بالحب والأمان لرعاية العائلة': 'home.tagline',
    'منصة رعاية منزلية وخدمات صحية في لبنان': 'home.who',
    'طلب رعاية أو انتساب': 'nav.form',
    'الرئيسية': 'nav.home',
    'الخدمات': 'nav.services',
    'المناطق': 'nav.regions',
    'كل المناطق': 'nav.allRegions',
    'دليل الرعاية': 'nav.guideAlt',
    'الأسئلة الشائعة': 'nav.faq',
    'لمقدمي الرعاية': 'nav.caregivers',
    'مقدمو الرعاية': 'nav.caregivers',
    'اسأل الوكيل': 'nav.agent',
    'مساعد رفيق': 'nav.agent',
    'واتساب RAFIQ': 'cta.wa',
    'واتساب': 'cta.waShort',
    'تقديم طلب': 'cta.request',
    'ابدأ التسجيل': 'services.join.cta',
    'خدمات RAFIQ': 'services.h1',
    'الرعاية المنزلية': 'services.home.h',
    'التمريض المنزلي': 'home.pick.3.t',
    'العلاج الفيزيائي': 'home.pick.4.t',
    'رعاية كبار السن': 'home.pick.1.t',
    'رعاية المرضى': 'home.pick.2.t',
    'دليل الرعاية المنزلية RAFIQ': 'guide.h1',
    'الأسئلة الشائعة حول الرعاية المنزلية': 'faq.h1',
    'إرسال طلب الانتساب مجانًا': 'cta.request',
    'إرسال الطلب': 'cta.request',
    'انتظرونا قريبًا': 'services.soon.badge',
    'خدمات قادمة': 'services.soon.h',
    'التسجيل': 'care.i1.h',
    'وظائف الرعاية': 'care.i2.h',
    'CV احترافي ATS': 'care.i3.h',
    'بدون اشتراك': 'care.i4.h'
  };

  function normalizeSource(s) {
    return String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  }

  function rebuildSourceIndex() {
    sourceToKey = Object.create(null);
    var ar = bundles[DEFAULT] || {};
    Object.keys(ar).forEach(function (key) {
      var value = normalizeSource(ar[key]);
      if (value) sourceToKey[value] = key;
    });
    Object.keys(legacyKeys).forEach(function (value) {
      sourceToKey[normalizeSource(value)] = legacyKeys[value];
    });
    sourceKeys = Object.keys(sourceToKey).sort(function (a, b) { return b.length - a.length; });
  }

  function translateSource(text, lang) {
    var normalized = normalizeSource(text);
    var target = lang || current;
    if (!normalized) return null;
    if (target === DEFAULT) return normalized;
    var key = sourceToKey[normalized];
    if (key) return translate(key, target);

    // Preserve dynamic suffixes such as a request number after a translated label.
    for (var i = 0; i < sourceKeys.length; i++) {
      var source = sourceKeys[i];
      if (normalized.indexOf(source + ' ') === 0) {
        var prefix = translate(sourceToKey[source], target);
        if (prefix) {
          var suffix = normalized.slice(source.length).trim();
          var translatedSuffix = suffix ? translateSource(suffix, target) : '';
          return prefix + (suffix ? ' ' + (translatedSuffix || suffix) : '');
        }
      }
    }
    return null;
  }

  function translateLegacyPage(lang) {
    rebuildSourceIndex();
    var changed = 0;
    var root = document.querySelector('main') || document.body;
    if (!root) return changed;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest('script,style,template,.ra-lang,.ra-untranslated,[data-i18n]')) continue;
      if (!originalTextNodes.has(node)) originalTextNodes.set(node, node.nodeValue);
      var source = originalTextNodes.get(node);
      var translated = lang === DEFAULT ? source : translateSource(source, lang);
      var next = translated == null || translated === '' ? source : translated;
      var leading = source.match(/^\\s*/)?.[0] || '';
      var trailing = source.match(/\\s*$/)?.[0] || '';
      next = leading + next + trailing;
      if (node.nodeValue !== next) {
        node.nodeValue = next;
        changed++;
      }
    }
    return changed;
  }

  function translateAttributes(lang) {
    var changed = 0;
    var attrs = ['title', 'alt', 'aria-label', 'placeholder'];
    var els = document.querySelectorAll('[title],[alt],[aria-label],[placeholder]');
    function applyAttribute(el, name) {
      var stored = originalAttributes.get(el) || Object.create(null);
      if (!Object.prototype.hasOwnProperty.call(stored, name)) stored[name] = el.getAttribute(name);
      originalAttributes.set(el, stored);
      var source = stored[name];
      var translated = lang === DEFAULT ? source : translateSource(source, lang);
      var next = translated == null || translated === '' ? source : translated;
      if (el.getAttribute(name) !== next) {
        el.setAttribute(name, next);
        changed++;
      }
    }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('.ra-lang,script,style,template')) continue;
      for (var j = 0; j < attrs.length; j++) {
        if (el.hasAttribute(attrs[j])) applyAttribute(el, attrs[j]);
      }
    }

    var metas = document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]');
    for (var k = 0; k < metas.length; k++) {
      var meta = metas[k];
      var saved = originalAttributes.get(meta) || Object.create(null);
      if (!Object.prototype.hasOwnProperty.call(saved, 'content')) saved.content = meta.getAttribute('content') || '';
      originalAttributes.set(meta, saved);
      var sourceContent = saved.content;
      var translatedContent = lang === DEFAULT ? sourceContent : translateSource(sourceContent, lang);
      var nextContent = translatedContent == null || translatedContent === '' ? sourceContent : translatedContent;
      if (meta.getAttribute('content') !== nextContent) {
        meta.setAttribute('content', nextContent);
        changed++;
      }
    }
    return changed;
  }


  function ensureDirectionStyles() {
    if (document.getElementById('ra-i18n-direction-style')) return;
    var style = document.createElement('style');
    style.id = 'ra-i18n-direction-style';
    style.textContent = [
      'html.ra-ltr,html.ra-ltr body{direction:ltr!important}',
      'html.ra-ltr input:not([type="checkbox"]):not([type="radio"]),html.ra-ltr select,html.ra-ltr textarea{direction:ltr;text-align:left}',
      'html.ra-ltr .field,html.ra-ltr .menu-panel,html.ra-ltr .notice,html.ra-ltr .form-message{ text-align:left }',
      'html:not(.ra-ltr),html:not(.ra-ltr) body{direction:rtl}',
      'html.ra-ltr .ra-lang,html.ra-ltr .ra-lang-menu,html.ra-ltr .ra-lang-btn{direction:ltr}',
      '.ra-lang{position:relative;display:flex;align-items:center;direction:ltr;z-index:10000}',
      'body>.ra-lang{position:fixed;top:12px;left:12px;z-index:100001}',
      '.ra-lang-btn{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:8px 11px;border:1px solid #dce9e2;border-radius:11px;background:#fff;color:#087f58;font:700 14px Arial,Tahoma,sans-serif;cursor:pointer;box-shadow:0 5px 14px rgba(0,0,0,.08)}',
      '.ra-lang-menu{position:absolute;top:calc(100% + 7px);left:0;right:auto;z-index:100002;min-width:175px;padding:7px;background:#fff;border:1px solid #dce9e2;border-radius:13px;box-shadow:0 12px 30px rgba(23,55,45,.16)}',
      '.ra-lang-menu[hidden]{display:none}',
      '.ra-lang-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:#fff;color:#17372d;font:700 14px Arial,Tahoma,sans-serif;text-align:left;cursor:pointer}',
      '.ra-lang-menu button:hover,.ra-lang-menu button[aria-current="true"]{background:#edf7f2;color:#087f58}'
    ].join('');
    document.head.appendChild(style);
  }

  function updateDynamicMessages(lang) {
    var messages = document.querySelectorAll('[data-rafig-source-text]');
    for (var i = 0; i < messages.length; i++) {
      var source = messages[i].getAttribute('data-rafig-source-text') || '';
      var translated = lang === DEFAULT ? source : translateSource(source, lang);
      messages[i].textContent = translated == null || translated === '' ? source : translated;
    }
  }

  /* Apply a language to the current page */
  function apply(code, opts) {
    opts = opts || {};
    if (!isKnown(code)) code = DEFAULT;
    rebuildSourceIndex();
    current = code;
    write(code);

    var m = langMeta(code);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', m.dir);
    document.documentElement.classList.toggle('ra-ltr', m.dir === 'ltr');
    ensureDirectionStyles();

    var titleKey = document.body ? document.body.getAttribute('data-i18n-title') : null;
    var titleTranslation = titleKey ? translate(titleKey, code) : null;
    if (!titleTranslation) titleTranslation = translateSource(originalDocumentTitle, code);
    document.title = titleTranslation || originalDocumentTitle;

    var marked = document.querySelectorAll('[data-i18n]');
    var filled = 0, missing = 0;
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      var key = el.getAttribute('data-i18n');
      if (!originalMarkedText.has(el) && el.textContent) originalMarkedText.set(el, el.textContent);
      var original = originalMarkedText.has(el) ? originalMarkedText.get(el) : '';
      var val = translate(key, code);
      var next = val !== null && val !== '' ? val : original;
      if (val === null || val === '') missing++;
      if (el.textContent !== next) el.textContent = next;
      if (val !== null && val !== '') filled++;
    }

    filled += translateLegacyPage(code);
    filled += translateAttributes(code);

    var ph = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < ph.length; j++) {
      var placeholderKey = ph[j].getAttribute('data-i18n-placeholder');
      var placeholderValue = translate(placeholderKey, code);
      if (placeholderValue) ph[j].setAttribute('placeholder', placeholderValue);
    }

    var al = document.querySelectorAll('[data-i18n-aria]');
    for (var k = 0; k < al.length; k++) {
      var ariaKey = al[k].getAttribute('data-i18n-aria');
      var ariaValue = translate(ariaKey, code);
      if (ariaValue) al[k].setAttribute('aria-label', ariaValue);
    }

    updateDynamicMessages(code);
    document.dispatchEvent(new CustomEvent('rafiq:i18n', {
      detail: { lang: code, dir: m.dir, filled: filled, missing: missing }
    }));
    if (!opts.silent) showBanner(code, missing, filled);
    return { lang: code, dir: m.dir, filled: filled, missing: missing };
  }

  /* How much of the visible page is still Arabic?
     Counting missing keys is not enough: a page can have every shared
     label translated and still be almost entirely Arabic. So measure the
     Arabic text that is actually on screen, ignoring the language menu
     itself (which always shows each language in its own language) and
     anything not rendered, such as the contents of a <template>.

     Returns both the Arabic count and the total, because what matters is
     the share of the page, not an absolute number: a 260-character page
     that is entirely Arabic needs the notice just as much as a long one. */
  var ARABIC = /[؀-ۿݐ-ݿ]/;
  function arabicShare() {
    var root = document.querySelector('main') || document.body;
    if (!root) return { arabic: 0, total: 0, ratio: 0 };

    var arabic = 0, total = 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var s = node.nodeValue;
        if (!s || !s.trim()) return NodeFilter.FILTER_REJECT;
        var el = node.parentElement;
        if (!el || el.closest('.ra-lang, script, style')) return NodeFilter.FILTER_REJECT;
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.trim().length;
      total += len;
      if (ARABIC.test(node.nodeValue)) arabic += len;
    }
    return { arabic: arabic, total: total, ratio: total ? arabic / total : 0 };
  }

  function showBanner(code, missing, filled) {
    var old = document.querySelector('.ra-untranslated');
    if (old) old.remove();
    if (code === DEFAULT) return;              // Arabic is the source language

    // Internal tooling (admin, dashboard, barcode) and the error page are
    // used by the manager only. Putting "this page is still in Arabic" at
    // the top of a page nobody should be on would only advertise it, so
    // those pages opt out with data-rafiq-internal on <body>.
    if (document.body && document.body.hasAttribute('data-rafiq-internal')) return;

    // More than a tenth of the page still in Arabic means a visitor will
    // hit text they cannot read. A few stray labels do not.
    var share = arabicShare();
    var mostlyArabic = share.arabic > 40 && share.ratio > 0.10;
    if (!mostlyArabic && !missing) return;

    var b = document.createElement('p');
    b.className = 'ra-untranslated';
    b.textContent = translate(mostlyArabic ? 'notice.page' : 'notice.partial', code) ||
      (mostlyArabic
        ? 'The navigation is translated, but the text of this page is still in Arabic.'
        : 'Some sections on this page are still shown in Arabic.');
    var main = document.querySelector('main');
    (main || document.body).insertBefore(b, main ? main.firstChild : document.body.firstChild);
  }

  /* ---------------- the switcher button ---------------- */
  function buildButton() {
    if (document.querySelector('.ra-lang')) return;
    var meta = langMeta(current);

    // the bar spans the page; the inner group holds the button and the
    // menu hangs off the button, not off the far edge of the screen
    var bar = document.createElement('div');
    bar.className = 'ra-lang';

    var wrap = document.createElement('div');
    wrap.className = 'ra-lang-inner';
    wrap.style.cssText = 'position:relative;display:inline-block';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ra-lang-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Language / اللغة');
    btn.innerHTML =
      '<span class="gl">' + meta.flag + '</span>' +
      '<span class="lbl"></span>' +
      '<span aria-hidden="true">▾</span>';

    var menu = document.createElement('div');
    menu.className = 'ra-lang-menu';
    menu.hidden = true;

    LANGS.forEach(function (L) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = L.code;
      b.innerHTML = '<span class="gl">' + L.flag + '</span>' +
                    '<span class="nm"></span>' +
                    '<span class="tick" aria-hidden="true">✓</span>';
      b.addEventListener('click', function () {
        close();
        setLanguage(L.code);
      });
      menu.appendChild(b);
    });

    var note = document.createElement('div');
    note.className = 'note';
    menu.appendChild(note);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    bar.appendChild(wrap);
    var host = document.querySelector('.topbar');
    if (host) host.insertBefore(bar, host.firstChild);
    else document.body.appendChild(bar);

    function open() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    // tapping anywhere else closes it, but a tap inside the menu is a
    // language choice, so stop it from reaching the document handler
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function (e) {
      if (!bar.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') close();
    });

    paintButton(btn, menu, note, current);
  }

  function paintButton(btn, menu, note, code) {
    var m = langMeta(code);
    btn.querySelector('.gl').textContent = m.flag;
    var lbl = btn.querySelector('.lbl');
    // the button label is always in its own language, so it is never lost
    lbl.textContent = m.label;
    Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      var L = langMeta(b.dataset.lang);
      b.querySelector('.nm').textContent = L.label;
      b.setAttribute('aria-current', String(b.dataset.lang === code));
      b.querySelector('.tick').style.visibility = b.dataset.lang === code ? 'visible' : 'hidden';
    });
    var nt = translate('lang.note', code);
    if (nt !== null) note.textContent = nt;
  }

  function setLanguage(code) {
    if (!isKnown(code)) code = DEFAULT;
    var requestId = ++switchSequence;
    return Promise.all([loadScript(DEFAULT), loadScript(code)]).then(function () {
      if (requestId !== switchSequence) return { lang: current, dir: langMeta(current).dir, superseded: true };
      var result = apply(code);
      var widget = document.querySelector('.ra-lang');
      if (widget) {
        paintButton(widget.querySelector('.ra-lang-btn'), widget.querySelector('.ra-lang-menu'),
                    widget.querySelector('.note'), code);
      }
      return result;
    });
  }

  function start() {
    if (startPromise) return startPromise;
    var saved = read();
    var auto = false;
    var want;
    if (saved && isKnown(saved)) {
      want = saved;
    } else {
      want = detect();
      auto = detected !== null;
      write(want);
    }
    buildButton();
    startPromise = Promise.all([loadScript(DEFAULT), loadScript(want)]).then(function () {
      return setLanguage(want).then(function (result) {
        result.auto = auto;
        result.detected = detected;
        return result;
      });
    }).catch(function (error) {
      startPromise = null;
      throw error;
    });
    return startPromise;
  }

  return {
    start: start,
    setLanguage: setLanguage,
    apply: apply,
    register: register,
    translate: translate,
    translateText: function (text, lang) { return translateSource(text, lang || current); },
    langMeta: langMeta,
    isKnown: isKnown,
    detect: detect,
    LANGS: LANGS,
    get current() { return current; },
    get detected() { return detected; },
    version: '4'
  };
})();

if (typeof globalThis !== 'undefined') globalThis.RAFIQ_I18N = RAFIQ_I18N;

document.addEventListener('rafiq:i18n:refresh', function () {
  RAFIQ_I18N.setLanguage(RAFIQ_I18N.current).catch(function (error) {
    console.error('RAFIQ i18n refresh failed', error);
  });
});

/* Start automatically on every public page. */
(function () {
  function boot() { try { RAFIQ_I18N.start(); } catch (e) { console.error('RAFIQ i18n boot failed', e); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RAFIQ_I18N;