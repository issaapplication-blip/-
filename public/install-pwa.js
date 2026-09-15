(() => {
  if (window.__RAFIQ_UI_GUARD_V7__) return;
  window.__RAFIQ_UI_GUARD_V7__ = true;

  const INTAKE_URL = 'https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/public-application-intake';

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
    'الانتساب إلى المنصة','طلب رعاية منزلية','WhatsApp — 81','تقديم طلب رعاية',
    'الانتساب كمقدم رعاية','الانتساب كممرض/ة','الانتساب كمعالج فيزيائي','بدء الطلب','تثبيت تطبيق رفيق'
  ]);

  function cleanDuplicates() {
    for (const id of fixedIds) {
      const nodes = document.querySelectorAll('#' + id.replace(/([:.])/g, '\\$1'));
      for (let i = 1; i < nodes.length; i++) nodes[i].remove();
    }
    document.querySelectorAll('.status').forEach(el => el.remove());
    const seen = new Set();
    document.querySelectorAll('button, a.btn').forEach(el => {
      if (!el.isConnected) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!uniqueLabels.has(text)) return;
      const key = el.tagName + '|' + text;
      if (seen.has(key)) el.remove(); else seen.add(key);
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
    button.id = 'rafig-install-app'; button.type = 'button'; button.className = 'btn outline rafig-install-app';
    button.textContent = 'تثبيت تطبيق رفيق';
    button.style.cssText = 'min-height:46px;padding:11px 17px;border-radius:13px;font-weight:900;cursor:pointer';
    button.addEventListener('click', async () => {
      const prompt = window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;
      if (!prompt) return;
      try { await prompt.prompt(); await prompt.userChoice; } catch (_) {}
      window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = null; slot.remove();
    });
    slot.appendChild(button); cta.insertAdjacentElement('afterend', slot);
  }

  function showIntakeResult(form, ok, application) {
    let box = form.parentElement?.querySelector('.success');
    if (!box) { box = document.createElement('div'); box.className = 'success'; form.insertAdjacentElement('afterend', box); }
    box.classList.add('show');
    if (ok) {
      box.innerHTML = `<strong>تم استلام طلبك بنجاح.</strong><br>رقم طلبك: <strong>${application.application_number}</strong><br>الحالة: قيد المراجعة.<br><small>احتفظ برقم الطلب. سيقوم فريق رفيق بمراجعة المعلومات والتواصل معك عند الحاجة.</small>`;
      form.reset();
    } else {
      box.innerHTML = '<strong>تعذر حفظ الطلب حالياً.</strong><br>لم يتم فقدان معلوماتك. يرجى المحاولة مرة أخرى بعد لحظات.';
    }
  }

  function installApplicationPersistence() {
    document.querySelectorAll('.app-form').forEach(form => {
      if (form.dataset.rafigIntakeBound === '1') return;
      // Remove the old WhatsApp-only submit listener by replacing the form node.
      const cleanForm = form.cloneNode(true);
      form.replaceWith(cleanForm);
      cleanForm.dataset.rafigIntakeBound = '1';
      cleanForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = cleanForm.querySelector('button[type="submit"]');
        if (submit) { submit.disabled = true; submit.textContent = 'جارٍ حفظ الطلب…'; }
        const payload = {};
        for (const [key, value] of new FormData(cleanForm).entries()) {
          if (typeof value === 'string' && value.trim()) payload[key] = value.trim();
        }
        try {
          const response = await fetch(INTAKE_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_type: cleanForm.dataset.type, payload, website: '' })
          });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || 'intake_failed');
          showIntakeResult(cleanForm, true, result.application);
        } catch (_) {
          showIntakeResult(cleanForm, false, {});
        } finally {
          if (submit) { submit.disabled = false; submit.textContent = 'إرسال الطلب إلى RAFIQ'; }
        }
      });
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = event; ensureInstallButton();
  }, { once: true });
  window.addEventListener('appinstalled', () => {
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__ = null;
    document.querySelectorAll('#rafig-install-app, .rafig-install-slot').forEach(el => el.remove());
  });

  const start = () => {
    cleanDuplicates(); installApplicationPersistence(); ensureInstallButton();
    let runs = 0;
    const timer = setInterval(() => {
      cleanDuplicates(); installApplicationPersistence(); ensureInstallButton();
      runs++; if (runs >= 20) clearInterval(timer);
    }, 250);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
