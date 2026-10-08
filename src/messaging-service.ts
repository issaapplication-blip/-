import { kapsoConfigured, kapsoSendImage, kapsoSendText } from "./kapso";
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

export type MessageMedia = {
  qrUrl?: string | null;
  caption?: string | null;
};

type Db = {
  rest: (path:string, init?:RequestInit) => Promise<{response:Response;body:any}>;
};

const normalizePhone=(value:string|null|undefined)=>String(value??"").replace(/\D/g,"");
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const logAttempt=async(db:Db,input:{
  intakeId?:string|null; applicationId?:string|null; phone?:string|null; telegramChatId?:string|null;
  eventType?:string|null; channel:string; status:"success"|"failed"; providerMessageId?:string|null; error?:string|null;
})=>{
  await db.rest("/rest/v1/message_delivery_attempts",{
    method:"POST",
    headers:{"Prefer":"return=minimal"},
    body:JSON.stringify({
      intake_id:input.intakeId??null,
      application_id:input.applicationId??null,
      recipient_phone:input.phone??null,
      telegram_chat_id:input.telegramChatId??null,
      event_type:input.eventType??"admin_event",
      channel:input.channel,
      status:input.status,
      provider_message_id:input.providerMessageId??null,
      error_message:input.error??null,
      attempted_at:new Date().toISOString(),
    })
  }).catch(error=>console.error(JSON.stringify({event:"rafig_message_delivery_log_failed",error:String(error).slice(0,300)})));
};

const metaSendText=async(to:string,body:string)=>{
  const accessToken=process.env.META_ACCESS_TOKEN;
  const phoneNumberId=process.env.META_PHONE_NUMBER_ID;
  const apiVersion=process.env.META_GRAPH_API_VERSION??"v23.0";
  if(!accessToken||!phoneNumberId)throw new Error("Meta WhatsApp configuration is incomplete");
  const response=await fetch("https://graph.facebook.com/"+apiVersion+"/"+phoneNumberId+"/messages",{
    method:"POST",
    headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body}})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Meta WhatsApp API error ("+response.status+")");
  return result;
};

const metaSendImage=async(to:string,imageUrl:string,caption:string)=>{
  const accessToken=process.env.META_ACCESS_TOKEN;
  const phoneNumberId=process.env.META_PHONE_NUMBER_ID;
  const apiVersion=process.env.META_GRAPH_API_VERSION??"v23.0";
  if(!accessToken||!phoneNumberId)throw new Error("Meta WhatsApp configuration is incomplete");
  const response=await fetch("https://graph.facebook.com/"+apiVersion+"/"+phoneNumberId+"/messages",{
    method:"POST",
    headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"image",image:{link:imageUrl,caption}})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("Meta WhatsApp image API error ("+response.status+")");
  return result;
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

export async function sendMessage(user:MessageUser,text:string,media:MessageMedia|null=null,db:Db){
  validateRafiqLinks();
  const phone=normalizePhone(user.phone);
  const caption=withRafiqFooter(media?.caption?.trim()||text);
  const attempts:number[]=[];
  const maxRetries=2;
  let whatsappError="";
  if(phone&&(process.env.WHATSAPP_SENDING_ENABLED==="true"||kapsoConfigured()||process.env.META_ACCESS_TOKEN)){
    for(let attempt=0;attempt<=maxRetries;attempt++){
      try{
        const result=media?.qrUrl
          ? (kapsoConfigured()
              ? await kapsoSendImage(phone,media.qrUrl,caption)
              : await metaSendImage(phone,media.qrUrl,caption))
          : (kapsoConfigured()?await kapsoSendText(phone,caption):await metaSendText(phone,caption));
        const messageId=result?.messages?.[0]?.id??result?.result?.messages?.[0]?.id??null;
        await logAttempt(db,{...user,phone,channel:"whatsapp",status:"success",providerMessageId:messageId,eventType:"admin_event"});
        return{ok:true,channel:"whatsapp" as const,providerMessageId:messageId,retries:attempt};
      }catch(error){
        whatsappError=String(error).slice(0,500);
        await logAttempt(db,{...user,phone,channel:"whatsapp",status:"failed",error:whatsappError,eventType:"admin_event"});
        if(attempt<maxRetries)await sleep(500*(attempt+1));
      }
    }
  }else if(phone){
    whatsappError="WhatsApp sending is not configured";
  }

  const telegramChatId=await findTelegramChat(db,user);
  if(telegramConfigured()&&telegramChatId){
    try{
      const result=media?.qrUrl
        ? await telegramSendPhoto(telegramChatId,media.qrUrl,caption)
        : await telegramSendText(telegramChatId,caption);
      const messageId=result?.result?.message_id??null;
      await logAttempt(db,{...user,phone:phone||null,telegramChatId,channel:"telegram",status:"success",providerMessageId:messageId,eventType:"admin_event"});
      return{ok:true,channel:"telegram" as const,providerMessageId:messageId,retries:0,whatsappError:whatsappError||null};
    }catch(error){
      const err=String(error).slice(0,500);
      await logAttempt(db,{...user,phone:phone||null,telegramChatId,channel:"telegram",status:"failed",error:err,eventType:"admin_event"});
      return{ok:false,channel:null,whatsappError:whatsappError||null,telegramError:err};
    }
  }

  const reason=whatsappError||"No linked Telegram chat and WhatsApp is unavailable";
  await logAttempt(db,{...user,phone:phone||null,channel:"none",status:"failed",error:reason,eventType:"admin_event"});
  return{ok:false,channel:null,error:reason};
}

export { RAFIQ_CONFIG };
