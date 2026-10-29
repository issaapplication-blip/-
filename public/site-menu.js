/* RAFIQ | رفيق — shared navigation for static public pages */
(function () {
  "use strict";
  if (window.__RAFIQ_SITE_MENU_V1__) return;
  window.__RAFIQ_SITE_MENU_V1__ = true;

  var links = [
    ["/", "الرئيسية"], ["/services.html", "الخدمات"],
    ["/app.html", "طلب رعاية أو انتساب"], ["/elderly-care.html", "رعاية كبار السن"],
    ["/home-nursing.html", "التمريض المنزلي"], ["/physiotherapy.html", "العلاج الفيزيائي"],
    ["/laboratories.html", "المختبرات"], ["/radiology.html", "التصوير الطبي"],
    ["/medical-equipment.html", "المعدات الطبية"], ["/caregivers.html", "مقدمو الرعاية"],
    ["/guide.html", "دليل الرعاية"], ["/faq.html", "الأسئلة الشائعة"],
    ["/regions.html", "المناطق"], ["/agent.html", "مساعد رفيق"],
    ["/privacy.html", "سياسة الخصوصية"], ["/terms.html", "الشروط والأحكام"],
    ["/consent.html", "سياسة الموافقة"]
  ];

  function makeMenu() {
    var topbar = document.querySelector(".topbar");
    if (!topbar) {
      topbar = document.createElement("header");
      topbar.className = "topbar rafiq-global-topbar";
      topbar.setAttribute("aria-label", "شريط RAFIQ الرئيسي");
      var main = document.querySelector("main");
      if (main && main.parentNode) main.parentNode.insertBefore(topbar, main);
      else document.body.insertBefore(topbar, document.body.firstChild);
    }
    var menu = topbar.querySelector(".topbar-menu");
    if (!menu) {
      menu = document.createElement("details");
      menu.className = "menu topbar-menu";
      var summary = document.createElement("summary");
      summary.textContent = "⋮";
      summary.setAttribute("aria-label", "فتح قائمة الموقع");
      summary.setAttribute("aria-expanded", "false");
      var panel = document.createElement("nav");
      panel.className = "menu-panel";
      panel.setAttribute("aria-label", "روابط الموقع");
      menu.appendChild(summary);
      menu.appendChild(panel);
      topbar.appendChild(menu);
    }
    var panel = menu.querySelector(".menu-panel") || menu;
    links.forEach(function (item) {
      if (panel.querySelector('a[href="' + item[0] + '"]')) return;
      var a = document.createElement("a");
      a.href = item[0];
      a.textContent = item[1];
      panel.appendChild(a);
    });

    var style = document.getElementById("rafig-global-menu-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "rafig-global-menu-style";
      style.textContent = ".rafig-global-topbar{display:flex;align-items:center;min-height:58px;padding:7px 12px;margin:8px auto;max-width:1180px;position:relative;z-index:1000;direction:rtl}.topbar .topbar-menu{margin-right:0!important;margin-left:auto!important;position:relative}.topbar .topbar-menu>summary{display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;cursor:pointer;list-style:none;border-radius:12px;background:#eef7f3;color:#087f58;font:900 24px Arial,sans-serif}.topbar .topbar-menu>summary::-webkit-details-marker{display:none}.topbar .topbar-menu .menu-panel{position:absolute;top:48px;right:0!important;left:auto!important;width:min(300px,84vw);max-height:min(70vh,560px);overflow:auto;background:#fff;border:1px solid #dbe9e2;border-radius:16px;padding:10px;box-shadow:0 18px 45px rgba(0,0,0,.15);z-index:1001}.topbar .topbar-menu .menu-panel a{display:block;padding:11px 12px;min-height:44px;border-radius:10px;color:#17372d;text-decoration:none;font-weight:800}.topbar .topbar-menu .menu-panel a:hover,.topbar .topbar-menu .menu-panel a:focus-visible{background:#eef7f3;color:#087f58;outline-offset:2px}.rafig-legal-links{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 16px;padding:10px 0}.rafig-legal-links a{display:inline-flex;align-items:center;min-height:44px;color:#087f58;font-weight:700}.rafig-consent{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin:12px 0;padding:10px;border:1px solid #dbe9e2;border-radius:12px;line-height:1.7;font-size:14px}.rafig-consent input[type=checkbox]{width:20px;height:20px;min-width:20px;margin-top:4px}.rafig-consent a{color:#087f58;font-weight:800;text-decoration:underline}button,[role=button],input[type=button],input[type=submit],summary{min-height:44px}.topbar .ra-lang .ra-lang-btn{min-height:44px!important;min-width:44px}.topbar .ra-lang-menu button{min-height:44px!important}.topbar .ra-lang{margin-right:auto}";
      document.head.appendChild(style);
    }

    var summary = menu.querySelector("summary");
    if (summary && !summary.dataset.rafigMenuBound) {
      summary.dataset.rafigMenuBound = "1";
      menu.addEventListener("toggle", function () {
        summary.setAttribute("aria-expanded", menu.open ? "true" : "false");
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        if (summary) summary.focus();
      }
    });
    document.addEventListener("click", function (event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("click", function (event) {
      var a = event.target && event.target.closest ? event.target.closest(".menu-panel a") : null;
      if (a) menu.open = false;
    });

    // Public request forms must collect explicit consent before submission.
    document.querySelectorAll("form").forEach(function (form) {
      if (form.querySelector('input[type="password"]') || form.matches('[role="search"],[data-no-consent]')) return;
      var requestForm = form.id === "form" || form.action.indexOf("/api/public/intake") >= 0 ||
        form.querySelector('input[name="first_name"],input[name="family_name"],input[name="patient_name"],input[name="institution_name"],input[name="institution_type"],input[name="application_type"],input[name="cv"],input[name="profile_photo"],input[name="service_type"],input[name="service_key"]');
      if (!requestForm) return;

      var input = form.querySelector('input[name="privacy_consent"]') || form.querySelector("#consent");
      var label = input && input.id ? form.querySelector('label[for="' + input.id + '"]') : null;
      if (!input) {
        input = document.createElement("input");
        input.type = "checkbox";
        input.name = "privacy_consent";
        input.value = "accepted";
        input.required = true;
        label = document.createElement("label");
        label.className = "rafig-consent";
        label.appendChild(input);
        label.appendChild(document.createTextNode(" أوافق على معالجة بياناتي لمراجعة الطلب والتواصل بشأنه وفق "));
        var privacy = document.createElement("a");
        privacy.href = "/privacy.html";
        privacy.textContent = "سياسة الخصوصية";
        label.appendChild(privacy);
        label.appendChild(document.createTextNode(" و"));
        var terms = document.createElement("a");
        terms.href = "/terms.html";
        terms.textContent = "الشروط والأحكام";
        label.appendChild(terms);
        var consent = document.createElement("a");
        consent.href = "/consent.html";
        consent.textContent = " (سياسة الموافقة)";
        label.appendChild(consent);
        var submit = form.querySelector('button[type="submit"],input[type="submit"]');
        if (submit && submit.parentNode) submit.parentNode.insertBefore(label, submit);
        else form.appendChild(label);
      } else if (!label) {
        label = document.createElement("label");
        label.className = "rafig-consent";
        label.htmlFor = input.id;
        label.appendChild(document.createTextNode(" أوافق على معالجة بياناتي وفق "));
        var privacyLink = document.createElement("a");
        privacyLink.href = "/privacy.html";
        privacyLink.textContent = "سياسة الخصوصية";
        label.appendChild(privacyLink);
        label.appendChild(document.createTextNode(" و"));
        var termsLink = document.createElement("a");
        termsLink.href = "/terms.html";
        termsLink.textContent = "الشروط والأحكام";
        label.appendChild(termsLink);
        var submitBefore = form.querySelector('button[type="submit"],input[type="submit"]');
        if (submitBefore && submitBefore.parentNode) submitBefore.parentNode.insertBefore(label, submitBefore);
        else form.appendChild(label);
      } else {
        if (!label.querySelector('a[href="/privacy.html"]')) {
          label.appendChild(document.createTextNode(" — اقرأ "));
          var p = document.createElement("a");
          p.href = "/privacy.html";
          p.textContent = "سياسة الخصوصية";
          label.appendChild(p);
          label.appendChild(document.createTextNode(" و"));
          var t = document.createElement("a");
          t.href = "/terms.html";
          t.textContent = "الشروط والأحكام";
          label.appendChild(t);
        }
      }
      input.name = "privacy_consent";
      input.value = "accepted";
      input.required = true;
    });

    var footer = document.querySelector("footer,.footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "footer";
      document.body.appendChild(footer);
    }
    if (!footer.querySelector(".rafig-legal-links")) {
      var legal = document.createElement("nav");
      legal.className = "rafig-legal-links";
      legal.setAttribute("aria-label", "السياسات القانونية");
      links.slice(-3).forEach(function (item) {
        var a = document.createElement("a");
        a.href = item[0];
        a.textContent = item[1];
        legal.appendChild(a);
      });
      footer.appendChild(legal);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", makeMenu, { once: true });
  else makeMenu();
})();