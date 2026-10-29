import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadFunction } from "./harness";

const BASE = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "svc-test-key-0000000000000000",
  RAFIQ_PUBLIC_SITE_URL: "https://rafiq-new.pages.dev/",
};
const source = readFileSync(
  resolve(import.meta.dir, "../../supabase/functions/public-intake/index.ts"),
  "utf8",
);

test("public intake CORS reflects only configured or known Pages origins", async () => {
  const f = loadFunction("public-intake", BASE, async () => { throw new Error("network must not be used"); });
  const allowed = await f.handler(new Request("https://f.invalid/", {
    method: "OPTIONS",
    headers: { Origin: "https://rafiq-new.pages.dev", "Access-Control-Request-Method": "POST" },
  }));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://rafiq-new.pages.dev");

  const denied = await f.handler(new Request("https://f.invalid/", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  }));
  expect(denied.status).toBe(200);
  expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  expect(source).not.toContain('"Access-Control-Allow-Origin":"*"');
});

test("unsupported extension is rejected before any intake database write even if client MIME claims PDF", async () => {
  const f = loadFunction("public-intake", BASE, async () => { throw new Error("network must not be used"); });
  const form = new FormData();
  form.set("role", "caregiver");
  form.set("first_name", "Synthetic");
  form.set("last_name", "Applicant");
  form.set("phone", "+96100000000");
  form.set("cv", new File(["synthetic test"], "payload.exe", { type: "application/pdf" }));
  const response = await f.handler(new Request("https://f.invalid/", {
    method: "POST",
    headers: { Origin: "https://rafiq-new.pages.dev" },
    body: form,
  }));
  expect(response.status).toBe(415);
  expect(f.calls.length).toBe(0);
});

test("stored MIME is derived from the allowlisted extension, not client-supplied File.type", () => {
  expect(source).toContain('"pdf":"application/pdf"');
  expect(source).toContain('"docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"');
  expect(source).toContain("contentType:fileType(file)!");
  expect(source).toContain("mime_type:fileType(file)!");
  expect(source).toContain("readLimitedBody(req,maxBodyBytes)");
  expect(source).toContain("await reader.cancel()");
});
