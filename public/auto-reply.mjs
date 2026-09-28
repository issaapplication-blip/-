/* ==========================================================
   RAFIQ | رفيق — WhatsApp auto-reply worker
   ------------------------------------------------------------
   Polls Kapso for inbound messages, answers with the RAFIQ
   agent brain, and never touches money.

   Answer order (the agent can never go silent):
     1. rafiq-agent.js  guard  + knowledge base   (local, instant)
     2. OpenAI          only if OPENAI_API_KEY is set  (optional)
     3. Supabase Edge Function                     (optional)

   Required env:
     KAPSO_API_KEY
     KAPSO_PHONE_NUMBER_ID        (= 1324609540731383)
   Optional env:
     OPENAI_API_KEY, OPENAI_MODEL
     RAFIQ_AGENT_URL, SUPABASE_ANON_KEY
     POLL_MS
   ========================================================== */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/* the same brain the website uses - no network needed */
const RAFIQ_KB    = require(path.join(here, "js", "rafiq-kb.js"));
const RAFIQ_AGENT = require(path.join(here, "js", "rafiq-agent.js"));
RAFIQ_AGENT.configure({ kb: RAFIQ_KB, openaiKey: process.env.OPENAI_API_KEY || null });

/* ---------------- config ---------------- */
const KAPSO_MCP = "https://api.kapso.ai/mcp";
const KAPSO_KEY = process.env.KAPSO_API_KEY;
const PHONE_ID  = process.env.KAPSO_PHONE_NUMBER_ID;

const AGENT_URL = process.env.RAFIQ_AGENT_URL ||
  "https://qmuxaehrahfsnabyjens.supabase.co/functions/v1/rafiq-agent";
const ANON_KEY  = process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_AYoQSOTwTF1w3RT6CglKmA_WVcYUVlD";

const POLL_MS         = Number(process.env.POLL_MS || 20000);
const FINANCIAL_NUMBER = "96170600157";
const REVIEW_NUMBER    = "96181506299";

/* ---------------- Kapso MCP ---------------- */
async function kapso(name, args) {
  const r = await fetch(KAPSO_MCP, {
    method: "POST",
    headers: {
      "X-API-Key": KAPSO_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(), method: "tools/call",
      params: { name, arguments: args }
    })
  });
  const j = await r.json();
  const raw = j?.result?.content?.[0]?.text;
  try { return JSON.parse(raw).data; } catch { return null; }
}

async function sendText(to, text) {
  if (!to || !text) return null;
  // never message the transfers-only number
  if (to.replace(/\D/g, "").endsWith(FINANCIAL_NUMBER.slice(-8))) return null;
  return kapso("whatsapp_messages", {
    action: "send",
    params: { phone_number_id: PHONE_ID, to, text }
  });
}

/* ---------------- answer ---------------- */
async function askEdgeFunction(userText, ctx) {
  try {
    const r = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({ message: userText, ctx, locale: "ar" })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.reply ? RAFIQ_AGENT.clean(j.reply) : null;
  } catch { return null; }
}

async function answer(userText, ctx) {
  // 1) local brain - instant, always available, and authoritative for intake
  let reply = RAFIQ_AGENT.answerSync(userText, ctx);

  // 2) the remote agent may only speak when the local brain had nothing
  //    specific to say; a generic greeting must never overwrite a real answer
  if (String(reply) === RAFIQ_AGENT.HANDOFF) {
    const remote = await askEdgeFunction(userText, ctx);
    if (remote && remote.length > String(reply).length) reply = remote;

    if (String(reply) === RAFIQ_AGENT.HANDOFF && process.env.OPENAI_API_KEY) {
      try { reply = (await RAFIQ_AGENT.answer(userText, ctx)) || reply; } catch { /* keep local */ }
    }
  }

  // final safety sweep
  reply = RAFIQ_AGENT.clean(reply) || RAFIQ_AGENT.HANDOFF;
  if (String(reply).includes(FINANCIAL_NUMBER)) reply = RAFIQ_AGENT.HANDOFF;
  return reply;
}

/* ---------------- per-conversation intake state ---------------- */
const state = new Map();   // phone -> ctx

/** shared with the website, so both read a conversation the same way */
const absorb = (phone, text) => {
  state.set(phone, RAFIQ_AGENT.extract(text, state.get(phone) || {}));
  return state.get(phone);
};

/* ---------------- main loop ---------------- */
const seen = new Set();
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    if (!KAPSO_KEY || !PHONE_ID) {
      console.error("missing KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID");
      return;
    }

    const convs = await kapso("whatsapp_conversations", {
      action: "list", params: { phone_number_id: PHONE_ID, limit: 25 }
    });
    if (!Array.isArray(convs)) return;

    for (const c of convs) {
      const phone  = c.phone_number;
      const meta   = c.kapso || {};
      const lastId = meta.last_inbound_id || meta.last_message_id;
      const text   = meta.last_inbound_text || meta.last_message_text;

      if (!phone || !lastId || !text) continue;
      if (c.status && c.status !== "active") continue;
      if (String(phone).replace(/\D/g, "").endsWith(FINANCIAL_NUMBER.slice(-8))) continue;

      const key = phone + "|" + lastId;
      if (seen.has(key)) continue;

      const ctx = absorb(phone, text);
      const reply = await answer(text, ctx);
      const sent = await sendText(phone, reply);

      if (sent) {
        seen.add(key);
        console.log(new Date().toISOString(), "replied to", phone, "->", reply.slice(0, 70));
      }
      await new Promise((r) => setTimeout(r, 1200));   // stay under Meta rate limits
    }
  } catch (e) {
    console.error("tick failed:", e?.message || e);
  } finally {
    ticking = false;
  }
}

console.log("RAFIQ auto-reply started; poll every", POLL_MS, "ms");
tick();
setInterval(tick, POLL_MS);
