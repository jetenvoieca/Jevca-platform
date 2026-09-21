// POSTs JSON and returns the parsed reply, throwing an Error carrying the
// server's own message (the `error` field) when the request fails.
// Shared by every browser-side call to the token-authenticated
// /api/hopper and /api/studio routes.
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (status ${res.status}).`);
  }
  return data as T;
}
