(() => {
  const messages = [
    "أهلًا بكم في رفيق… حيث تبدأ الرعاية بالإنسان.",
    "في رفيق، الأمان أول خطوة نحو رعاية مطمئنة.",
    "نصل بالحب والأمان لرعاية العائلة.",
    "كل يوم جديد هو فرصة لرعاية أفضل وأكثر إنسانية.",
    "رفيق يجمع العائلة بالرعاية المناسبة بثقة واهتمام.",
    "لأن راحة من نحب تستحق عناية تليق بهم."
  ];

  const dayNumber = Math.floor(Date.now() / 86400000);
  const message = messages[((dayNumber % messages.length) + messages.length) % messages.length];
  const daily = document.getElementById("daily-welcome");
  const splashDaily = document.getElementById("splash-daily-welcome");
  if (daily) daily.textContent = message;
  if (splashDaily) splashDaily.textContent = message;

  const hideSplash = () => {
    const splash = document.getElementById("rafig-splash");
    if (!splash) return;
    splash.classList.add("is-hidden");
    window.setTimeout(() => splash.remove(), 650);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(hideSplash, 1200), { once: true });
  } else {
    window.setTimeout(hideSplash, 1200);
  }
})();
