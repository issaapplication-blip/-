import { telegramConfigured, telegramSendPhoto, telegramSendText } from "./telegram";
import { RAFIQ_CONFIG, withRafiqFooter, validateRafiqLinks } from "./rafiq-config";

export type MessageUser = {
  phone?: string | null;
  telegramChatId?: string | number | null;
  telegramUserId?: string | number | null;
  telegramUsername?: string | null;
  intakeId?: string | null;
  applicationId?: string | null;
};
export type MessageMedia = { qrUrl?: string | null; caption?: string | null };
type Db = { rest: (path:string, init?:RequestInit) => Promise<{response:Response;body:any}> };
const normalizePhone=(value:string|null|undefined)=>String(value??"").replace(/\\D/g,"");

const logAttempt=async(db:Db,input:{
  intakeId?:string|null; applicationId?:string|null; phone?:string|null; telegramChatId?:string|null;
  eventType?:string|null; channel:string; status:"success"|"failed"; providerMessageId?:string|null; error?:string|null;
})=>{
  await db.rest("/rest/v1/message_delivery_attempts",{
    method:"POST",headers:{"Prefer":"return=minimal"},
    body:JSON.stringify({
      intake_id:input.intakeId??null,application_id:input.applicationId??null,
      recipient_phone:input.phone??null,telegram_chat_id:input.telegramChatId??null,
      event_type:input.eventType??"admin_event",channel:input.channel,status:input.status,
      provider_message_id:input.providerMessageId??null,error_message:input.error??null,
      attempted_at:new Date().toISOString(),
    })
  }).catch(error=>console.error(JSON.stringify({event:"rafig_message_delivery_log_failed",error:String(error).slice(0,300)})));
};

const findTelegramChat=async(db:Db,user:MessageUser)=>{
  if(user.telegramChatId)return String(user.telegramChatId);
  const phone=normalizePhone(user.phone);
  if(phone){
    const r=await db.rest("/rest/v1/rafiq_telegram_identities?phone=eq."+encodeURIComponent(phone)+"&select=chat_id&order=last_seen_at.desc&limit=1");
    if(r.response.ok&&Array.isArray(r.body)&&r.body[0]?.chat_id)return String(r.body[0].chat_id);
  }
  const username=String(user.telegramUsername??"").replace(/^@/,"").trim();
  if(username){
    const r=await db.rest("/rest/v1/rafiq_telegram_identities?username=ilike."+encodeURIComponent(username)+"&select=chat_id&order=last_seen_at.desc&limit=1");
    if(r.response.ok&&Array.isArray(r.body)&&r.body[0]?.chat_id)return String(r.body[0].chat_id);
  }
  return null;
};

/* RAFIQ automated outbound is Telegram-only. WhatsApp remains a manual app/channel. */
export async function sendMessage(user:MessageUser,text:string,media:MessageMedia|null=null,db:Db){
  validateRafiqLinks();
  const caption=withRafiqFooter(media?.caption?.trim()||text);
  const telegramChatId=await findTelegramChat(db,user);
  if(!telegramConfigured()||!telegramChatId){
    const error="Telegram is not configured or the recipient has no linked Telegram chat; WhatsApp delivery is manual only.";
    await logAttempt(db,{...user,telegramChatId:telegramChatId||null,channel:"none",status:"failed",error,eventType:"admin_event"});
    return{ok:false,channel:null,error};
  }
  try{
    const result=media?.qrUrl
      ? await telegramSendPhoto(telegramChatId,media.qrUrl,caption)
      : await telegramSendText(telegramChatId,caption);
    const messageId=result?.result?.message_id??null;
    await logAttempt(db,{...user,telegramChatId,channel:"telegram",status:"success",providerMessageId:messageId,eventType:"admin_event"});
    return{ok:true,channel:"telegram" as const,providerMessageId:messageId,retries:0};
  }catch(error){
    const reason=String(error).slice(0,500);
    await logAttempt(db,{...user,telegramChatId,channel:"telegram",status:"failed",error:reason,eventType:"admin_event"});
    return{ok:false,channel:null,error:reason};
  }
}
export { RAFIQ_CONFIG };
