import { afterEach, expect, test } from "bun:test";
import { draftAgentReply } from "./agent";

const originalFetch = globalThis.fetch;
const originalProvider = process.env.RAFIQ_AGENT_PROVIDER;
const originalOllamaUrl = process.env.RAFIQ_OLLAMA_URL;
const originalOllamaModel = process.env.RAFIQ_OLLAMA_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalProvider === undefined) delete process.env.RAFIQ_AGENT_PROVIDER;
  else process.env.RAFIQ_AGENT_PROVIDER = originalProvider;
  if (originalOllamaUrl === undefined) delete process.env.RAFIQ_OLLAMA_URL;
  else process.env.RAFIQ_OLLAMA_URL = originalOllamaUrl;
  if (originalOllamaModel === undefined) delete process.env.RAFIQ_OLLAMA_MODEL;
  else process.env.RAFIQ_OLLAMA_MODEL = originalOllamaModel;
});

test("uses only the private Ollama endpoint and strips model thinking text", async () => {
  let requestedUrl = "";
  let requestBody: any = null;
  process.env.RAFIQ_AGENT_PROVIDER = "ollama";
  process.env.RAFIQ_OLLAMA_URL = "http://ollama:11434";
  process.env.RAFIQ_OLLAMA_MODEL = "qwen3:4b";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      response: "<think>hidden reasoning must not be displayed</think>RAFIQ offers elderly care, patient care, home nursing, and home physiotherapy.",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const result = await draftAgentReply(
    "What services does RAFIQ provide?",
    "en",
    "Synthetic local-model test",
    false,
  );

  expect(requestedUrl).toBe("http://ollama:11434/api/generate");
  expect(requestBody.model).toBe("qwen3:4b");
  expect(requestBody.stream).toBe(false);
  expect(requestBody.system).toContain("RAFIQ");
  expect(result.model).toBe("ollama:qwen3:4b");
  expect(result.reply).toContain("home nursing");
  expect(result.reply).not.toContain("hidden reasoning");
});

test("reports local model downtime rather than manufacturing a reply", async () => {
  process.env.RAFIQ_AGENT_PROVIDER = "ollama";
  process.env.RAFIQ_OLLAMA_URL = "http://ollama:11434";
  process.env.RAFIQ_OLLAMA_MODEL = "qwen3:4b";
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "model not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;

  await expect(draftAgentReply("Synthetic test", "en", "Local test", false))
    .rejects.toThrow("Local Ollama agent request failed");
});
