import {test,expect,devices} from '@playwright/test';
const BASE=process.env.BASE_URL||'https://rafiq-o6qd.onrender.com';
const pages=['/','/app.html','/services.html','/caregivers.html','/guide.html','/nurses.html','/physiotherapists.html','/families.html','/laboratories.html','/radiology.html','/medical-equipment.html','/admin.html'];
for(const p of pages){
 test(`loads ${p}`,async({page})=>{
   const errors:string[]=[]; const missing:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); page.on('pageerror',e=>errors.push(e.message)); page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url())});
   await page.goto(BASE+p,{waitUntil:'domcontentloaded',timeout:30000});
   await expect(page.locator('body')).toBeVisible();
   expect(missing,missing.join('\n')).toEqual([]); expect(errors,errors.join('\n')).toEqual([]);
 });
}
test('registration category links expose expected forms',async({page})=>{
 await page.goto(BASE+'/app.html'); await expect(page.locator('body')).toBeVisible();
 for(const role of ['caregiver','nurse','physiotherapist','family']){
   const link=page.locator(`a[href*="role=${role}"]`).first(); if(await link.count()) {await link.click(); await expect(page.locator('form')).toBeVisible();}
 }
});
test('institution registration forms',async({page})=>{
 for(const p of ['/laboratories.html','/radiology.html','/medical-equipment.html']){
  await page.goto(BASE+p); await expect(page.locator('form[data-institution-form]')).toBeVisible();
  await expect(page.getByRole('button',{name:/إرسال طلب التسجيل/})).toBeVisible();
 }
});
test('official communication links',async({page})=>{
 await page.goto(BASE+'/'); const hrefs=await page.locator('a').evaluateAll(as=>as.map(a=>(a as HTMLAnchorElement).href));
 expect(hrefs.some(x=>x.includes('t.me/RAFIQ_Care_Bot'))).toBeTruthy();
 expect(hrefs.some(x=>x.includes('whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K'))).toBeTruthy();
});
