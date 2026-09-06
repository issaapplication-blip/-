import { Elysia } from "elysia";

const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  "Cache-Control": "no-store",
};

const app = new Elysia()
  .onAfterHandle(({ response }) => {
    if (response instanceof Response) {
      for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    }
  })
  .get("/health", () => ({ ok: true, service: "wisal", startedAt }))
  .get("/api/status", () => ({ ok: true, platform: "WISAL | وِصال", mode: "v1-foundation", whatsappSending: false, humanApprovalRequired: true }))
  .get("/", () => new Response(Bun.file("public/index.html")))
  .listen(port);

console.log(`WISAL server listening on ${app.server?.hostname}:${app.server?.port}`);
