Deno.serve(async (_req: Request) => new Response(
  JSON.stringify({ok:false,error:"WhatsApp automation is retired. RAFIQ WhatsApp is used manually through the existing app and channel."}),
  {status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}
));
