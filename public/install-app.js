/* RAFIQ | رفيق — universal PWA installer */
(function(){
  'use strict';
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
  function hint(key,ar){
    var msg=T(key,ar);
    hints().forEach(function(h){h.textContent=msg;h.hidden=false;});
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
  });

  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('[data-rafiq-install],#installApp'):null;
    if(b)install(e);
  });

  document.addEventListener('rafiq:i18n',function(){if(!installed()&&!deferred)fallback();});

  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
      navigator.serviceWorker.register('/sw.js?v=81',{updateViaCache:'none'}).then(function(reg){
        if(reg&&reg.update)reg.update();
      }).catch(function(){});
    });
  }

  function boot(){
    if(installed()){hide();return;}
    show();
    setTimeout(function(){if(!deferred)fallback();},1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  window.RAFIQ_INSTALL={install:install,show:show,hide:hide,canPrompt:function(){return !!(deferred||window.__RAFIQ_DEFERRED_INSTALL_PROMPT__);},isInstalled:installed};
})();