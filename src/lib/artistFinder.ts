import { DomUtils, parseDocument } from "htmlparser2";
import { fetchPublicPage } from "@/lib/publicFetch";
import type { MarketingArtistFind, MarketingFoundArtist } from "@/lib/marketingContacts";

// Contacts → a gallery's artists (2026-11-07, Craig's request): reads the
// gallery's website and lists the artists it shows, each with a thumbnail
// and a link to their page there when it has them. Finds the artists page
// from the site's menu (a link called Artists / Artistes / Artisti /
// Artistas, or to a page of that name), then takes the links on it to
// each artist's own page (…/artists/jane-doe). A Shopify shop with no
// such page lists its works' artists (each product's vendor), with a work
// of theirs as the thumbnail. Only shown, not saved.

type Element = ReturnType<typeof DomUtils.findAll>[number];

const TIME_LIMIT_MS = 8000;
const MIN_ARTISTS = 3;
const MAX_ARTISTS = 200;
const MAX_PAGES_TRIED = 3;
const MAX_NAME = 60;
// How far up from an artist's link to look for its card's picture.
const CARD_DEPTH = 5;
const SHOPIFY_PAGES = 2;
const SHOPIFY_PAGE_SIZE = 250;

// A path part naming an artists page, in the site's languages.
const ARTISTS_PART =
  /^(our-|the-|gallery-|represented-|nos-|all-)?(artists?|artistes?|artisti|artistas|kunstler)(-list|-2)?(\.html?|\.php)?$/i;
// Menu wording for it.
const ARTISTS_TEXT = /^(our |the |gallery |all |nos |i nostri |nuestros )?(artists?|artistes?|artisti|artistas)$/i;
// Link wording that isn't a name.
const NOT_A_NAME =
  /^(view|see|read|discover|more|all|explore|en savoir|voir|scopri|ver|learn|shop|buy|next|previous|back|artists?|artistes?|artisti|artistas)\b/i;

const plainText = (v: string) => v.replace(/\s+/g, " ").trim();
const parts = (url: URL) => url.pathname.split("/").filter(Boolean);
const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");

function links(html: string, base: string) {
  const doc = parseDocument(html);
  return DomUtils.findAll((e) => e.name === "a" && !!e.attribs.href, doc.children).flatMap((a) => {
    try {
      const url = new URL(a.attribs.href, base);
      url.hash = "";
      return url.protocol.startsWith("http") ? [{ a, url }] : [];
    } catch {
      return [];
    }
  });
}

