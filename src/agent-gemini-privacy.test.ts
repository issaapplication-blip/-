import { afterEach, expect, test } from "bun:test";
import { draftAgentReply } from "./agent";

const originalFetch = globalThis.fetch;
const originalProvider = process.env.RAFIQ_AGENT_PROVIDER;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.RAFIQ_GEMINI_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalProvider === undefined) delete process.env.RAFIQ_AGENT_PROVIDER;
  else process.env.RAFIQ_AGENT_PROVIDER = originalProvider;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalModel === undefined) delete process.env.RAFIQ_GEMINI_MODEL;
  else process.env.RAFIQ_GEMINI_MODEL = originalModel;
});

test("redacts direct phone, email, and explicitly named contact identifiers before Gemini", async () => {
  let sentBody: any = null;
  process.env.RAFIQ_AGENT_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  process.env.RAFIQ_GEMINI_MODEL = "gemini-3.6-flash";

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "I can help with RAFIQ's services." }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await draftAgentReply(
    "My name is Example Person; phone: +961 81 506 299; email: person@example.com",
    "en",
    "Synthetic test only",
    false,
  );

  // The system prompt intentionally contains RAFIQ official contact details. Test only the customer contents being sent to the model.
  const sent = JSON.stringify(sentBody.contents);
  expect(sent).not.toContain("Example Person");
  expect(sent).not.toContain("+961 81 506 299");
  expect(sent).not.toContain("person@example.com");
  expect(sent).toContain("[NAME REDACTED]");
  expect(sent).toContain("[PHONE REDACTED]");
  expect(sent).toContain("[EMAIL REDACTED]");
});
