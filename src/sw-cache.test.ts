import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function setupWorker() {
  const handlers = new Map<string, (event: any) => void>();
  const store = new Map<string, Response>();
  const networkOptions: Array<RequestInit | undefined> = [];
  let networkCalls = 0;
  const keyFor = (request: Request | string) => {
    const url = typeof request === "string" ? new URL(request, "https://rafig.test") : new URL(request.url);
    return url.origin + url.pathname + url.search;
  };
  const cachesMock = {
    open: async () => ({
      put: async (request: Request | string, response: Response) => {
        store.set(keyFor(request), response.clone());
      },
      add: async () => undefined
    }),
    match: async (request: Request | string) => {
      const value = store.get(keyFor(request));
      return value ? value.clone() : undefined;
    },
    keys: async () => ["rafig-v84-20261012"],
    delete: async () => true
  };
  const selfMock = {
    location: { origin: "https://rafig.test" },
    addEventListener: (name: string, callback: (event: any) => void) => handlers.set(name, callback),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined }
  };
  const context = {
    self: selfMock,
    caches: cachesMock,
    URL,
    Request,
    Response,
    fetch: async (_request: Request, options?: RequestInit) => {
      networkCalls++;
      networkOptions.push(options);
      return new Response("network-"+networkCalls, { status: 200, headers: {"Content-Type":"image/png"} });
    }
  };
  vm.runInNewContext(source, context);
  return {
    getNetworkCalls: () => networkCalls,
    getNetworkOptions: () => networkOptions,
    async request(url: string) {
      const event: any = {
        request: new Request(url, { method: "GET" }),
        respondWith: (promise: Promise<Response>) => { event.pending = promise; }
      };
      handlers.get("fetch")!(event);
      return await event.pending as Response;
    }
  };
}

test("repeat image requests use the service-worker cache after the first network fetch", async () => {
  const worker = setupWorker();
  const url = "https://rafig.test/assets/rafig-logo.png";
  await (await worker.request(url)).text();
  await (await worker.request(url)).text();
  expect(worker.getNetworkCalls()).toBe(1);
});

test("HTML, JS, CSS and manifest remain network-first with no-store", async () => {
  const worker = setupWorker();
  for (const path of ["/index.html", "/app.js", "/site.css", "/manifest.webmanifest"]) {
    await worker.request("https://rafig.test"+path);
  }
  expect(worker.getNetworkCalls()).toBe(4);
  expect(worker.getNetworkOptions().every((options) => options?.cache === "no-store")).toBe(true);
});
