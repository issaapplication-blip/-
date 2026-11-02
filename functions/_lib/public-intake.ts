export interface PublicIntakeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" } });
}
/** Same-origin Cloudflare Pages proxy. The service-role key never reaches the browser. */
export async function forwardPublicIntake(request: Request, env: PublicIntakeEnv): Promise<Response> {
  if (request.method !== "POST") return json(405,{ok:false,error:"method_not_allowed"});
  const length=Number(request.headers.get("content-length")||0);
  if(length>18 * 1024 * 1024)return json(413,{ok:false,error:"payload_too_large"});
  const supabaseUrl=(env.SUPABASE_URL||"").trim().replace(/\/+$/,""),anonKey=(env.SUPABASE_ANON_KEY||"").trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)||!anonKey.startsWith("eyJ"))return json(503,{ok:false,error:"public_intake_configuration_unavailable"});
  try{
    const body=await request.arrayBuffer();if(body.byteLength>18 * 1024 * 1024)return json(413,{ok:false,error:"payload_too_large"});
    const contentType=request.headers.get("content-type")||"application/octet-stream";
    const clientIp=request.headers.get("cf-connecting-ip")||"";
    const upstream=await fetch(supabaseUrl+"/functions/v1/public-intake",{method:"POST",headers:{authorization:"Bearer "+anonKey,apikey:anonKey,"content-type":contentType,accept:"application/json",...(clientIp?{"x-rafiq-client-ip":clientIp}:{})},body,signal:AbortSignal.timeout(25000)});
    const payload=await upstream.arrayBuffer();return new Response(payload,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")||"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
  }catch{return json(502,{ok:false,error:"تعذر حفظ الطلب الآن. حاول مرة أخرى."})}
}
