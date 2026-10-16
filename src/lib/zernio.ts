// Zernio (zernio.com, 2026-10-16) — the posting service the Social page
// posts through. It holds Meta's approval and handles the Instagram
// login, so there is no Meta app of our own (that route was dropped when
// Meta disabled the account it needed). Each artist has one Zernio
// profile (Artist.zernioProfileId) holding their connected Instagram.
// Billed per connected account. The API key is ZERNIO_API_KEY in
// Netlify. Server-only.

const ZERNIO_API = "https://zernio.com/api/v1";

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// One call to Zernio's API; its JSON reply, or a ZernioError with its
// message.
export async function zernio<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new ZernioError("Missing ZERNIO_API_KEY — set it in Netlify first.", 0);

  const res = await fetch(`${ZERNIO_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    throw new ZernioError(body.message || body.error || `Zernio answered ${res.status}`, res.status);
  }
  return body as T;
}
