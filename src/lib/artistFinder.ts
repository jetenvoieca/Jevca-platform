import Anthropic from "@anthropic-ai/sdk";
import { DomUtils, parseDocument } from "htmlparser2";
import { readJson } from "@/lib/claudeJson";
import { pageReader, pageServiceAvailable, type PageReader } from "@/lib/publicFetch";
import type { MarketingArtistFind, MarketingArtistsPage, MarketingFoundArtist } from "@/lib/marketingContacts";

// Contacts → a gallery's artists (2026-11-07, Craig's request): reads the
// gallery's website and lists the artists it shows, each with a thumbnail
// and a link to their page there when it has them. Only shown, not saved.
//
// Finds the artists page from the site's menu (a link called Artists /
// Artistes / Artisti / Artistas, or to a page of that name) — or, when
// there's none, Claude picks it from the home page's links. Every site
// lays its artists out differently, so Claude then reads the links on
// that page and says which lead to an artist (2026-11-07 — matching
// patterns missed many sites and took menus for artists). The links and
// pictures shown are always the page's own, never made up. A Shopify shop
// with no artists page lists its works' artists (each product's vendor),
// with a work of theirs as the thumbnail.
//
// Two steps, each its own request to stay inside the server's time
// limit: find the artists page, then read it. Either can be done again
// through the page-reading service when reading the site directly fails
// (see publicFetch.ts).

type Element = ReturnType<typeof DomUtils.findAll>[number];
type PageLink = { url: string; text: string; image: string | null };

const MODEL = "claude-haiku-5-5";
// Reading the site, then Claude's answers, all inside the server's
// 30-second limit.
const FETCH_TIME_MS = 9000;
// Through the page-reading service, which opens pages in a browser.
const SERVICE_FETCH_TIME_MS = 15000;
const PICK_PAGE_TIME_MS = 6000;
const PICK_ARTISTS_TIME_MS = 12000;
const MIN_ARTISTS = 2;
const MAX_ARTISTS = 200;
const MAX_LINKS = 400;
const MAX_TEXT = 80;
// How far up from a link to look for its card's picture — the search
// stops sooner at a wrapper holding links elsewhere. Squarespace image
// cards put the picture 6 levels above the button (2026-11-07, Cameron).
const CARD_DEPTH = 10;
const SHOPIFY_PAGES = 2;
const SHOPIFY_PAGE_SIZE = 250;

// A path part naming an artists page, in the site's languages.
const ARTISTS_PART =
  /^(our-|the-|gallery-|represented-|nos-|all-)?(artists?|artistes?|artisti|artistas|kunstler)(-list|-2)?(\.html?|\.php)?$/i;
// Menu wording for it.
const ARTISTS_TEXT = /^(our |the |gallery |all |nos |i nostri |nuestros )?(artists?|artistes?|artisti|artistas)$/i;
const LAYOUT = /^(nav|header|footer)$/;

const plainText = (v: string) => v.replace(/\s+/g, " ").trim();
const parts = (url: URL) => url.pathname.split("/").filter(Boolean);
const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
const isTag = (n: unknown): n is Element => !!n && (n as Element).type === "tag";
// A link's address as one page: without its # part or a closing "/".
const linkKey = (url: URL) => url.toString().replace(/\/$/, "");
const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

