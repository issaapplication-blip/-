(() => {
  "use strict";
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_FILES = 8;
  const ALLOWED = new Map([[".pdf","application/pdf"],[".jpg","image/jpeg"],[".jpeg","image/jpeg"],[".png","image/png"]]);
  const errorText = (value) => ({
    unsupported_file_type: "نوع الملف غير مسموح. ارفع PDF أو JPG أو PNG فقط.",
    file_too_large: "حجم الملف يتجاوز 8 ميغابايت.",
    too_many_files: "يمكن إرفاق 8 ملفات كحد أقصى."
  }[value] || value || "تعذر إرسال الطلب. حاول مرة أخرى.");
  function showMessage(target,message,success){
    if(!target)return;
    target.hidden=false;
    target.className=success?"form-message success":"form-message error";
    target.textContent=message;
    target.setAttribute("role",success?"status":"alert");
  }
  function validateFiles(form){
    const inputs=Array.from(form.querySelectorAll('input[type="file"][data-document-category]'));
    const selected=[];
    for(const input of inputs){
      for(const file of Array.from(input.files||[])){
        const dot=file.name.lastIndexOf(".");
        const ext=dot>=0?file.name.slice(dot).toLowerCase():"";
        const expected=ALLOWED.get(ext);
        if(!expected||file.type!==expected)return{error:"نوع الملف غير مسموح. ارفع PDF أو JPG أو PNG فقط."};
        if(file.size<=0||file.size>MAX_FILE_BYTES)return{error:"حجم الملف يجب أن يكون أكبر من صفر وألا يتجاوز 8 ميغابايت."};
        selected.push({file,category:input.dataset.documentCategory});
      }
    }
    if(selected.length>MAX_FILES)return{error:"يمكن إرفاق 8 ملفات كحد أقصى."};
    const required=(form.dataset.requiredDocuments||"").split(",").map(x=>x.trim()).filter(Boolean);
    for(const category of required)if(!selected.some(x=>x.category===category))return{error:"يرجى إرفاق جميع الوثائق المطلوبة قبل الإرسال."};
    return{selected};
  }
  async function submitForm(form){
    const message=form.querySelector("[data-form-message]");
    const button=form.querySelector('button[type="submit"]');
    const trap=form.querySelector('input[name="website"]');
    if(trap&&trap.value.trim()){showMessage(message,"تم استلام الطلب.",true);return;}
    if(!form.reportValidity())return;
    const checked=validateFiles(form);
    if(checked.error){showMessage(message,checked.error,false);return;}
    const data=new FormData(form);
    for(const input of Array.from(form.querySelectorAll('input[type="file"][data-document-category]')))data.delete(input.name);
    for(const item of checked.selected){data.append("files",item.file,item.file.name);data.append("document_category",item.category);}
    data.set("website","");
    if(form.dataset.role)data.set("role",form.dataset.role);
    button.disabled=true;button.setAttribute("aria-busy","true");
    showMessage(message,"جارٍ إرسال طلبك إلى إدارة RAFIQ للمراجعة…",true);
    try{
      const response=await fetch("/api/public/intake",{method:"POST",headers:{Accept:"application/json"},body:data,credentials:"same-origin"});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result||result.ok!==true)throw new Error(errorText(result?.error));
      const requestId=result.request_id||(result.application_number?"RAFIQ-REQ-"+String(result.application_number).padStart(6,"0"):"");
      const confirmation=requestId?"تم استلام طلبك بنجاح. رقم الطلب: "+requestId+". سنراجع البيانات ونتواصل معك عند الحاجة.":"تم استلام طلبك بنجاح. سنراجع البيانات ونتواصل معك عند الحاجة.";
      showMessage(message,confirmation,true);form.reset();
      form.querySelectorAll("[data-file-name]").forEach(node=>{node.textContent="";});
    }catch(error){showMessage(message,errorText(error?.message),false);}
    finally{button.disabled=false;button.removeAttribute("aria-busy");}
  }
  document.addEventListener("change",event=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement)||input.type!=="file")return;
    const output=input.closest("label")?.querySelector("[data-file-name]");
    if(output)output.textContent=Array.from(input.files||[]).map(file=>file.name).join("، ");
  });
  document.addEventListener("submit",event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||!form.matches("[data-rafig-intake-form]"))return;
    event.preventDefault();submitForm(form);
  });
})();