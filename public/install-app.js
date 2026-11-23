/* RAFIQ | رفيق — direct PWA installer */
(function(){
  "use strict";
  if(window.__RAFIQ_INSTALL_CONTROLLER_V83__) return;
  window.__RAFIQ_INSTALL_CONTROLLER_V83__=true;
  var deferredPrompt=null;
  var installedMedia=window.matchMedia("(display-mode: standalone)");
  var isIos=/iPad|iPhone|iPod/.test(navigator.userAgent||"")||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

  function installed(){
    try{return installedMedia.matches||navigator.standalone===true||window.matchMedia("(display-mode: fullscreen)").matches;}catch(_){return false;}
  }
  function buttons(){return document.querySelectorAll("[data-rafiq-install],#installApp");}
  function hints(){return document.querySelectorAll("[data-rafiq-install-hint],#installHint");}
  function hide(){
    buttons().forEach(function(b){b.hidden=true;});
    hints().forEach(function(h){h.hidden=true;});
  }
  function ensureHint(){
    var h=document.querySelector("[data-rafiq-install-hint],#installHint");
    if(h)return h;
    h=document.createElement("div");h.id="installHint";h.setAttribute("role","status");h.setAttribute("aria-live","polite");
    h.style.cssText="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100001;width:min(92vw,560px);padding:12px 15px;background:#17372d;color:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.22);text-align:center;font:700 14px/1.7 Arial,Tahoma,sans-serif;direction:rtl";
    document.body.appendChild(h);return h;
  }
  function showHint(text){
    if(installed()){hide();return;}
    var h=ensureHint();h.textContent=text;h.hidden=false;
    hints().forEach(function(x){x.textContent=text;x.hidden=false;});
  }
  function showInstallButton(){
    if(installed()){hide();return;}
    buttons().forEach(function(b){b.hidden=false;});
  }
  function iosInstructions(){
    showInstallButton();
    showHint("على iPhone/iPad: اضغط مشاركة ⬆︎ ثم «إضافة إلى الشاشة الرئيسية» ثم «إضافة».");
  }
  function browserInstructions(){
    showInstallButton();
    showHint("لإضافة رفيق إلى جهازك: افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». إذا لم يظهر الخيار، حدّث الصفحة وافتح الرابط عبر HTTPS في متصفح يدعم PWA.");
  }
  async function install(){
    if(installed()){hide();return;}
    if(deferredPrompt){
      var prompt=deferredPrompt;deferredPrompt=null;
      try{
        await prompt.prompt();
        var choice=await prompt.userChoice;
        if(choice&&choice.outcome==="accepted"){hide();return;}
      }catch(_){}
      if(isIos){iosInstructions();return;}
      browserInstructions();
      return;
    }
    if(isIos){iosInstructions();return;}
    browserInstructions();
  }

  window.addEventListener("beforeinstallprompt",function(e){
    e.preventDefault();
    deferredPrompt=e;
    showInstallButton();
    showHint("التطبيق جاهز للتثبيت. اضغط «تثبيت منصة رفيق» لإضافته مباشرة إلى جهازك.");
  },{passive:false});

  window.addEventListener("appinstalled",function(){
    deferredPrompt=null;
    hide();
    window.dispatchEvent(new CustomEvent("rafig:pwa-installed"));
  });
  try{installedMedia.addEventListener("change",function(){if(installed())hide();});}catch(_){}

  function bind(){
    buttons().forEach(function(b){
      if(b.__rafigBound)return;
      b.__rafigBound=true;
      b.addEventListener("click",function(e){e.preventDefault();install();});
    });
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/sw.js?v=83",{scope:"/",updateViaCache:"none"}).then(function(reg){if(reg&&reg.update)reg.update();}).catch(function(e){console.warn("[RAFIQ PWA] Service Worker registration failed",e);});
  }

  function boot(){
    bind();
    if(installed()){hide();return;}
    if(isIos){iosInstructions();return;}
    /* Keep the action visible even when the browser withholds beforeinstallprompt. */
    showInstallButton();
    if(!deferredPrompt){
      showHint("يمكن تثبيت رفيق كتطبيق ويب. اضغط هنا ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح.");
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();

  window.RAFIQ_INSTALL={install:install,show:showInstallButton,hide:hide,isInstalled:installed,canPrompt:function(){return !!deferredPrompt;}};
})();