/* RAFIQ | رفيق — universal PWA installer */
(function(){
  'use strict';
  if(window.__RAFIQ_INSTALL_CONTROLLER_V82__) return;
  window.__RAFIQ_INSTALL_CONTROLLER_V82__=true;
  var deferred=null;

  function installed(){
    try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(_){return false;}
  }
  function ios(){
    var ua=navigator.userAgent||'';
    return /iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }
  function android(){return /Android/i.test(navigator.userAgent||'');}
  function macSafari(){
    var ua=navigator.userAgent||'';
    return /Macintosh/i.test(ua)&&/Safari/i.test(ua)&&!/Chrome|Chromium|Edg/i.test(ua);
  }
  function T(key,ar){
    try{
      if(window.RAFIQ_I18N&&typeof window.RAFIQ_I18N.translate==='function'){
        var v=window.RAFIQ_I18N.translate(key);if(v)return v;
      }
    }catch(_){}
    return ar;
  }
  function buttons(){return document.querySelectorAll('[data-rafiq-install],#installApp');}
  function hints(){return document.querySelectorAll('[data-rafiq-install-hint],#installHint');}
  function hide(){buttons().forEach(function(b){b.hidden=true;});hints().forEach(function(h){h.hidden=true;});}
  function show(){if(installed()){hide();return;}buttons().forEach(function(b){b.hidden=false;});}
  function ensureHintNode(){
    var h=document.querySelector('[data-rafiq-install-hint],#installHint');
    if(h)return h;
    h=document.createElement('div');
    h.id='rafig-install-hint';
    h.setAttribute('role','status');
    h.setAttribute('aria-live','polite');
    h.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100001;width:min(92vw,560px);padding:12px 15px;background:#17372d;color:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.22);text-align:center;font:700 14px/1.7 Arial,Tahoma,sans-serif;direction:rtl';
    document.body.appendChild(h);
    return h;
  }
  function hint(key,ar){
    var msg=T(key,ar), hs=hints();
    if(hs.length) hs.forEach(function(h){h.textContent=msg;h.hidden=false;});
    else ensureHintNode().textContent=msg;
  }
  function fallback(){
    if(!window.isSecureContext){hint('install.https','التثبيت المباشر يحتاج HTTPS. افتح منصة رفيق من الرابط الرسمي الآمن.');return;}
    if(ios()){hint('reason.ios','على iPhone/iPad: اضغط مشاركة ⬆︎ ثم «إضافة إلى الشاشة الرئيسية» ثم «إضافة».');return;}
    if(macSafari()){hint('install.steps.desktop','على Safari في Mac: من القائمة «File» اختر «Add to Dock».');return;}
    if(android()){hint('install.steps.android','إذا لم تظهر نافذة التثبيت، افتح قائمة ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».');return;}
    hint('install.steps.desktop','في Chrome أو Edge: اضغط أيقونة التثبيت ⊕ في شريط العنوان ثم «تثبيت».');
  }
  function install(event){
    if(event){event.preventDefault();event.stopPropagation();}
    var p=deferred||window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;
    if(!p){fallback();return;}
    deferred=null;window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;
    try{
      p.prompt();
      p.userChoice.then(function(choice){
        if(choice&&choice.outcome==='accepted')hide();
        else fallback();
      }).catch(fallback);
    }catch(_){fallback();}
  }

  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferred=e;
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=e;
    show();
    hint('install.ready','اضغط «تثبيت تطبيق رفيق» الآن لإضافته إلى جهازك.');
  },{passive:false});

  window.addEventListener('appinstalled',function(){
    deferred=null;window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;hide();
    window.dispatchEvent(new CustomEvent('rafig:pwa-installed'));
  });

  function bindInstallButtons(){
    buttons().forEach(function(b){
      if(b.__rafigInstallBound)return;
      b.__rafigInstallBound=true;
      b.addEventListener('click',install);
    });
  }
  bindInstallButtons();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bindInstallButtons,{once:true});
  }

  document.addEventListener('rafiq:i18n',function(){if(!installed()&&!deferred)fallback();});

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js?v=82',{scope:'/',updateViaCache:'none'}).then(function(reg){
      if(reg&&reg.update)reg.update();
    }).catch(function(err){
      console.warn('[RAFIQ PWA] Service Worker registration failed',err);
    });
  }

  function boot(){
    if(installed()){hide();return;}
    show();
    setTimeout(function(){
      if(!deferred && !installed()){
        var h=ensureHintNode();
        h.textContent=T('install.wait','زر التثبيت جاهز. إذا لم تظهر نافذة النظام، فهذا المتصفح لا يتيح التثبيت المباشر لهذه الصفحة حالياً.');
        h.hidden=false;
      }
    },8000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){bindInstallButtons();boot();},{once:true});else boot();

  window.RAFIQ_INSTALL={install:install,show:show,hide:hide,canPrompt:function(){return !!(deferred||window.__RAFIQ_DEFERRED_INSTALL_PROMPT__);},isInstalled:installed};
})();