// An image address from an <img> (or lazy-loaded one), or a background.
function imageIn(a: Element, base: string): string | null {
  const img = DomUtils.findOne((e) => e.name === "img", [a]) as Element | null;
  const candidates = img
    ? [
        img.attribs["data-src"],
        img.attribs["data-lazy-src"],
        img.attribs["data-srcset"]?.split(/\s+/)[0],
        img.attribs.src,
        img.attribs.srcset?.split(/\s+/)[0],
      ]
    : [];
  const styled = DomUtils.findOne((e) => /background(-image)?\s*:[^;]*url\(/i.test(e.attribs.style ?? ""), [a], true);
  const bg = (styled as Element | null)?.attribs.style.match(/url\(\s*['"]?([^'")]+)/i)?.[1];
  for (const c of [...candidates, bg]) {
    if (!c || c.startsWith("data:")) continue;
    try {
      return new URL(c, base).toString();
    } catch {}
  }
  return null;
}

// What a link calls itself: its words, else its picture's or its own label.
function nameOf(a: Element) {
  const img = DomUtils.findOne((e) => e.name === "img", [a]) as Element | null;
  for (const v of [DomUtils.textContent(a), a.attribs.title, a.attribs["aria-label"], img?.attribs.alt]) {
    const name = plainText(v ?? "");
    if (name.length >= 3 && name.length <= MAX_NAME && !NOT_A_NAME.test(name)) return name;
  }
  return "";
}

// The site's artists page(s), best first: links in its menu.
function artistsPages(html: string, base: string): string[] {
  const home = new URL(base);
  const scored = links(html, base).flatMap(({ a, url }) => {
    if (!sameSite(url, home)) return [];
    const last = parts(url).at(-1) ?? "";
    const score = (ARTISTS_TEXT.test(plainText(DomUtils.textContent(a))) ? 2 : 0) + (ARTISTS_PART.test(last) ? 2 : 0);
    return score ? [{ url: url.toString(), score: score - parts(url).length * 0.1 }] : [];
  });
  return [...new Set(scored.sort((x, y) => y.score - x.score).map((s) => s.url))];
}

// The artists an artists page links to: links to a page one step under
// an artists path (…/artists/jane-doe), merged by address — a grid often
// links each artist twice, once from the picture and once from the name.
// A site whose artists' pages aren't under such a path (…/jane-doe) is
// read by its grid instead (artistsInGrid, 2026-11-07 — DTR Modern).
function artistsOn(html: string, pageUrl: string): MarketingFoundArtist[] {
  const under = artistsUnderPath(html, pageUrl);
  return under.length >= MIN_ARTISTS ? under : artistsInGrid(html, pageUrl);
}

function artistsUnderPath(html: string, pageUrl: string): MarketingFoundArtist[] {
  const page = new URL(pageUrl);
  const found = new Map<string, MarketingFoundArtist>();
  for (const { a, url } of links(html, pageUrl)) {
    if (!sameSite(url, page) || url.search) continue;
    const p = parts(url);
    const under = p.length >= 2 && ARTISTS_PART.test(p[p.length - 2]) && !/^(page|category|tag)$/i.test(p.at(-1)!);
    if (!under || url.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")) continue;
    const key = url.toString().replace(/\/$/, "");
    const was = found.get(key) ?? { name: "", url: key, image: null };
    found.set(key, { ...was, name: was.name || nameOf(a), image: was.image || imageIn(a, pageUrl) });
  }
  return [...found.values()].filter((f) => f.name).slice(0, MAX_ARTISTS);
}

// Shopify: each product's vendor (usually its artist), with a work's
// picture.
async function shopifyArtists(base: string, deadline: number): Promise<MarketingFoundArtist[]> {
  const origin = new URL(base).origin;
  const byVendor = new Map<string, MarketingFoundArtist>();
  for (let page = 1; page <= SHOPIFY_PAGES; page++) {
    const res = await fetchPublicPage(
      `${origin}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`,
      deadline,
      "application/json",
    );
    if ("error" in res || res.status !== 200) break;
    let products: { vendor?: string; images?: { src?: string }[] }[] = [];
    try {
      products = JSON.parse(res.body).products ?? [];
    } catch {
      break;
    }
    for (const p of products) {
      const name = plainText(p.vendor ?? "");
      if (!name || name.length > MAX_NAME || byVendor.has(name.toLowerCase())) continue;
      byVendor.set(name.toLowerCase(), {
        name,
        url: `${origin}/collections/vendors?q=${encodeURIComponent(name)}`,
        image: p.images?.[0]?.src ?? null,
      });
    }
    if (products.length < SHOPIFY_PAGE_SIZE) break;
  }
  // One vendor is the gallery itself, not its artists.
  return byVendor.size >= MIN_ARTISTS ? [...byVendor.values()].slice(0, MAX_ARTISTS) : [];
}

// A link's address as one page: without its # part or a closing "/".
const linkKey = (url: URL) => url.toString().replace(/\/$/, "");

const isTag = (n: unknown): n is Element => !!n && (n as Element).type === "tag";
const LAYOUT = /^(nav|header|footer)$/;

// The artists in a page's grid or list of cards: each card a link to one
// page of the site, usually with a picture. The cards are grouped by the
// element holding them, and the largest group is taken — the site's menu,
// header and footer aside.
function artistsInGrid(html: string, pageUrl: string): MarketingFoundArtist[] {
  const page = new URL(pageUrl);
  const here = page.pathname.replace(/\/$/, "");
  const groups = new Map<Element, Map<string, MarketingFoundArtist>>();
  for (const { a, url } of links(html, pageUrl)) {
    const path = url.pathname.replace(/\/$/, "");
    if (!sameSite(url, page) || url.search || !path || path === here) continue;
    let inLayout = false;
    for (let n = a.parent; isTag(n); n = n.parent) if (LAYOUT.test(n.name)) inLayout = true;
    if (inLayout) continue;

    // The card: the nearest wrapper with a picture, else the link's own.
    let card: Element = isTag(a.parent) ? a.parent : a;
    for (let n: Element = a, step = 0; step < CARD_DEPTH && isTag(n.parent); step++) {
      n = n.parent;
      if (DomUtils.findOne((e) => e.name === "img" || /url\(/i.test(e.attribs.style ?? ""), [n])) {
        card = n;
        break;
      }
    }
    if (!isTag(card.parent)) continue;
    // A card links to one page only — else it's a menu or a block of text.
    const key = linkKey(url);
    const others = DomUtils.findAll((e) => e.name === "a" && !!e.attribs.href, [card]).some((o) => {
      try {
        const u = new URL(o.attribs.href, pageUrl);
        u.hash = "";
        return linkKey(u) !== key;
      } catch {
        return false;
      }
    });
    if (others) continue;

    const group = groups.get(card.parent) ?? new Map<string, MarketingFoundArtist>();
    const was = group.get(key) ?? { name: "", url: key, image: null };
    group.set(key, { ...was, name: was.name || nameOf(a), image: was.image || imageIn(card, pageUrl) });
    groups.set(card.parent, group);
  }
  const largest = [...groups.values()]
    .map((g) => [...g.values()].filter((f) => f.name))
    .sort((x, y) => y.length - x.length)[0];
  return largest && largest.length >= MIN_ARTISTS ? largest.slice(0, MAX_ARTISTS) : [];
}

const byName = (a: MarketingFoundArtist, b: MarketingFoundArtist) => a.name.localeCompare(b.name);

// Finds a gallery's artists from its website (or shop page).
export async function findArtists(contact: {
  website: string | null;
  shopUrl: string | null;
}): Promise<MarketingArtistFind> {
  const deadline = Date.now() + TIME_LIMIT_MS;
  const withScheme = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
  const start = [contact.website, contact.shopUrl].find((v) => v?.trim());
  if (!start) return { found: false, reason: "No website." };

  const home = await fetchPublicPage(withScheme(start.trim()), deadline);
  if ("error" in home) return { found: false, reason: home.error };
  if (home.status !== 200) return { found: false, reason: `The site answered ${home.status}.` };

  // The shop page itself may be the artists page.
  const shop = contact.shopUrl?.trim() ? withScheme(contact.shopUrl.trim()) : null;
  const shopIsArtists = shop && ARTISTS_PART.test(parts(new URL(shop)).at(-1) ?? "");
  const pages = [...new Set([...(shopIsArtists ? [shop] : []), ...artistsPages(home.body, home.url)])];
  if (ARTISTS_PART.test(parts(new URL(home.url)).at(-1) ?? "")) pages.unshift(home.url);

  for (const pageUrl of pages.slice(0, MAX_PAGES_TRIED)) {
    const page = pageUrl === home.url ? home : await fetchPublicPage(pageUrl, deadline);
    if ("error" in page || page.status !== 200) continue;
    const artists = artistsOn(page.body, page.url);
    if (artists.length >= MIN_ARTISTS)
      return { found: true, source: "the gallery's artists page", url: page.url, artists: artists.sort(byName) };
  }

  if (/cdn\.shopify\.com|Shopify\.shop\s*=/.test(home.body)) {
    const artists = await shopifyArtists(home.url, deadline);
    if (artists.length)
      return { found: true, source: "the artists of the shop's works", url: home.url, artists: artists.sort(byName) };
  }
  return {
    found: false,
    reason: Date.now() > deadline ? "The site was too slow." : "Couldn't find a list of artists on the site.",
  };
}
