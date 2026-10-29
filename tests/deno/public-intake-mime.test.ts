import { assertEquals } from "jsr:@std/assert";
import { fileType, validateFiles } from "../../supabase/functions/_shared/upload-validation.ts";

Deno.test("Deno File MIME is derived from the allowlisted filename extension", () => {
  const clientClaimsWrongMime = new File(["synthetic PDF-like content"], "application.pdf", { type: "text/plain" });
  assertEquals(clientClaimsWrongMime.type, "text/plain");
  assertEquals(fileType(clientClaimsWrongMime), "application/pdf");
});

Deno.test("Deno File with an unsupported extension is rejected regardless of claimed MIME", () => {
  const disguisedExecutable = new File(["synthetic test"], "payload.exe", { type: "application/pdf" });
  assertEquals(fileType(disguisedExecutable), null);
  assertEquals(validateFiles([disguisedExecutable]), false);
});

Deno.test("allowlisted office and image extensions map to canonical MIME values", () => {
  assertEquals(fileType(new File(["x"], "resume.docx", { type: "application/octet-stream" })), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assertEquals(fileType(new File(["x"], "photo.jpeg", { type: "text/plain" })), "image/jpeg");
  assertEquals(fileType(new File(["x"], "photo.webp", { type: "application/octet-stream" })), "image/webp");
});
