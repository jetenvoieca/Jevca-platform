import { fetchPublicPage } from "@/lib/publicFetch";
import {
  countryCurrency,
  type MarketingCurrency,
  type MarketingPriceBandFind,
  type MarketingPriceFind,
} from "@/lib/marketingContacts";

// Contacts → Find prices (2026-11-07, Craig's request): reads a
// gallery's shop page (or, without one, its website) and works out what
// its originals and its prints sell for. Tries, in order, the shop's own
// product list where the site is a Shopify or WooCommerce shop, then the
// product details a page carries for search engines (JSON-LD), then the
// prices written on the page. Each work counts as a print when its name,
// type or category says so (print, giclée, edition, screenprint…), and
// otherwise as an original; gift cards, frames, books, cards, sculpture
// and the like aren't counted. The result is only a suggestion — the
// screen shows it, with the cheapest and dearest works it came from,
// for Craig to accept or not.

const TIME_LIMIT_MS = 8000;
const MIN_PRICE = 20;
const MAX_PRICE = 10_000_000;
const SHOPIFY_PAGES = 4;
const SHOPIFY_PAGE_SIZE = 250;
const WOO_PAGES = 5;
const WOO_PAGE_SIZE = 100;

type Item = { title: string; about: string; price: number; currency: MarketingCurrency | null };
type Kind = "ORIGINALS" | "PRINTS";

// Lower case, without accents: "Sérigraphie" → "serigraphie".
const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const NOT_COUNTED =
  /\b(gift ?cards?|vouchers?|gift certificates?|frames?|framing|shipping|delivery|postage|books?|catalogues?|catalogs?|postcards?|greeting cards?|cards?|mugs?|tote|t-?shirts?|calendars?|puzzles?|cushions?|candles?|jewel(le)?ry|sculptures?|sculpted|bronzes?|ceramics?|vases?|statues?|scultura|escultura|ticket|tickets|workshops?|classes?|commission deposit)\b/;
const PRINT =
  /\b(prints?|printed|giclees?|editions?|edition limitee|serigraph(s|y)?|serigraphie|serigrafia|screen ?prints?|silk ?screens?|lithograph(s|ie)?|litografia|etchings?|linocuts?|woodcuts?|aquatints?|estampes?|gravures?|stampa|stampe|grabados?|multiples?)\b/;

// Whether a work counts as an original or a print — or not at all.
function kindOf(item: Item): Kind | null {
  const text = plain(`${item.title} ${item.about}`);
  if (NOT_COUNTED.test(text)) return null;
  return PRINT.test(text) ? "PRINTS" : "ORIGINALS";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", pound: "£" };
const decode = (v: string) =>
  v.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? whole;
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
  });
const stripTags = (v: string) => decode(v.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const SIGNS: Record<string, MarketingCurrency> = { "£": "GBP", "€": "EUR", $: "USD", GBP: "GBP", EUR: "EUR", USD: "USD" };
const currencyOf = (v: unknown): MarketingCurrency | null =>
  typeof v === "string" ? (SIGNS[v.trim().toUpperCase()] ?? SIGNS[v.trim()] ?? null) : null;

// "1,250.00", "1.250,00", "3 500" → 1250, 1250, 3500.
function amount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const whole = v.trim().replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");
  return whole ? Number(whole) : null;
}

const json = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

