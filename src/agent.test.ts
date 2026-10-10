import { afterEach, expect, test } from "bun:test";
import { draftTelegramAgentTurn } from "./agent";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const validTurn = {
  reply: "I can help with RAFIQ's home-care services. Which area are you in?",
  escalation: { required: false, reason: null },
  intake: {
    service_type: null,
    area: null,
    case_summary: null,
    contact_preference: "telegram",
    contact_value: null,
    ready_to_submit: false,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

const mockGeminiApi = (turn: unknown, inspect?: (request: any, init?: RequestInit) => void) => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    inspect?.({ url: String(input), ...body }, init);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(turn) }] } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  delete process.env.OPENAI_API_KEY;
};

test("knowledge question goes through the structured model response, not the knowledge shortcut", async () => {
  let requestBody: any;
  mockGeminiApi(validTurn, body => { requestBody = body; });
  const result = await draftTelegramAgentTurn("What services does RAFIQ provide?", "en", "Customer: hello", "Editable admin settings");
  expect(result.model).not.toBe("rafiq-knowledge-base");
  expect(result.model).not.toBe("rafig-local-fallback");
  expect(result.reply).toContain("home-care");
  expect(requestBody.generationConfig.responseMimeType).toBe("application/json");
  expect(requestBody.generationConfig.responseSchema.properties.reply.type).toBe("string");
  expect(requestBody.url).toContain("generativelanguage.googleapis.com");
  expect(requestBody.systemInstruction.parts[0].text).toContain("Editable admin settings");
});

test("ambiguous French conversation preserves history and language", async () => {
  const turn = {
    ...validTurn,
    reply: "Bien sûr. Pour quelle ville ou région avez-vous besoin de soins ?",
  };
  let requestBody: any;
  mockGeminiApi(turn, body => { requestBody = body; });
  const result = await draftTelegramAgentTurn(
    "J’ai besoin d’aide pour ma mère.",
    "fr",
    "Customer: Ma mère a 82 ans.\nRAFIQ: Je peux vous aider.",
    "Test instructions",
  );
  expect(result.reply).toContain("ville");
  const sentPrompt = requestBody.contents[0].parts[0].text;
  expect(sentPrompt).toContain("Ma mère a 82 ans");
  expect(sentPrompt).toContain("Latest customer message:");
  expect(sentPrompt).toContain("Preferred language hint: fr");
});

test("complete intake and escalation are returned as structured fields", async () => {
  const turn = {
    reply: "I have recorded the details for review.",
    escalation: { required: true, reason: "Administrator must confirm the requested service arrangement." },
    intake: {
      service_type: "elderly_home_care",
      area: "Tripoli",
      case_summary: "82-year-old parent needs night care and mobility assistance.",
      contact_preference: "telegram",
      contact_value: null,
      ready_to_submit: true,
    },
  };
  mockGeminiApi(turn);
  const result = await draftTelegramAgentTurn("My father needs night care in Tripoli.", "en", "Customer: My father is 82.", "Test instructions");
  expect(result.intake.ready_to_submit).toBe(true);
  expect(result.intake.service_type).toBe("elderly_home_care");
  expect(result.escalation.required).toBe(true);
  expect(result.escalation.reason).toContain("Administrator");
});

test("Gemini free-tier quota failure is surfaced honestly and classified", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "insufficient_quota" },
  }), { status: 429, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  delete process.env.OPENAI_API_KEY;
  await expect(draftTelegramAgentTurn("Help", "en", "Customer: Help", "Test instructions"))
    .rejects.toThrow("Gemini API HTTP 429: free-tier quota or rate limit reached");
});


test("direct contact details are redacted before external model requests", async () => {
  let requestBody: any;
  mockGeminiApi(validTurn, body => { requestBody = body; });
  await draftTelegramAgentTurn("My name is Example Person and my number is +961 81 506 299; email me at person@example.com", "en", "Customer: my phone is +961 70 123 456", "Test instructions");
  expect(JSON.stringify(requestBody)).not.toContain("+961 81 506 299");
  expect(JSON.stringify(requestBody)).not.toContain("+961 70 123 456");
  expect(JSON.stringify(requestBody)).not.toContain("person@example.com");
  expect(JSON.stringify(requestBody)).toContain("[PHONE REDACTED]");
  expect(JSON.stringify(requestBody)).toContain("[EMAIL REDACTED]");
});
