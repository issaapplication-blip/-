(() => {
  if (window.__RAFIQ_UI_GUARD_V6__) return;
  window.__RAFIQ_UI_GUARD_V6__ = true;

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(reg => reg.unregister()))).catch(() => {});
    }
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.filter(k => /^rafig-v/i.test(k)).map(k => caches.delete(k)))).catch(() => {});
    }
  } catch (_) {}

  const fixedIds = ['joinBtn', 'careBtn', 'status-button', 'language', 'rafig-install-app'];
  const uniqueLabels = new Set([
    'الانتساب إلى المنصة',
    'طلب رعاية منزلية',
    'WhatsApp — 81',
    'تقديم طلب رعاية',
    'الانتساب كمقدم رعاية',
    'الانتساب كممرض/ة',
    'الانتساب كمعالج فيزيائي',
    'بدء الطلب',
    'تثبيت تطبيق رفيق'
  ]);

  function cleanDuplicates() {
    for (const id of fixedIds) {
      const nodes = document.querySelectorAll('#' + id.replace(/([:.])/g, '\\$1'));
      for (let i = 1; i < nodes.length; i++) nodes[i].remove();
    }

    // Internal diagnostic control is not a public CTA; remove the redundant status card.
    document.querySelectorAll('.status').forEach(el => el.remove());

    const seen = new Set();
    document.querySelectorAll('button, a.btn').forEach(el => {
      if (!el.isConnected) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!uniqueLabels.has(text)) return;
      const key = el.tagName + '|' + text;
      if (seen.has(key)) el.remove();
      else seen.add(key);
    });
  }

  function ensureInstallButton() {
    if (!window.__RAFIQ_DEFERRED_INSTALL_PROMPT__) return;
    if (document.getElementById('rafig-install-app')) return;
    const cta = document.querySelector('.cta');
    if (!cta) return;

    const slot = document.createElement('div');
    slot.className = 'rafig-install-slot';
    slot.style.cssText = 'display:flex;justify-content:center;margin:12px 0 2px;width:100%';

    const button = document.createElement('button');
    button.id = 'rafig-install-app';
    button.type = 'button';
    button.className = 'btn outline rafig-install-app';
    button.textContent = 'تثبيت تطبيق رفيق';
    button.style.cssText = 'min-height:46px;padding:11px 17px;border-radius:13px;font-weight:900;cursor:pointer';

    button.addEventListener('click', async () => {
      const prompt = window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;
      if (!prompt) return;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (_) {}
      window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = null;
      slot.remove();
    });

    slot.appendChild(button);
    cta.insertAdjacentElement('afterend', slot);
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = event;
    ensureInstallButton();
  }, { once: true });

  window.addEventListener('appinstalled', () => {
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = null;
    document.querySelectorAll('#rafig-install-app, .rafig-install-slot').forEach(el => el.remove());
  });

  const start = () => {
    cleanDuplicates();
    ensureInstallButton();
    let runs = 0;
    const timer = setInterval(() => {
      cleanDuplicates();
      ensureInstallButton();
      runs++;
      if (runs >= 12) clearInterval(timer);
    }, 250);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
