// "Import this ISYT site" (2026-10-26): reads a whole isendyouthis (ISYT)
// client website — every portfolio section in its menu, then every work's
// own page — and sends the chosen works to the artist's Hopper with their
// details in their own fields (title, description, type, medium, size,
// edition, sold, price, where it can be seen, portfolio section, and the
// work's address on the old site so it is never imported twice).
//
// The ISYT sites are server-built ASP.NET pages (no data API), all on the
// same template:
// - portfolio section: index.aspx?sectionid=N, linking to its works as
//   index.aspx?sectionid=N&productid=M
// - a work's page: .article-details — its picture, h3 title, and
//   .article-summary lines split by <br>: description, then usually type
//   ("Original" / "Limited Edition"), medium, size ("60cm x 44cm x 42cm"),
//   "Edition of 12", and on some sites "Sold", "Can be seen at …", a price
// - pictures: /images/_cached/<size>/<productid>.jpg, larger sizes only
//   where the site made them (720 is the largest seen), so a few are tried
//   largest first.
// Lines it can't place stay in the description, for checking in the Hopper.
(function () {
  const HOST_ID = "hopper-isyt-host";
  const OTHER_HOST_ID = "hopper-picker-host";
  const READ_AT_ONCE = 4;
  const PICTURE_SIZES = [1600, 1200, 1024, 960, 800, 720, 600, 500];

  // Activating again while open closes it (and the image picker, if open).
  document.getElementById(OTHER_HOST_ID)?.remove();
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    document.body.style.overflow = "";
    return;
  }

  const CSS = `
    #isyt-overlay { position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,.6);
      display: flex; align-items: center; justify-content: center;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; }
    #isyt-overlay * { box-sizing: border-box; }
    .panel { background: #fff; width: min(1200px, 94vw); height: min(88vh, 950px); border-radius: 10px;
      display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
      padding: 12px 16px; background: #111; color: #fff; }
    .title { font-weight: 700; font-size: 15px; }
    .artist { opacity: .75; font-size: 12px; margin-top: 2px; }
    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .controls button { background: #4f46e5; border: none; color: #fff; padding: 6px 12px; border-radius: 6px;
      cursor: pointer; font-weight: 600; font-size: 13px; }
    .controls button:disabled { opacity: .4; cursor: not-allowed; }
    #close { background: transparent; font-size: 16px; padding: 4px 8px; }
    .status { padding: 8px 16px; font-size: 12px; color: #555; background: #f7f7f7; border-bottom: 1px solid #eee; min-height: 16px; }
    .body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; background: #fafafa; }
    .section { margin-bottom: 22px; }
    .section-head { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 10px; }
    .section-head .count { font-weight: 400; color: #888; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .card { position: relative; display: flex; flex-direction: column; background: #fff; border-radius: 8px;
      overflow: hidden; border: 2px solid transparent; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
    .card.selected { border-color: #4f46e5; }
    .card.ok { border-color: #2ecc71; }
    .card.error { border-color: #e74c3c; }
    .card.known { opacity: .55; }
    .card input { position: absolute; top: 6px; left: 6px; width: 18px; height: 18px; z-index: 2; }
    .thumb { height: 150px; background: #eee center / contain no-repeat; }
    .info { padding: 6px 8px 8px; font-size: 11px; color: #666; }
    .info .name { font-size: 12px; font-weight: 600; color: #222; margin-bottom: 2px; }
    .info .flag { color: #b45309; }
    .version { padding: 6px 16px; font-size: 10px; color: #aaa; text-align: right; border-top: 1px solid #eee; }
  `;

  // ---------- reading the site ----------

  async function fetchDoc(url) {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch (e) {
      return null;
    }
  }

  const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

  // The portfolio sections, in menu order: [{ id, name }].
  function findSections(doc) {
    const seen = new Map();
    doc.querySelectorAll("a[href]").forEach((a) => {
      let u;
      try {
        u = new URL(a.getAttribute("href"), location.href);
      } catch (e) {
        return;
      }
      const id = u.searchParams.get("sectionid");
      if (!/index\.aspx$/i.test(u.pathname) || !id || u.searchParams.has("productid")) return;
      if (!seen.has(id)) seen.set(id, { id, name: clean(a.textContent) || `Section ${id}` });
    });
    return [...seen.values()];
  }

  // A section's works' product ids, in page order.
  function findProductIds(doc) {
    const ids = [];
    doc.querySelectorAll('a[href*="productid"]').forEach((a) => {
      const m = a.getAttribute("href").match(/productid=(\d+)/i);
      if (m && !ids.includes(m[1])) ids.push(m[1]);
    });
    return ids;
  }

  const TYPE_LINE = /^(original|limited edition|open edition)$/i;
  const SIZE_LINE = /^\d[\d.,]*\s*(cm|mm|m|in|inches|")?\s*[x×]\s*\d/i;
  const EDITION_LINE = /^edition of\b/i;
  const SOLD_LINE = /^sold\b/i;
  const SEEN_LINE = /^(can be )?(seen|viewed) at\b\s*:?\s*/i;
  const PRICE_LINE = /^(price\s*:?\s*)?[£€$]\s?(\d[\d,]*(\.\d{1,2})?)$/i;

  function summaryLines(el) {
    if (!el) return [];
    const copy = el.cloneNode(true);
    copy.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    copy.querySelectorAll('script, style, iframe, [class*="share"]').forEach((n) => n.remove());
    return copy.textContent.split("\n").map(clean).filter(Boolean);
  }

  // One work's page → its details.
  function parseWork(doc) {
    const details = doc.querySelector(".article-details");
    if (!details) return null;
    const work = {
      title: clean(details.querySelector("h3")?.textContent),
      picture: details.querySelector("img")?.getAttribute("src") || null,
      type: "",
      medium: "",
      size: "",
      edition: "",
      sold: /\bsold\b/i.test(details.className),
      viewingLocation: "",
      price: "",
      description: [],
    };
    let afterType = false;
    for (const line of summaryLines(details.querySelector(".article-summary"))) {
      const price = line.match(PRICE_LINE);
      if (TYPE_LINE.test(line) && !work.type) {
        work.type = line;
        afterType = true;
      } else if (SIZE_LINE.test(line) && !work.size) work.size = line;
      else if (EDITION_LINE.test(line) && !work.edition) work.edition = line;
      else if (SOLD_LINE.test(line) && line.length < 20) work.sold = true;
      else if (SEEN_LINE.test(line) && !work.viewingLocation) work.viewingLocation = line.replace(SEEN_LINE, "");
      else if (price && !work.price) work.price = price[2].replace(/,/g, "");
      else if (afterType && !work.medium) work.medium = line;
      else work.description.push(line);
    }
    work.description = work.description.join("\n");
    return work;
  }

  // Runs `task` over `items`, a few at a time, keeping the results in order.
  async function inPool(items, task) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        results[i] = await task(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(READ_AT_ONCE, items.length) }, worker));
    return results;
  }

  function pictureCandidates(productId, found) {
    const larger = PICTURE_SIZES.map((n) => new URL(`/images/_cached/${n}/${productId}.jpg`, location.href).toString());
    return found ? [...larger, new URL(found, location.href).toString()] : larger;
  }

  async function readSite(say) {
    const sections = findSections(document);
    const works = [];
    const taken = new Set(); // a work in two sections is imported once, in the first
    for (let s = 0; s < sections.length; s++) {
      const section = sections[s];
      say(`Reading section ${s + 1} of ${sections.length}: ${section.name}…`);
      const sectionUrl = new URL(`/index.aspx?sectionid=${section.id}`, location.href).toString();
      const doc = await fetchDoc(sectionUrl);
      const ids = doc ? findProductIds(doc).filter((id) => !taken.has(id)) : [];
      ids.forEach((id) => taken.add(id));
      section.works = [];
      let done = 0;
      const read = await inPool(ids, async (productId) => {
        const sourceUrl = new URL(
          `/index.aspx?sectionid=${section.id}&productid=${productId}`,
          location.href
        ).toString();
        const page = await fetchDoc(sourceUrl);
        done++;
        say(`Reading ${section.name}: work ${done} of ${ids.length}…`);
        const work = page && parseWork(page);
        if (!work) return null;
        return {
          ...work,
          productId,
          sourceUrl,
          portfolio: section.name,
          thumb: work.picture ? new URL(work.picture, location.href).toString() : null,
          candidates: pictureCandidates(productId, work.picture),
        };
      });
      section.works = read.filter(Boolean);
      works.push(...section.works);
    }
    return { sections, works };
  }

  // ---------- panel ----------

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function detailLine(w) {
    return [w.type, w.medium, w.size, w.edition, w.price && `£${w.price}`].filter(Boolean).join(" · ");
  }

  function buildPanel(shadow, artistName) {
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);
    const overlay = document.createElement("div");
    overlay.id = "isyt-overlay";
    overlay.innerHTML = `
      <div class="panel">
        <div class="header">
          <div>
            <div class="title">Import this ISYT site</div>
            <div class="artist">${artistName ? `Importing for: ${escapeHtml(artistName)}` : "No artist selected"}</div>
          </div>
          <div class="controls">
            <button id="all" disabled>Select all</button>
            <button id="none" disabled>Deselect all</button>
            <span id="count"></span>
            <button id="send" disabled>Send to Hopper</button>
            <button id="close" title="Close">✕</button>
          </div>
        </div>
        <div id="status" class="status"></div>
        <div id="body" class="body"></div>
        <div class="version">extension v${chrome.runtime.getManifest().version}</div>
      </div>`;
    shadow.appendChild(overlay);
    document.body.style.overflow = "hidden";
    overlay.querySelector("#close").addEventListener("click", () => {
      document.getElementById(HOST_ID)?.remove();
      document.body.style.overflow = "";
    });
    return overlay;
  }

  function renderWorks(overlay, sections, known, token) {
    const body = overlay.querySelector("#body");
    const status = overlay.querySelector("#status");
    const countEl = overlay.querySelector("#count");
    const sendBtn = overlay.querySelector("#send");
    const selected = new Set();
    const cards = new Map(); // work → card
    const all = [];

    const update = () => {
      countEl.textContent = `${selected.size} of ${all.length} selected`;
      sendBtn.disabled = selected.size === 0 || !token;
    };
    const choose = (work, on) => {
      const card = cards.get(work);
      card.querySelector("input").checked = on;
      card.classList.toggle("selected", on);
      if (on) selected.add(work);
      else selected.delete(work);
    };

    sections.forEach((section) => {
      if (!section.works.length) return;
      const wrap = document.createElement("div");
      wrap.className = "section";
      const fresh = section.works.filter((w) => !known.has(w.sourceUrl)).length;
      wrap.innerHTML = `
        <label class="section-head"><input type="checkbox" ${fresh ? "checked" : ""}>
          ${escapeHtml(section.name)} <span class="count">${section.works.length} works${
            fresh < section.works.length ? `, ${section.works.length - fresh} already in Jevca` : ""
          }</span></label>
        <div class="grid"></div>`;
      const grid = wrap.querySelector(".grid");
      section.works.forEach((w) => {
        all.push(w);
        const isKnown = known.has(w.sourceUrl);
        const card = document.createElement("label");
        card.className = `card${isKnown ? " known" : ""}`;
        card.innerHTML = `
          <input type="checkbox">
          <div class="thumb" style="background-image:url('${(w.thumb || "").replace(/'/g, "\\'")}')"></div>
          <div class="info">
            <div class="name">${escapeHtml(w.title || "Untitled")}</div>
            <div>${escapeHtml(detailLine(w))}</div>
            ${w.sold ? `<div class="flag">Sold</div>` : ""}
            ${isKnown ? `<div class="flag">Already in Jevca</div>` : ""}
          </div>`;
        card.title = [w.title, w.description, detailLine(w), w.viewingLocation && `Can be seen at ${w.viewingLocation}`]
          .filter(Boolean)
          .join("\n\n");
        cards.set(w, card);
        card.querySelector("input").addEventListener("change", (e) => {
          choose(w, e.target.checked);
          update();
        });
        grid.appendChild(card);
        choose(w, !isKnown);
      });
      wrap.querySelector(".section-head input").addEventListener("change", (e) => {
        section.works.forEach((w) => choose(w, e.target.checked));
        update();
      });
      body.appendChild(wrap);
    });

    const allBtn = overlay.querySelector("#all");
    const noneBtn = overlay.querySelector("#none");
    allBtn.disabled = noneBtn.disabled = false;
    allBtn.addEventListener("click", () => {
      all.forEach((w) => choose(w, true));
      update();
    });
    noneBtn.addEventListener("click", () => {
      all.forEach((w) => choose(w, false));
      update();
    });

    let sending = [];
    sendBtn.addEventListener("click", () => {
      sending = all.filter((w) => selected.has(w)); // in the site's order
      const images = sending.map((w) => ({
        url: w.thumb,
        candidates: w.candidates,
        filename: `${w.productId}.jpg`,
        caption: w.title,
        description: w.description,
        source: "Website import",
        details: {
          artworkType: w.type || undefined,
          artworkMedium: w.medium || undefined,
          artworkSize: w.size || undefined,
          artworkEdition: w.edition || undefined,
          artworkSold: w.sold || undefined,
          artworkViewingLocation: w.viewingLocation || undefined,
          artworkPrice: w.price || undefined,
          artworkPortfolio: w.portfolio,
          sourceUrl: w.sourceUrl,
        },
      }));
      sendBtn.disabled = true;
      status.textContent = `Sending 1 of ${images.length}…`;
      chrome.runtime.sendMessage({ type: "SEND_TO_HOPPER", images, token });
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "HOPPER_PROGRESS") {
        const work = sending[message.index];
        status.textContent = `${message.index + 1} of ${message.total}: ${work?.title || message.filename} ${
          message.ok ? "✔" : `✖ (${message.error})`
        }`;
        if (work) {
          const card = cards.get(work);
          card.classList.add(message.ok ? "ok" : "error");
          if (message.ok) {
            known.add(work.sourceUrl);
            choose(work, false);
            card.classList.add("known");
          }
        }
      }
      if (message.type === "HOPPER_DONE") {
        status.textContent += " — All done!";
        update();
      }
    });

    update();
  }

  async function run() {
    const { activeArtist } = await chrome.storage.local.get("activeArtist");
    const token = activeArtist?.hopperToken || null;
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
    const overlay = buildPanel(host.attachShadow({ mode: "open" }), activeArtist?.name);
    const status = overlay.querySelector("#status");
    const say = (text) => (status.textContent = text);

    if (!token) return say("No artist selected — open the extension, pick an artist, then try again.");
    if (!findSections(document).length) {
      return say("This doesn't look like an ISYT site — no portfolio sections in its menu. Open the site's home page and try again.");
    }

    const { sections, works } = await readSite(say);
    if (!works.length) return say("No works found in this site's portfolio sections.");

    say("Checking which works are already in Jevca…");
    const answer = await chrome.runtime.sendMessage({
      type: "KNOWN_SOURCES",
      token,
      sourceUrls: works.map((w) => w.sourceUrl),
    });
    if (answer?.error) return say(`Couldn't check Jevca: ${answer.error}`);
    const known = new Set(answer.known);

    const withWorks = sections.filter((s) => s.works.length).length;
    say(
      `Found ${works.length} works in ${withWorks} sections` +
        (known.size ? `, ${known.size} already in Jevca (not ticked).` : ".") +
        " Hover a work to see all its details."
    );
    renderWorks(overlay, sections, known, token);
  }

  run();
})();
