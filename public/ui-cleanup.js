(() => {
  if (window.__RAFIQ_UI_CLEANUP_V2__) return;
  window.__RAFIQ_UI_CLEANUP_V2__ = true;

  const logoUrl = '/rafig-approved-logo-512.jpg?v=23';
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

  const removeRepeatedButtons = root => {
    const scope = root || document;
    const parents = new Set();
    scope.querySelectorAll?.('button, a.btn, [role="button"]').forEach(el => {
      if (el.parentElement) parents.add(el.parentElement);
    });
    parents.forEach(parent => {
      const seen = new Set();
      Array.from(parent.children).forEach(el => {
        if (!(el.matches?.('button, a.btn, [role="button"]'))) return;
        const key = [
          el.tagName,
          el.getAttribute('id') || '',
          el.getAttribute('data-open') || '',
          el.getAttribute('href') || '',
          normalize(el.textContent)
        ].join('|');
        if (!key || key.endsWith('||||')) return;
        if (seen.has(key)) el.remove(); else seen.add(key);
      });
    });
  };

  const removeRepeatedInstall = () => {
    document.querySelectorAll('#rafig-install-app').forEach((el, i) => { if (i > 0) el.remove(); });
    document.querySelectorAll('.rafig-install-slot').forEach((el, i) => { if (i > 0) el.remove(); });
  };

  const apply = () => {
    try {
      const headerInner = document.querySelector('.header-inner');
      const brand = document.querySelector('.brand');
      const lang = document.querySelector('.lang');
      if (headerInner && brand && lang) {
        headerInner.style.cssText = 'max-width:none;width:100%;padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;direction:rtl';
        brand.style.cssText = 'order:1;display:flex;align-items:center;gap:9px;margin:0';
        lang.style.cssText = 'order:2;display:flex;align-items:center;gap:6px;margin:0';
      }

      document.querySelectorAll('.brand img, .hero-logo').forEach(img => {
        if (img.src !== new URL(logoUrl, location.href).href) img.src = logoUrl;
        img.removeAttribute('srcset');
        img.loading = 'eager';
        img.decoding = 'async';
      });
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
        link.href = logoUrl;
        link.type = 'image/jpeg';
      });

      const cta = document.querySelector('.hero .cta');
      if (cta) {
        const seen = new Set();
        Array.from(cta.children).forEach(el => {
          if (!el.matches('a,button')) return;
          const key = [el.tagName, el.id || '', el.getAttribute('href') || '', normalize(el.textContent)].join('|');
          if (seen.has(key)) el.remove(); else seen.add(key);
        });
      }

      removeRepeatedButtons(document);
      removeRepeatedInstall();

      if (!document.getElementById('rafig-final-ui-fixes')) {
        const style = document.createElement('style');
        style.id = 'rafig-final-ui-fixes';
        style.textContent = `
          .header-inner{min-height:62px}
          .brand img{width:58px!important;height:58px!important;object-fit:contain!important}
          .hero-logo{width:min(420px,88vw)!important;max-height:none!important}
          .hero .cta{display:flex!important;visibility:visible!important;opacity:1!important}
          .hero .status{display:block!important;visibility:visible!important;opacity:1!important}
          .forms .btn{min-height:48px;width:100%;white-space:normal;line-height:1.3}
          .panel .btn{min-height:48px}
          .rafig-install-slot{display:flex;justify-content:center;align-items:center;margin:12px 0 2px}
          .rafig-install-app{min-height:48px!important;padding-inline:24px!important;font-size:15px!important}
          @media(max-width:700px){.header-inner{padding:6px 9px;flex-wrap:wrap}.brand img{width:50px!important;height:50px!important}.brand strong{font-size:18px}.brand small{font-size:10px}.lang select{max-width:120px}.hero-card{padding:20px 14px}.hero-logo{width:min(380px,90vw)}.hero h1{font-size:27px}.hero .cta{flex-direction:column}.hero .cta .btn{width:100%}}
        `;
        document.head.appendChild(style);
      }
    } catch (error) {
      console.warn('RAFIQ UI enhancement skipped:', error);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true }); else apply();

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; apply(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();