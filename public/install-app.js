/* RAFIQ | رفيق — stable PWA installer v76 */
(function(){
  'use strict';
  var SW_VERSION='76';
  var deferredPrompt=null;

  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone===true;
  }

  function showButtons(){
    if(isStandalone()) return;
    document.querySelectorAll('[data-rafiq-install]').forEach(function(button){
      button.hidden=false;
      button.style.display='';
      button.removeAttribute('aria-hidden');
    });
  }

  function hideButtons(){
    document.querySelectorAll('[data-rafiq-install]').forEach(function(button){
      button.hidden=true;
      button.setAttribute('aria-hidden','true');
    });
  }

  function showStatus(message){
    var node=document.getElementById('rafig-install-status');
    if(!node){
      node=document.createElement('div');
      node.id='rafig-install-status';
      node.setAttribute('role','status');
      node.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100001;width:min(92vw,560px);padding:12px 15px;background:#17372d;color:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.22);text-align:center;font:700 14px/1.7 Arial,Tahoma,sans-serif;direction:rtl';
      document.body.appendChild(node);
    }
    node.textContent=message;
    clearTimeout(window.__RAFIQ_INSTALL_STATUS_TIMER__);
    window.__RAFIQ_INSTALL_STATUS_TIMER__=setTimeout(function(){if(node.isConnected)node.remove()},5000);
  }

  if(isStandalone()){hideButtons();return;}

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js?v='+SW_VERSION,{scope:'/',updateViaCache:'none'}).catch(function(error){
      console.warn('RAFIQ service worker registration failed',error);
    });
  }

  window.addEventListener('beforeinstallprompt',function(event){
    event.preventDefault();
    deferredPrompt=event;
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=event;
    showButtons();
  });

  window.addEventListener('appinstalled',function(){
    deferredPrompt=null;
    window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;
    hideButtons();
    showStatus('تم تثبيت تطبيق رفيق بنجاح ✅');
  });

  function bind(button){
    if(button.dataset.rafigInstallBound==='1')return;
    button.dataset.rafigInstallBound='1';
    button.addEventListener('click',async function(event){
      event.preventDefault();
      event.stopPropagation();
      var prompt=deferredPrompt||window.__RAFIQ_DEFERRED_INSTALL_PROMPT__;
      if(!prompt){
        showStatus('زر التثبيت جاهز. ينتظر المتصفح تفعيل نافذة التثبيت المباشر.');
        return;
      }
      try{
        button.disabled=true;
        await prompt.prompt();
        var choice=await prompt.userChoice;
        deferredPrompt=null;
        window.__RAFIQ_DEFERRED_INSTALL_PROMPT__=null;
        if(choice&&choice.outcome==='accepted'){
          hideButtons();
        }else{
          showStatus('أُغلقت نافذة التثبيت. اضغط «تثبيت تطبيق رفيق» للمحاولة مجددًا.');
        }
      }catch(error){
        console.warn('RAFIQ install prompt error',error);
        showStatus('تعذر فتح نافذة التثبيت المباشر على هذا المتصفح حاليًا.');
      }finally{
        button.disabled=false;
      }
    });
  }

  function init(){
    showButtons();
    document.querySelectorAll('[data-rafiq-install]').forEach(bind);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();