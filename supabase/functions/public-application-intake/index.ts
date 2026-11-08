import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async (_req: Request) => new Response(JSON.stringify({ok:false,error:"public_submission_endpoint_retired"}),{status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}));
