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
// A page's link to one address: what it says, and every <a> to it (an
// artist is often linked from both their picture and their name).
type PageLink = { url: string; key: string; text: string; anchors: Element[] };

const MODEL = "claude-haiku-5-5";
// Reading the site, then Claude's answers, all inside the server's
// 30-second limit.
const FETCH_TIME_MS = 9000;
// Through the page-reading service, which opens pages in a browser.
const SERVICE_FETCH_TIME_MS = 15000;
const PICK_PAGE_TIME_MS = 6000;
// Claude's reading of the artists page gets what's left of the request's
// time (a long list of artists takes a while to answer).
const REQUEST_TIME_MS = 27000;
const MIN_PICK_TIME_MS = 8000;
const MIN_ARTISTS = 2;
// Fewer links than this outside a page's menu, header and footer means
// its list is probably in them.
const FEW_LINKS = 5;
// Pictures from artists' own pages: how many a request looks at, how
// many at once, and how often one picture may appear before it's taken
// for the site's logo rather than an artist's.
const PICTURES_PER_REQUEST = 24;
const PICTURES_AT_ONCE = 6;
const PICTURES_TIME_MS = 20000;
const LOGO_REPEATS = 3;
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
// A page in a Wix site's list of its pages.
const WIX_PAGE = /"title":"((?:[^"\\]|\\.)*)","pageUriSEO":"([^"\\/]+)"/g;

const plainText = (v: string) => v.replace(/\s+/g, " ").trim();
const parts = (url: URL) => url.pathname.split("/").filter(Boolean);
const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
const isTag = (n: unknown): n is Element => !!n && (n as Element).type === "tag";
// A link's address as one page: without "www.", its # part or a closing
// "/" — so castlefineart.com/x and www.castlefineart.com/x/ are one.
const linkKey = (url: URL) =>
  `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`;
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

// An artist's picture: in their link, else in the nearest wrapper around
// it — their card — going up no further than a wrapper that also links
// to another of the artists found (2026-11-07: Castle's cards also link
// to the artist's works, so "no other links" was too strict).
function artistImage(link: PageLink, otherArtists: Set<string>, base: string): string | null {
  for (const a of link.anchors) {
    const own = imageIn(a, base);
    if (own) return own;
    for (let n: Element = a, step = 0; step < CARD_DEPTH && isTag(n.parent); step++) {
      n = n.parent;
      const reachesOthers = anchors([n]).some((o) => {
        const u = urlOf(o.attribs.href, base);
        return !!u && otherArtists.has(linkKey(u));
      });
      if (reachesOthers) break;
      const image = imageIn(n, base);
      if (image) return image;
    }
  }
  return null;
}

// A page's links to other pages of the same site, outside its menu,
// header and footer (unless `withLayout`), one per address: what each
// says (its words, else its picture's description).
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
    const was = found.get(key) ?? { url: url.toString(), key, text: "", anchors: [] };
    found.set(key, { ...was, text: was.text || text || "", anchors: [...was.anchors, a] });
    if (found.size >= MAX_LINKS) break;
  }
  // Wix galleries open each artist from a picture grid by script, with no
  // link in the page — but the page carries the site's list of pages
  // ("title", then "pageUriSEO"), artists' among them (2026-11-07,
  // Galerie 337). Those are offered as links too, without pictures (the
  // artists' own pages give them — see fillArtistPictures).
  for (const m of html.matchAll(WIX_PAGE)) {
    if (found.size >= MAX_LINKS) break;
    const url = urlOf(`/${m[2]}`, pageUrl);
    if (!url) continue;
    const key = linkKey(url);
    if (key === here || found.has(key)) continue;
    let title = "";
    try {
      title = plainText(JSON.parse(`"${m[1]}"`)).slice(0, MAX_TEXT);
    } catch {}
    found.set(key, { url: url.toString(), key, text: title, anchors: [] });
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
  if (links.length === 0) return null;
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

// Claude says which of a page's links lead to one artist's own page;
// each artist's picture is then taken from the page.
async function pickArtists(links: PageLink[], base: string, timeout: number): Promise<MarketingFoundArtist[]> {
  if (links.length === 0) return [];
  const out = await askClaude(
    "You are given the numbered links of a page on an art gallery's website (number, link words, " +
      "address). List the links that lead to one individual artist's own page — the gallery's artists. " +
      "Leave out everything else: menus, navigation (Back, Next, View all), categories, mediums, price " +
      "bands, artworks, exhibitions, news, policies, contact, search, social media. When a link's words aren't already the artist's name " +
      "as normally written, give the name (e.g. 'JEAN MICHEL BASQUIAT' → 'Jean-Michel Basquiat', or " +
      "'View Artist' at /collections/alan-somers → 'Alan Somers'); otherwise give an empty name, to keep " +
      "the answer short. If no link is an artist, answer an empty list.",
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
              name: { type: "string", description: "The artist's name, or empty if the link words are it." },
            },
            required: ["link", "name"],
            additionalProperties: false,
          },
        },
      },
      required: ["artists"],
      additionalProperties: false,
    },
    timeout,
    6000,
  );
  const picked = new Map<string, { name: string; link: PageLink }>();
  for (const a of (Array.isArray(out?.artists) ? out.artists : []) as { link?: unknown; name?: unknown }[]) {
    const link = typeof a.link === "number" ? links[a.link] : undefined;
    const name = plainText((typeof a.name === "string" && a.name) || link?.text || "").slice(0, MAX_TEXT);
    if (link && name && !picked.has(link.key)) picked.set(link.key, { name, link });
  }
  const keys = new Set(picked.keys());
  return [...picked.values()].map(({ name, link }) => {
    const others = new Set([...keys].filter((k) => k !== link.key));
    return { name, url: link.url, image: artistImage(link, others, base) };
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
// A page that isn't there — reading it another way won't help.
const gone = (status: number) => status === 404 || status === 410;
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
  if (gone(home.status)) return { found: false, reason: `The website wasn't found (${home.status}).` };
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
  const started = Date.now();
  const read = pageReader(viaService, started + (viaService ? SERVICE_FETCH_TIME_MS : FETCH_TIME_MS));

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
    if (gone(res.status)) return { found: false, reason: `The artists page wasn't found (${res.status}).` };
    if (res.status !== 200) return { found: false, reason: `The artists page answered ${res.status}.`, tryHarder };
    try {
      const timeLeft = Math.max(MIN_PICK_TIME_MS, started + REQUEST_TIME_MS - Date.now());
      // Some sites list their artists in the menu only (Castle's is in
      // its header), so with hardly any links outside it, take the menu's.
      const outside = pageLinks(res.body, res.url);
      const links = outside.length >= FEW_LINKS ? outside : pageLinks(res.body, res.url, true);
      const artists = await pickArtists(links, res.url, timeLeft);
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

// The picture an artist's own page gives for sharing (og:image or
// twitter:image) — usually one of their works, or their portrait.
function sharingPicture(html: string, base: string): string | null {
  const doc = parseDocument(html);
  const meta = DomUtils.findAll((e) => e.name === "meta", doc.children).find((m) =>
    /^(og:image|og:image:url|twitter:image)$/i.test(m.attribs.property ?? m.attribs.name ?? ""),
  );
  const url = meta?.attribs.content ? urlOf(meta.attribs.content, base) : null;
  return url ? sharpImage(url) : null;
}

// Fills in pictures for artists the gallery's artists page showed none
// for, from each artist's own page — read directly, so it costs nothing.
// Looks at up to PICTURES_PER_REQUEST of them from `from` on; returns the
// artists and where to carry on, or null when done.
export async function fillArtistPictures(
  artists: MarketingFoundArtist[],
  from: number,
): Promise<{ artists: MarketingFoundArtist[]; next: number | null }> {
  const deadline = Date.now() + PICTURES_TIME_MS;
  const read = pageReader(false, deadline);
  const todo: number[] = [];
  let i = from;
  for (; i < artists.length && todo.length < PICTURES_PER_REQUEST; i++) if (!artists[i].image && artists[i].url) todo.push(i);
  const found = new Map<number, string>();
  for (let k = 0; k < todo.length; k += PICTURES_AT_ONCE) {
    if (Date.now() > deadline) {
      i = todo[k];
      break;
    }
    await Promise.all(
      todo.slice(k, k + PICTURES_AT_ONCE).map(async (j) => {
        const res = await read(artists[j].url!);
        if ("error" in res || res.status !== 200) return;
        const picture = sharingPicture(res.body, res.url);
        if (picture) found.set(j, picture);
      }),
    );
  }
  // One picture on several artists' pages is the site's own, not theirs.
  const counts = new Map<string, number>();
  for (const a of [...artists.map((x) => x.image), ...found.values()]) if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
  const updated = artists.map((a, j) => {
    const picture = found.get(j);
    return picture && (counts.get(picture) ?? 0) < LOGO_REPEATS ? { ...a, image: picture } : a;
  });
  return { artists: updated, next: i < artists.length ? i : null };
}
