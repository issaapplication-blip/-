import {test,expect} from '@playwright/test';
const BASE=process.env.BASE_URL||'http://127.0.0.1:8788';
const pages=['/','/services.html','/caregivers.html','/faq.html','/regions.html','/laboratories.html','/radiology.html','/medical-equipment.html','/admin.html'];
for(const p of pages){
 test(`loads ${p}`,async({page})=>{
   const errors:string[]=[]; const missing:string[]=[];
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url())});
   await page.goto(BASE+p,{waitUntil:'domcontentloaded',timeout:30000});
   await expect(page.locator('body')).toBeVisible();
   expect(missing,missing.join('\n')).toEqual([]);
   expect(errors,errors.join('\n')).toEqual([]);
 });
}
test('public directory categories expose no registration forms',async({page})=>{
 for(const p of ['/services.html','/laboratories.html','/radiology.html','/medical-equipment.html']){
  await page.goto(BASE+p);
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/تسجيل|إرسال طلب/})).toHaveCount(0);
 }
});
test('CV and Cover Letter service remains available',async({page})=>{
 await page.goto(BASE+'/caregivers.html');
 await expect(page.getByRole('heading',{name:/CV وCover Letter/})).toBeVisible();
 await expect(page.locator('body')).toContainText('CV + Cover Letter');
 await expect(page.locator('form')).toHaveCount(0);
});
test('official communication links remain available',async({page})=>{
 await page.goto(BASE+'/');
 const hrefs=await page.locator('a').evaluateAll(as=>as.map(a=>(a as HTMLAnchorElement).href));
 expect(hrefs.some(x=>x.includes('t.me/RAFIQ_Care_Bot'))).toBeTruthy();
 expect(hrefs.some(x=>x.includes('t.me/+a7CDblNyGKw1Yjg8'))).toBeTruthy();
 expect(hrefs.some(x=>x.includes('whatsapp.com/channel/0029Vb90gxSC6Zvj6gjLWs1K'))).toBeTruthy();
});
