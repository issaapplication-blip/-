/* RAFIQ | رفيق — cross-platform PWA installer */
(function(){
  "use strict";
  if(window.__RAFIQ_INSTALL_CONTROLLER_V93__) return;
  window.__RAFIQ_INSTALL_CONTROLLER_V93__=true;

  var deferredPrompt=null;
  var installedMedia=window.matchMedia("(display-mode: standalone)");
  var isIos=/iPhone|iPad|iPod/.test(navigator.userAgent||"")||
    (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

  function installed(){
    try{
      return installedMedia.matches||
        navigator.standalone===true||
        window.matchMedia("(display-mode: fullscreen)").matches;
    }catch(_){return false;}
  }
  function buttons(){return document.querySelectorAll("[data-rafiq-install],#installApp");}
  function hints(){return document.querySelectorAll("[data-rafiq-install-hint],#installHint");}
  function hide(){
    buttons().forEach(function(b){b.hidden=true;b.setAttribute("aria-hidden","true");});
    hints().forEach(function(h){h.hidden=true;});
  }
  function showButton(){
    if(installed()){hide();return;}
    buttons().forEach(function(b){b.hidden=false;b.setAttribute("aria-hidden","false");});
  }
  function hint(message){
    if(installed()){hide();return;}
    var h=document.querySelector("[data-rafiq-install-hint],#installHint");
    if(!h){
      h=document.createElement("p");
      h.id="installHint";
      h.className="small install-hint";
      h.setAttribute("role","status");
      h.setAttribute("aria-live","polite");
      (document.querySelector(".hero .actions")||document.body).insertAdjacentElement("afterend",h);
    }
    h.textContent=message;
    h.hidden=false;
  }
  function iosHelp(){
    showButton();
    hint("لتثبيت رفيق على iPhone أو iPad: اضغط زر المشاركة ⬆︎ في Safari، اختر «إضافة إلى الشاشة الرئيسية»، ثم اضغط «إضافة».");
  }
  function browserHelp(){
    showButton();
    hint("التثبيت غير متاح كنافذة تلقائية في هذا المتصفح. افتح قائمة المتصفح ⋮ أو مشاركة، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».");
  }
  async function install(){
    if(installed()){hide();return;}
    if(deferredPrompt){
      var prompt=deferredPrompt;
      deferredPrompt=null;
      try{
        await prompt.prompt();
        var choice=await prompt.userChoice;
        if(choice&&choice.outcome==="accepted"){hide();return;}
        hint("لم يتم التثبيت بعد. يمكنك الضغط على «تثبيت» والمحاولة مجدداً.");
        return;
      }catch(_){
        browserHelp();
        return;
      }
    }
    if(isIos){iosHelp();return;}
    browserHelp();
  }

  window.addEventListener("beforeinstallprompt",function(event){
    event.preventDefault();
    deferredPrompt=event;
    showButton();
    hint("رفيق جاهز للتثبيت على جهازك. اضغط «تثبيت تطبيق رفيق» للمتابعة.");
  });

  window.addEventListener("appinstalled",function(){
    deferredPrompt=null;
    hide();
    window.dispatchEvent(new CustomEvent("rafig:pwa-installed"));
  });

  try{
    installedMedia.addEventListener("change",function(){if(installed())hide();else showButton();});
  }catch(_){}

  function bind(){
    buttons().forEach(function(button){
      if(button.__rafigBound)return;
      button.__rafigBound=true;
      button.addEventListener("click",function(event){
        event.preventDefault();
        install();
      });
    });
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/sw.js?v=93",{scope:"/",updateViaCache:"none"})
      .then(function(reg){if(reg&&reg.update)reg.update();})
      .catch(function(error){console.warn("[RAFIQ PWA] Service Worker registration failed",error);});
  }

  function boot(){
    bind();
    if(installed()){hide();return;}
    /* Keep the install action available on every mobile browser.
       Chromium's native prompt is used when available; iOS and other browsers get instructions. */
    showButton();
    if(isIos)iosHelp();
    else if(!deferredPrompt)hint("يمكن تثبيت رفيق من قائمة المتصفح إذا لم تظهر نافذة التثبيت تلقائياً.");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  window.RAFIQ_INSTALL={
    install:install,
    show:showButton,
    hide:hide,
    isInstalled:installed,
    canPrompt:function(){return !!deferredPrompt;}
  };
})();