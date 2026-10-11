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

test("forces an external Gemini model call rather than the local knowledge shortcut", async () => {
  let requestedUrl = "";
  let requestedBody: any = null;
  process.env.RAFIQ_AGENT_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  process.env.RAFIQ_GEMINI_MODEL = "gemini-3.6-flash";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "RAFIQ provides home care, home nursing, and home physiotherapy." }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const result = await draftAgentReply(
    "What services does RAFIQ provide?",
    "en",
    "Synthetic staging test only.",
    false,
  );

  expect(requestedUrl).toContain("generativelanguage.googleapis.com");
  expect(requestedUrl).toContain("gemini-3.6-flash:generateContent");
  expect(requestedBody.system_instruction.parts[0].text).toContain("RAFIQ");
  expect(requestedBody.contents[0].parts[0].text).toContain("What services does RAFIQ provide?");
  expect(result.model).toBe("gemini-3.6-flash");
  expect(result.reply).toContain("home nursing");
});

test("surfaces a free-tier quota response instead of pretending the agent worked", async () => {
  process.env.RAFIQ_AGENT_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" },
  }), { status: 429, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  await expect(draftAgentReply("Test", "en", "Synthetic test", false))
    .rejects.toThrow("Gemini agent request failed");
});
