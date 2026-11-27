interface PagesFunctionContext {
  request: Request;
}

const API_ORIGIN = "https://rafiq-o6qd.onrender.com";

export const onRequest = async ({ request }: PagesFunctionContext): Promise<Response> => {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstreamResponse = await fetch(new Request(upstreamUrl.toString(), init));
  const responseHeaders = new Headers(upstreamResponse.headers);
  const location = responseHeaders.get("location");

  if (location) {
    try {
      const redirectUrl = new URL(location, API_ORIGIN);
      if (redirectUrl.hostname === "rafiq-o6qd.onrender.com") {
        redirectUrl.protocol = incomingUrl.protocol;
        redirectUrl.host = incomingUrl.host;
        responseHeaders.set("location", redirectUrl.toString());
      }
    } catch {
      // Preserve non-URL Location values unchanged.
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
