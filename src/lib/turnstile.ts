import { db } from "@/lib/db";
import { APP_URL } from "@/lib/appUrl";
import { decryptSecret, encryptSecret } from "@/lib/secretBox";

// Cloudflare Turnstile (2026-10-10, Marketing step 5) — checks that a
// website sign-up comes from a person, not a robot, usually without the
// visitor seeing anything. Server-only.
//
// A Turnstile widget only works on the domains listed on it (each also
// covers its subdomains, so "example.com" covers "www.example.com"); the
// free plan allows 10 domains per widget and 20 widgets, so 200 domains.
// Craig's choice: the app lists the domains itself, through Cloudflare's
// API — every site's domain plus the admin's own address (where
// published sites are previewed) — creating widgets as they fill up and
// removing domains no site uses any more. See TurnstileWidget in
// schema.prisma. Runs when a site's domain is saved and when a site is
// published.
//
// Uses the Cloudflare account already set in Netlify for media storage
// (R2_ACCOUNT_ID — the same account), plus CLOUDFLARE_TURNSTILE_API_TOKEN
// (a Cloudflare API token with Account → Turnstile → Edit). The widgets'
// secrets are encrypted with TOKEN_ENCRYPTION_KEY (lib/secretBox.ts).

const API = "https://api.cloudflare.com/client/v4";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_DOMAINS_PER_WIDGET = 10;
const MAX_WIDGETS = 20;
// "managed": Cloudflare decides whether the visitor needs to tick a box;
// most never do.
const WIDGET_MODE = "managed";
// Lets only one update of the widgets run at a time, so two at once
// can't both create a widget for the same domain.
const SYNC_LOCK = 52_710_016;

export type TurnstileSyncResult = { ok: true } | { error: string };

function cloudflareConfig(): { accountId: string; token: string } | null {
  // Trimmed, so a space or line break pasted with the value doesn't break it.
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_TURNSTILE_API_TOKEN?.trim();
  return accountId && token ? { accountId, token } : null;
}

// A domain as Turnstile lists it: lower case, without protocol, port,
// path or a leading "www.". Null if it doesn't look like a domain.
export function cleanDomain(raw: string): string | null {
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/:?#].*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  return /^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(domain) ? domain : null;
}

// The admin's own address, where published sites are previewed.
export function adminDomain(): string {
  return new URL(APP_URL).hostname.toLowerCase();
}

