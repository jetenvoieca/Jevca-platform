import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Reading a page on someone else's public website from the server
// (2026-11-07, first for Contacts → Find prices). The address is
// checked first — only http(s), and only a host on the public internet,
// never this server's own network — and so is each redirect. A slow or
// huge page is cut short.

const MAX_REDIRECTS = 4;
const MAX_BYTES = 3_000_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// An IPv4 or IPv6 address that isn't on the public internet.
function privateAddress(ip: string) {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function publicAddress(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !privateAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}

// Why a site couldn't be reached, from the network's error code.
function whyUnreachable(err: unknown) {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  const code = cause?.code ?? "";
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|LEAF_SIGNATURE/.test(code))
    return `Couldn't reach it — its security certificate didn't check out (${code}).`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Couldn't reach it — the address wasn't found.";
  if (code === "ECONNRESET" || code === "ECONNREFUSED" || code === "UND_ERR_SOCKET")
    return `Couldn't reach it — the site refused this server (${code}).`;
  return code ? `Couldn't reach it (${code}).` : "Couldn't reach it.";
}

export type PublicPage = { url: string; status: number; contentType: string; body: string };

// The page at `address` as text, or why not. Gives up at `deadline`
// (a Date.now() time).
export async function fetchPublicPage(
  address: string,
  deadline: number,
  accept = "text/html,application/json;q=0.9,*/*;q=0.8",
): Promise<PublicPage | { error: string }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { error: "Not a web address." };
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await publicAddress(url))) return { error: "Not a public website." };
    const left = deadline - Date.now();
    if (left <= 0) return { error: "Took too long." };
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(left),
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en-GB,en;q=0.8" },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") return { error: "Took too long." };
      console.log(`[publicFetch] ${url.host}:`, err);
      return { error: whyUnreachable(err) };
    }
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      await res.body?.cancel();
      url = new URL(next, url);
      continue;
    }
    try {
      return {
        url: url.toString(),
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body: await limitedText(res),
      };
    } catch {
      return { error: "Took too long." };
    }
  }
  return { error: "Too many redirects." };
}

// The response as text, up to MAX_BYTES.
async function limitedText(res: Response) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8");
}