// Shopify: the shop's product list — the collection's, when the shop
// page is one.
async function shopifyItems(pageUrl: string, html: string, deadline: number): Promise<Item[]> {
  const url = new URL(pageUrl);
  const collection = url.pathname.match(/^(\/[a-z]{2}(?:-[a-z]{2})?)?\/collections\/[^/]+/i)?.[0];
  const list = `${url.origin}${collection ?? ""}/products.json`;
  // The shop's own currency, when the page is shown in it.
  const shown = json(html.match(/Shopify\.currency\s*=\s*(\{[^}]*\})/)?.[1] ?? "") as {
    active?: string;
    rate?: string;
  } | null;
  const currency = shown && Number(shown.rate) === 1 ? currencyOf(shown.active) : null;

  const items: Item[] = [];
  for (let page = 1; page <= SHOPIFY_PAGES; page++) {
    const res = await fetchPublicPage(`${list}?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`, deadline, "application/json");
    if ("error" in res || res.status !== 200) break;
    const products = (json(res.body) as { products?: unknown[] } | null)?.products;
    if (!Array.isArray(products)) break;
    for (const p of products as {
      title?: string;
      product_type?: string;
      tags?: string[] | string;
      variants?: { price?: string }[];
    }[]) {
      const tags = Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags ?? "");
      const prices = new Set((p.variants ?? []).map((v) => amount(v.price)).filter((n): n is number => n !== null));
      for (const price of prices)
        items.push({ title: p.title ?? "", about: `${p.product_type ?? ""} ${tags}`, price, currency });
    }
    if (products.length < SHOPIFY_PAGE_SIZE) break;
  }
  return items;
}

// WooCommerce: the shop's product list (its Store API).
async function wooItems(pageUrl: string, deadline: number): Promise<Item[]> {
  const origin = new URL(pageUrl).origin;
  const items: Item[] = [];
  for (let page = 1; page <= WOO_PAGES; page++) {
    const res = await fetchPublicPage(
      `${origin}/wp-json/wc/store/v1/products?per_page=${WOO_PAGE_SIZE}&page=${page}`,
      deadline,
      "application/json",
    );
    if ("error" in res || res.status !== 200) break;
    const products = json(res.body);
    if (!Array.isArray(products)) break;
    for (const p of products as {
      name?: string;
      categories?: { name?: string }[];
      prices?: {
        price?: string;
        currency_code?: string;
        currency_minor_unit?: number;
        price_range?: { min_amount?: string; max_amount?: string } | null;
      };
    }[]) {
      if (!p.prices) continue;
      const unit = 10 ** (p.prices.currency_minor_unit ?? 2);
      const raw = [p.prices.price, p.prices.price_range?.min_amount, p.prices.price_range?.max_amount];
      const prices = new Set(raw.map((v) => (v ? Number(v) / unit : NaN)).filter((n) => Number.isFinite(n) && n > 0));
      const title = stripTags(p.name ?? "");
      const about = (p.categories ?? []).map((c) => stripTags(c.name ?? "")).join(" ");
      for (const price of prices) items.push({ title, about, price, currency: currencyOf(p.prices.currency_code) });
    }
    if (products.length < WOO_PAGE_SIZE) break;
  }
  return items;
}

// The products a page describes for search engines (JSON-LD).
function jsonLdItems(html: string): Item[] {
  const items: Item[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []);
    if (types.includes("Product")) {
      const title = typeof o.name === "string" ? stripTags(o.name) : "";
      const about = typeof o.category === "string" ? o.category : "";
      for (const offer of ([] as unknown[]).concat(o.offers ?? []) as Record<string, unknown>[]) {
        const currency = currencyOf(offer?.priceCurrency);
        for (const v of [offer?.price, offer?.lowPrice, offer?.highPrice]) {
          const price = amount(v);
          if (price !== null) items.push({ title, about, price, currency });
        }
      }
    }
    Object.values(o).forEach(visit);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) visit(json(m[1].trim()));
  return items;
}