// Whether a web address (host) is the domain itself or one of its
// subdomains.
export function hostIsWithin(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

// The host and each domain above it — "www.a.com" → www.a.com, a.com.
function hostAndParents(host: string): string[] {
  const parts = host.toLowerCase().split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

type CloudflareWidget = { sitekey: string; secret: string };

async function cloudflare(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: object
): Promise<CloudflareWidget | null> {
  const cf = cloudflareConfig()!;
  const res = await fetch(`${API}/accounts/${cf.accountId}/challenges/widgets${path}`, {
    method,
    headers: { Authorization: `Bearer ${cf.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    errors?: { message?: string }[];
    result?: CloudflareWidget;
  } | null;
  if (!res.ok || !json?.success) {
    const reason = json?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    throw new CloudflareError(`Cloudflare said: ${reason} (HTTP ${res.status})`, res.status);
  }
  return json.result ?? null;
}

class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

// Whether a read with the token succeeds.
async function cloudflareAccepts(path: string): Promise<boolean> {
  const cf = cloudflareConfig()!;
  try {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${cf.token}` } });
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return res.ok && json?.success === true;
  } catch {
    return false;
  }
}

// When Cloudflare refuses the token (2026-10-10), works out why, in
// words that say what to change: the token isn't recognised at all; it
// is, but can't use Turnstile on the account in R2_ACCOUNT_ID; or it can
// read Turnstile but not change it.
async function diagnoseToken(): Promise<string> {
  const cf = cloudflareConfig()!;
  const known =
    (await cloudflareAccepts("/user/tokens/verify")) ||
    (await cloudflareAccepts(`/accounts/${cf.accountId}/tokens/verify`));
  if (!known) {
    return "Cloudflare doesn't recognise CLOUDFLARE_TURNSTILE_API_TOKEN. It may be the token's ID, an R2 key or the Global API Key instead of the token itself (shown once, when the token is created).";
  }
  const account = `…${cf.accountId.slice(-4)}`;
  if (!(await cloudflareAccepts(`/accounts/${cf.accountId}/challenges/widgets`))) {
    return `The token is valid but can't use Turnstile on account ${account} (R2_ACCOUNT_ID). Check its permission is Account → Turnstile → Edit and its Account Resources include that account.`;
  }
  return "The token can read Turnstile but not change it. Set its Turnstile permission to Edit.";
}

function sameDomains(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

// Brings the widgets in line with the domains wanted: every site's
// domain and the admin's address. A domain already on a widget stays
// there; new ones fill the widgets with room, then new widgets. What's
// done before a Cloudflare call fails is kept, and the next run carries
// on from there.
export async function syncTurnstileDomains(): Promise<TurnstileSyncResult> {
  if (!cloudflareConfig()) {
    return {
      error:
        "Sign-up forms need Cloudflare: add CLOUDFLARE_TURNSTILE_API_TOKEN in Netlify.",
    };
  }
  try {
    return await db.$transaction(
      async (tx): Promise<TurnstileSyncResult> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK})`;

        const sites = await tx.site.findMany({
          where: { domain: { not: null } },
          select: { domain: true },
        });
        const wanted = new Set<string>([adminDomain()]);
        for (const s of sites) {
          const d = cleanDomain(s.domain ?? "");
          if (d) wanted.add(d);
        }

        const widgets = await tx.turnstileWidget.findMany({ orderBy: { createdAt: "asc" } });
        const placed = new Set<string>();
        const plans = widgets.map((w) => {
          const domains = w.domains.filter((d) => wanted.has(d) && !placed.has(d));
          domains.forEach((d) => placed.add(d));
          return { widget: w, domains };
        });
        const missing = [...wanted].filter((d) => !placed.has(d)).sort();
        for (const p of plans) {
          while (p.domains.length < MAX_DOMAINS_PER_WIDGET && missing.length > 0) {
            p.domains.push(missing.shift()!);
          }
        }

        try {
          for (const { widget, domains } of plans) {
            if (sameDomains(domains, widget.domains)) continue;
            if (domains.length === 0) {
              // A widget must list at least one domain.
              await cloudflare("DELETE", `/${widget.sitekey}`);
              await tx.turnstileWidget.delete({ where: { sitekey: widget.sitekey } });
            } else {
              await cloudflare("PUT", `/${widget.sitekey}`, { name: widget.name, mode: WIDGET_MODE, domains });
              await tx.turnstileWidget.update({ where: { sitekey: widget.sitekey }, data: { domains } });
            }
          }

          let count = plans.filter((p) => p.domains.length > 0).length;
          while (missing.length > 0) {
            if (count >= MAX_WIDGETS) {
              return {
                error: `Cloudflare's free plan covers ${MAX_WIDGETS * MAX_DOMAINS_PER_WIDGET} domains, so ${missing.length} site domain(s) have no robot check and their sign-up forms won't work.`,
              };
            }
            const domains = missing.splice(0, MAX_DOMAINS_PER_WIDGET);
            const name = `JEVCA sign-up forms ${count + 1}`;
            const created = await cloudflare("POST", "", { name, mode: WIDGET_MODE, domains });
            if (!created?.sitekey || !created.secret) throw new Error("Cloudflare returned no widget keys.");
            await tx.turnstileWidget.create({
              data: { sitekey: created.sitekey, name, secretEncrypted: encryptSecret(created.secret), domains },
            });
            count++;
          }
        } catch (err) {
          return await syncFailed(err);
        }
        return { ok: true };
      },
      { timeout: 60_000, maxWait: 15_000 }
    );
  } catch (err) {
    return await syncFailed(err);
  }
}

// What a failed update reports (2026-10-10): the reason Cloudflare (or
// the database) gave, so it can be put right without reading the logs.
// A refused token (400 / 401 / 403) is explained by diagnoseToken.
async function syncFailed(err: unknown): Promise<TurnstileSyncResult> {
  console.error("syncTurnstileDomains", err);
  const refused = err instanceof CloudflareError && [400, 401, 403].includes(err.status);
  const reason = refused ? await diagnoseToken() : err instanceof Error ? err.message : String(err);
  return { error: `Couldn't update Cloudflare's robot check for sign-up forms — ${reason.slice(0, 300)}` };
}

// The widget covering a web address (host), if any.
async function widgetForHost(host: string) {
  return db.turnstileWidget.findFirst({
    where: { domains: { hasSome: hostAndParents(host) } },
    select: { sitekey: true, secretEncrypted: true },
  });
}

// The public key a page on this host draws the check with, or null if
// no widget covers it yet.
export async function turnstileSiteKeyForHost(host: string): Promise<string | null> {
  return (await widgetForHost(host))?.sitekey ?? null;
}

// Asks Cloudflare whether the token a visitor's browser got on this host
// is genuine, unused, and was given on this host.
export async function verifyTurnstile(host: string, token: string, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const widget = await widgetForHost(host);
  if (!widget) return false;
  const form = new URLSearchParams({ secret: decryptSecret(widget.secretEncrypted), response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    const json = (await res.json()) as { success?: boolean; hostname?: string };
    return json.success === true && json.hostname?.toLowerCase() === host;
  } catch (err) {
    console.error("verifyTurnstile", err);
    return false;
  }
}
