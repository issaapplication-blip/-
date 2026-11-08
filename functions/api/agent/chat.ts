interface Context { request: Request; }
export const onRequestOptions = () => new Response(null,{status:204,headers:{"cache-control":"no-store"}});
export const onRequestPost = (_context: Context) => new Response(
  JSON.stringify({ok:false,error:"Legacy web intake assistant is retired. Use the approved RAFIQ directory pages and existing Telegram bot."}),
  {status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}
);