function urlOf(href: string, base: string): URL | null {
  try {
    const url = new URL(href, base);
    url.hash = "";
    return url.protocol.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

const anchors = (nodes: Parameters<typeof DomUtils.findAll>[1]) => DomUtils.findAll((e) => e.name === "a" && !!e.attribs.href, nodes);

// Wix pages load each picture first as a tiny blurred stand-in
// (…/v1/fill/w_147,h_191,…,blur_2,…/name.jpg) and sharpen it with
// scripts, so ask Wix for a sharp square thumbnail instead (2026-11-07,
// Carina Haslam).
const THUMB_PX = 480;
function sharpImage(url: URL): string {
  if (url.hostname === "static.wixstatic.com")
    url.pathname = url.pathname.replace(/\/v1\/[a-z]+\/[^/]+\//, `/v1/fill/w_${THUMB_PX},h_${THUMB_PX},al_c,q_85/`);
  return url.toString();
}

// An image address from an <img> (or lazy-loaded one), or a background.
function imageIn(node: Element, base: string): string | null {
  const img = DomUtils.findOne((e) => e.name === "img", [node]);
  const candidates = img
    ? [
        img.attribs["data-src"],
        img.attribs["data-lazy-src"],
        img.attribs["data-srcset"]?.split(/\s+/)[0],
        img.attribs.src,
        img.attribs.srcset?.split(/\s+/)[0],
      ]
    : [];
  const styled = DomUtils.findOne((e) => /background(-image)?\s*:[^;]*url\(/i.test(e.attribs.style ?? ""), [node]);
  const bg = styled?.attribs.style.match(/url\(\s*['"]?([^'")]+)/i)?.[1];
  for (const c of [...candidates, bg]) {
    if (!c || c.startsWith("data:")) continue;
    const url = urlOf(c, base);
    if (url) return sharpImage(url);
  }
  return null;
}

// The picture beside a link: in the nearest wrapper holding a picture and
// no link to anywhere else (a card), else in the link itself.
function cardImage(a: Element, key: string, base: string): string | null {
  for (let n: Element = a, step = 0; step < CARD_DEPTH && isTag(n.parent); step++) {
    n = n.parent;
    const elsewhere = anchors([n]).some((o) => {
      const u = urlOf(o.attribs.href, base);
      return u && linkKey(u) !== key;
    });
    if (elsewhere) break;
    const image = imageIn(n, base);
    if (image) return image;
  }
  return imageIn(a, base);
}

// A page's links to other pages of the same site, outside its menu,
// header and footer, one per address: what each says (its words, else
// its picture's description) and the picture beside it.
function pageLinks(html: string, pageUrl: string, withLayout = false): PageLink[] {
  const page = new URL(pageUrl);
  const here = linkKey(page);
  const found = new Map<string, PageLink>();
  for (const a of anchors(parseDocument(html).children)) {
    const url = urlOf(a.attribs.href, pageUrl);
    if (!url || !sameSite(url, page) || linkKey(url) === here) continue;
    if (!withLayout) {
      let inLayout = false;
      for (let n = a.parent; isTag(n); n = n.parent) if (LAYOUT.test(n.name)) inLayout = true;
      if (inLayout) continue;
    }
    const key = linkKey(url);
    const img = DomUtils.findOne((e) => e.name === "img", [a]);
    const text = [DomUtils.textContent(a), a.attribs.title, a.attribs["aria-label"], img?.attribs.alt]
      .map((v) => plainText(v ?? ""))
      .find(Boolean)
      ?.slice(0, MAX_TEXT);
    const was = found.get(key) ?? { url: key, text: "", image: null };
    found.set(key, {
      ...was,
      text: was.text || text || "",
      image: was.image || (withLayout ? null : cardImage(a, key, pageUrl)),
    });
    if (found.size >= MAX_LINKS) break;
  }
  return [...found.values()];
}

// The site's artists page(s) from its menu, best first.
function artistsPages(links: PageLink[]): string[] {
  return links
    .map((l) => {
      const last = parts(new URL(l.url)).at(-1) ?? "";
      const score = (ARTISTS_TEXT.test(l.text) ? 2 : 0) + (ARTISTS_PART.test(last) ? 2 : 0);
      return { url: l.url, score: score - parts(new URL(l.url)).length * 0.1 };
    })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((s) => s.url);
}

// The links as numbered lines for Claude: "3  Jane Doe  /artists/jane-doe".
const listed = (links: PageLink[]) =>
  links.map((l, i) => `${i}\t${l.text || "(no words)"}\t${new URL(l.url).pathname}`).join("\n");

async function askClaude(
  system: string,
  content: string,
  schema: Record<string, unknown>,
  timeout: number,
  maxTokens: number,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing.");
  const client = new Anthropic({ apiKey, timeout, maxRetries: 0 });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });
  return readJson(response);
}

// Claude picks the site's artists page from its home page's links, if any.
async function pickArtistsPage(links: PageLink[]): Promise<string | null> {
  const out = await askClaude(
    "You are given the numbered links of an art gallery's home page (number, link words, address). " +
      "Pick the one leading to the page listing the gallery's artists (often called Artists, Artistes, " +
      "Artisti, Artistas, Our artists, Represented artists). If there is none, answer -1.",
    listed(links),
    {
      type: "object",
      properties: { link: { type: "integer", description: "The link's number, or -1." } },
      required: ["link"],
      additionalProperties: false,
    },
    PICK_PAGE_TIME_MS,
    50,
  );
  const i = typeof out?.link === "number" ? out.link : -1;
  return links[i]?.url ?? null;
}

// Claude says which of a page's links lead to one artist's own page.
async function pickArtists(links: PageLink[]): Promise<MarketingFoundArtist[]> {
  const out = await askClaude(
    "You are given the numbered links of a page on an art gallery's website (number, link words, " +
      "address). List the links that lead to one individual artist's own page — the gallery's artists. " +
      "Leave out everything else: menus, categories, mediums, price bands, artworks, exhibitions, news, " +
      "policies, contact, search, social media. Give each artist's name as normally written (e.g. " +
      "'JEAN MICHEL BASQUIAT' → 'Jean-Michel Basquiat'), worked out from the link words or address. " +
      "If no link is an artist, answer an empty list.",
    listed(links),
    {
      type: "object",
      properties: {
        artists: {
          type: "array",
          items: {
            type: "object",
            properties: {
              link: { type: "integer", description: "The link's number." },
              name: { type: "string", description: "The artist's name." },
            },
            required: ["link", "name"],
            additionalProperties: false,
          },
        },
      },
      required: ["artists"],
      additionalProperties: false,
    },
    PICK_ARTISTS_TIME_MS,
    6000,
  );
  const seen = new Set<string>();
  return (Array.isArray(out?.artists) ? out.artists : []).flatMap((a: { link?: unknown; name?: unknown }) => {
    const link = typeof a.link === "number" ? links[a.link] : undefined;
    const name = typeof a.name === "string" ? plainText(a.name).slice(0, MAX_TEXT) : "";
    if (!link || !name || seen.has(link.url)) return [];
    seen.add(link.url);
    return [{ name, url: link.url, image: link.image }];
  });
}

// Shopify: each product's vendor (usually its artist), with a work's
// picture.
async function shopifyArtists(base: string, read: PageReader): Promise<MarketingFoundArtist[]> {
  const origin = new URL(base).origin;
  const byVendor = new Map<string, MarketingFoundArtist>();
  for (let page = 1; page <= SHOPIFY_PAGES; page++) {
    const res = await read(`${origin}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`, "application/json");
    if ("error" in res || res.status !== 200) break;
    let products: { vendor?: string; images?: { src?: string }[] }[] = [];
    try {
      products = JSON.parse(res.body).products ?? [];
    } catch {
      break;
    }
    for (const p of products) {
      const name = plainText(p.vendor ?? "");
      if (!name || name.length > MAX_TEXT || byVendor.has(name.toLowerCase())) continue;
      byVendor.set(name.toLowerCase(), {
        name,
        url: `${origin}/collections/vendors?q=${encodeURIComponent(name)}`,
        image: p.images?.[0]?.src ?? null,
      });
    }
    if (products.length < SHOPIFY_PAGE_SIZE) break;
  }
  // One vendor is the gallery itself, not its artists.
  return byVendor.size >= 3 ? [...byVendor.values()] : [];
}

const byName = (a: MarketingFoundArtist, b: MarketingFoundArtist) => a.name.localeCompare(b.name);
const found = (source: string, url: string, artists: MarketingFoundArtist[]): MarketingArtistFind => ({
  found: true,
  source,
  url,
  artists: artists.slice(0, MAX_ARTISTS).sort(byName),
});
const isShopify = (html: string) => /cdn\.shopify\.com|Shopify\.shop\s*=/.test(html);
const isArtistsPage = (u: string) => ARTISTS_PART.test(parts(new URL(u)).at(-1) ?? "");

type Site = { website: string | null; shopUrl: string | null };
const siteAddresses = (c: Site) =>
  [c.website, c.shopUrl].filter((v): v is string => !!v?.trim()).map((v) => withScheme(v.trim()));

// Step 1: where the gallery's artists page is — the shop page or home
// page when it is one, else the menu's, else Claude's pick from the home
// page's links. None, on a Shopify shop, means its works' artists.
export async function findArtistsPage(contact: Site, viaService = false): Promise<MarketingArtistsPage> {
  const [start] = siteAddresses(contact);
  if (!start) return { found: false, reason: "No website." };
  const tryHarder = !viaService && pageServiceAvailable();
  const read = pageReader(viaService, Date.now() + (viaService ? SERVICE_FETCH_TIME_MS : FETCH_TIME_MS));

  const home = await read(start);
  if ("error" in home) return { found: false, reason: home.error, tryHarder };
  if (home.status !== 200) return { found: false, reason: `The site answered ${home.status}.`, tryHarder };
  const shopify = isShopify(home.body);
  const shop = contact.shopUrl?.trim() ? withScheme(contact.shopUrl.trim()) : null;
  const homeLinks = pageLinks(home.body, home.url, true);
  let pageUrl: string | null =
    [home.url, shop].find((u) => u && isArtistsPage(u)) ?? artistsPages(homeLinks)[0] ?? null;
  if (!pageUrl) {
    try {
      pageUrl = await pickArtistsPage(homeLinks);
    } catch (err) {
      console.log("[findArtistsPage]", err);
      return { found: false, reason: "Couldn't read the site's menu just now — try again." };
    }
  }
  if (!pageUrl && !shopify)
    return { found: false, reason: "Couldn't find an artists page on the site.", tryHarder };
  return { found: true, pageUrl, shopify };
}

// Step 2: the artists on that page, as Claude reads its links — or, on a
// Shopify shop without them, its works' artists. The page must be on the
// gallery's own site.
export async function readArtists(
  contact: Site,
  pageUrl: string | null,
  shopify: boolean,
  viaService = false,
): Promise<MarketingArtistFind> {
  const sites = siteAddresses(contact).map((a) => new URL(a));
  const tryHarder = !viaService && pageServiceAvailable();
  const read = pageReader(viaService, Date.now() + (viaService ? SERVICE_FETCH_TIME_MS : FETCH_TIME_MS));

  if (pageUrl) {
    let page: URL;
    try {
      page = new URL(pageUrl);
    } catch {
      return { found: false, reason: "Not a web address." };
    }
    if (!sites.some((s) => sameSite(s, page))) return { found: false, reason: "That page isn't on the gallery's site." };
    const res = await read(page.toString());
    if ("error" in res) return { found: false, reason: res.error, tryHarder };
    if (res.status !== 200) return { found: false, reason: `The artists page answered ${res.status}.`, tryHarder };
    try {
      const artists = await pickArtists(pageLinks(res.body, res.url));
      if (artists.length >= MIN_ARTISTS) return found("the gallery's artists page", res.url, artists);
    } catch (err) {
      console.log("[readArtists]", err);
      return { found: false, reason: "Couldn't read the site's artists just now — try again." };
    }
  }
  if (shopify && sites[0]) {
    const artists = await shopifyArtists(sites[0].toString(), read);
    if (artists.length) return found("the artists of the shop's works", sites[0].toString(), artists);
  }
  return { found: false, reason: "Couldn't find a list of artists on the site.", tryHarder };
}
