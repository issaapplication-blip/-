export function applySecurityHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "cache-control") response.headers.set(name, value);
  }
  if (!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
  return response;
}
