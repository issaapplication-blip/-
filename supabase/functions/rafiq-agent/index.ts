Deno.serve(async (_req: Request) => new Response(
  JSON.stringify({ok:false,error:"Legacy RAFIQ intake agent is retired. Use the existing Telegram directory bot for approved service information."}),
  {status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}}
));
