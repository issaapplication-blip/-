(() => {
  if (window.__RAFIQ_UI_GUARD_V4__) return;
  window.__RAFIQ_UI_GUARD_V4__ = true;

  // The PWA worker is currently retired from the initial page experience.
  // Remove any worker/cache left by older releases so stale UI cannot return.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(reg => reg.unregister())))
        .catch(() => {});
    }
    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.filter(k => /^rafig-v/i.test(k)).map(k => caches.delete(k))))
        .catch(() => {});
    }
  } catch (_) {}

  const fixedIds = ['joinBtn', 'careBtn', 'status-button', 'language'];
  const uniqueLabels = new Set([
    'الانتساب إلى المنصة',
    'طلب رعاية منزلية',
    'WhatsApp — 81',
    'تقديم طلب رعاية',
    'الانتساب كمقدم رعاية',
    'الانتساب كممرض/ة',
    'الانتساب كمعالج فيزيائي',
    'بدء الطلب',
    'فحص النظام'
  ]);

  function cleanDuplicates() {
    // Fixed IDs: keep the first real control only.
    for (const id of fixedIds) {
      const nodes = document.querySelectorAll('#' + id.replace(/([:.])/g, '\\$1'));
      for (let i = 1; i < nodes.length; i++) nodes[i].remove();
    }

    // Exact semantic duplicates: keep the first control with the same label.
    const seen = new Set();
    document.querySelectorAll('button, a.btn').forEach(el => {
      if (!el.isConnected) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!uniqueLabels.has(text)) return;
      const key = el.tagName + '|' + text;
      if (seen.has(key)) el.remove();
      else seen.add(key);
    });

    // Remove every legacy PWA install control. It is intentionally disabled
    // until the main UI is completely stable.
    document.querySelectorAll('#rafig-install-app, .rafig-install-slot').forEach(el => el.remove());
  }

  const start = () => {
    cleanDuplicates();
    // Catch late DOM reinsertion from an older cached runtime without using a MutationObserver.
    let runs = 0;
    const timer = setInterval(() => {
      cleanDuplicates();
      runs++;
      if (runs >= 20) clearInterval(timer);
    }, 250);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();