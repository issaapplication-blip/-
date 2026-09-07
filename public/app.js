(() => {
  const button = document.getElementById("status-button");
  const status = document.getElementById("status");
  if (!button || !status) return;

  button.addEventListener("click", async () => {
    status.textContent = "جارٍ الفحص…";
    button.disabled = true;
    try {
      const response = await fetch("/api/status", {
        headers: { accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("status request failed");
      const data = await response.json();
      status.textContent = data.ok
        ? "النظام يعمل · الإرسال الخارجي متوقف · الموافقة البشرية مطلوبة."
        : "تعذر التحقق.";
    } catch {
      status.textContent = "الخادم غير متاح حاليًا.";
    } finally {
      button.disabled = false;
    }
  });
})();
