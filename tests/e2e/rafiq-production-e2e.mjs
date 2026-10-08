import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'https://rafiq-o6qd.onrender.com';
const marker='TEST-RAFIQ-E2E-'+Date.now();
const checks=[];
async function get(path){const r=await fetch(BASE+path); checks.push({path,status:r.status}); assert.ok(r.status<500,`${path} returned ${r.status}`); return r}
await get('/'); await get('/app.html'); await get('/services.html'); await get('/admin.html');
const html=await (await fetch(BASE+'/app.html')).text();
assert.match(html,/form|تقديم|طلب/i);
const api=await fetch(BASE+'/api/status',{headers:{accept:'application/json'}});
assert.ok(api.status<500);
console.log(JSON.stringify({marker,checks,api_status:api.status,note:'No destructive production mutation was performed by this smoke E2E. A real TEST submission requires authenticated browser/form upload and is intentionally separated from this read-only gate.'},null,2));
