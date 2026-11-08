interface Context { request: Request; }
const retired = () => new Response(JSON.stringify({ok:false,error:"public_application_intake_retired"}),{status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const onRequestPost = (_context: Context) => retired();
export const onRequestOptions = () => new Response(null,{status:204,headers:{"cache-control":"no-store"}});
