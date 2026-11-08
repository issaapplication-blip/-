interface Context { request: Request; }
export const onRequestPost = (_context: Context) => new Response(
  JSON.stringify({ok:false,error:"This legacy Telegram webhook route is retired. The existing Supabase Telegram webhook is unchanged."}),
  {status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}
);