const AMOUNT = String.raw`\d{1,3}(?:[.,\s  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const SIGN = String.raw`£|€|\$|GBP|EUR|USD`;
const PRICE_IN_TEXT = new RegExp(String.raw`(${SIGN})\s?(${AMOUNT})|(${AMOUNT})\s?(${SIGN})`, "g");
const CONTEXT = 100;
const NAME_WORDS = 12;

// Prices written on the page, each with the words just before it.
function textItems(html: string): Item[] {
  const text = stripTags(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " "));
  const items: Item[] = [];
  let after = 0;
  for (const m of text.matchAll(PRICE_IN_TEXT)) {
    // The words since the price before, so one work's don't run into
    // the next's.
    const about = text.slice(Math.max(after, m.index - CONTEXT), m.index);
    after = m.index + m[0].length;
    const price = amount(m[2] ?? m[3]);
    if (price !== null) items.push({ title: "", about, price, currency: currencyOf(m[1] ?? m[4]) });
  }
  return items;
}

// The cheapest and dearest of some works.
function band(items: Item[]): MarketingPriceBandFind | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const [low, high] = [sorted[0], sorted[sorted.length - 1]];
  // A price found in the page's text has no name, only the words before
  // it — e.g. "… Medium: oil on linen Price:" — so it's named by up to
  // NAME_WORDS of them, without a "Price:" label at the end.
  const name = (i: Item) => {
    if (i.title) return i.title;
    const words = i.about
      .replace(/\b(price|prix|precio|prezzo|preis)\s*:?\s*$/i, "")
      .trim()
      .split(/\s+/);
    return (words.length > NAME_WORDS ? "… " : "") + words.slice(-NAME_WORDS).join(" ");
  };
  return {
    min: Math.round(low.price),
    max: Math.round(high.price),
    count: items.length,
    lowest: name(low),
    highest: name(high),
  };
}

const SOURCE = {
  shopify: "the shop's product list (Shopify)",
  woo: "the shop's product list (WooCommerce)",
  jsonLd: "the product details on the page",
  text: "the prices written on the page",
} as const;

// Finds a contact's price bands from its shop page or website.
export async function findPrices(contact: {
  shopUrl: string | null;
  website: string | null;
  country: string | null;
  priceCurrency: MarketingCurrency | null;
}): Promise<MarketingPriceFind> {
  const deadline = Date.now() + TIME_LIMIT_MS;
  const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
  const addresses = [contact.shopUrl, contact.website].filter((v): v is string => !!v?.trim()).map(withScheme);
  if (addresses.length === 0) return { found: false, reason: "No shop page or website." };

  let page: { url: string; body: string } | null = null;
  let problem = "";
  for (const address of [...new Set(addresses)]) {
    const res = await fetchPublicPage(address, deadline);
    if ("error" in res) problem = res.error;
    else if (res.status !== 200) problem = `The site answered ${res.status}.`;
    else {
      page = res;
      break;
    }
  }
  if (!page) return { found: false, reason: problem || "Couldn't read the site." };
  const { url, body } = page;

  const attempts: [keyof typeof SOURCE, () => Promise<Item[]> | Item[]][] = [];
  if (/cdn\.shopify\.com|Shopify\.shop\s*=/.test(body))
    attempts.push(["shopify", () => shopifyItems(url, body, deadline)]);
  if (/woocommerce/i.test(body)) attempts.push(["woo", () => wooItems(url, deadline)]);
  attempts.push(["jsonLd", () => jsonLdItems(body)], ["text", () => textItems(body)]);

  for (const [source, attempt] of attempts) {
    const items = (await attempt()).filter((i) => i.price >= MIN_PRICE && i.price <= MAX_PRICE);
    const counted = items.flatMap((i) => {
      const kind = kindOf(i);
      return kind ? [{ ...i, kind }] : [];
    });
    if (counted.length === 0) continue;

    // In the currency most of them are in — else the shop's usual one.
    const tally = new Map<MarketingCurrency, number>();
    counted.forEach((i) => i.currency && tally.set(i.currency, (tally.get(i.currency) ?? 0) + 1));
    const stated = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const currency = stated ?? contact.priceCurrency ?? countryCurrency(contact.country ?? "");
    if (!currency) return { found: false, reason: "Found prices, but couldn't tell their currency." };
    const inCurrency = counted.filter((i) => !stated || i.currency === stated || i.currency === null);

    return {
      found: true,
      source: SOURCE[source],
      url,
      currency,
      currencyAssumed: !stated,
      originals: band(inCurrency.filter((i) => i.kind === "ORIGINALS")),
      prints: band(inCurrency.filter((i) => i.kind === "PRINTS")),
    };
  }
  return {
    found: false,
    reason: Date.now() > deadline ? "The site was too slow." : "No prices shown on the shop page.",
  };
}
