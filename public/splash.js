(() => {
  const messages = [
    "أهلًا بكم في وِصال… حيث تبدأ الرعاية بالإنسان.",
    "في وِصال، الأمان أول خطوة نحو رعاية مطمئنة.",
    "نصل بالحب والأمان لرعاية العائلة.",
    "كل يوم جديد هو فرصة لرعاية أفضل وأكثر إنسانية.",
    "وِصال يجمع العائلة بالرعاية المناسبة بثقة واهتمام.",
    "لأن راحة من نحب تستحق عناية تليق بهم."
  ];

  const dayNumber = Math.floor(Date.now() / 86400000);
  const message = messages[((dayNumber % messages.length) + messages.length) % messages.length];
  const el = document.getElementById("daily-welcome");
  if (el) el.textContent = message;

  window.setTimeout(() => {
    const splash = document.getElementById("wisal-splash");
    const app = document.getElementById("wisal-app");
    if (!splash || !app) return;
    splash.classList.add("is-hidden");
    app.removeAttribute("aria-hidden");
    window.setTimeout(() => splash.remove(), 650);
  }, 1800);
})();
