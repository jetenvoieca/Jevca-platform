(function () {
  const MIN_SIZE = 120; // ignore icons, logos, tracking pixels, etc.
  const HOST_ID = "hopper-picker-host";

  // Re-activating while the picker is open just closes it (and closes
  // "Import this ISYT site", isyt.js, if that's open).
  document.getElementById("hopper-isyt-host")?.remove();
  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) {
    existingHost.remove();
    document.body.style.overflow = "";
    return;
  }

  const PICKER_CSS = `
    #hopper-picker-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #hopper-picker-overlay, #hopper-picker-overlay * {
      box-sizing: border-box;
    }
    .hi-panel {
      background: #fff;
      width: min(1200px, 94vw);
      height: min(88vh, 950px);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    }
    .hi-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #111;
      color: #fff;
      flex-wrap: wrap;
      gap: 8px;
    }
    .hi-title { font-weight: 700; font-size: 15px; }
    .hi-artist { opacity: 0.75; font-size: 12px; margin-top: 2px; }
    .hi-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .hi-controls button {
      background: #4f46e5;
      border: none;
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
    }
    .hi-controls button:disabled { opacity: 0.4; cursor: not-allowed; }
    #hi-close { background: transparent; font-size: 16px; padding: 4px 8px; }
    #hi-count { opacity: 0.85; font-size: 13px; }
    .hi-status {
      padding: 8px 16px;
      font-size: 12px;
      color: #555;
      background: #f7f7f7;
      border-bottom: 1px solid #eee;
      min-height: 16px;
    }
    .hi-grid {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      grid-auto-rows: 180px;
      gap: 18px;
      background: #fafafa;
    }
    .hi-card {
      position: relative;
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      border: 2px solid transparent;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      height: 180px;
    }
    .hi-card .hi-thumb {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      background-size: cover;
      background-position: center;
      background-color: #eee;
    }
    .hi-card-name {
      flex: 0 0 auto;
      font-size: 10px;
      padding: 4px 6px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hi-card input[type="checkbox"] {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 18px;
      height: 18px;
      z-index: 2;
    }
    .hi-card-meta {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0,0,0,0.55);
      color: #fff;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    .hi-card.hi-selected { border-color: #4f46e5; }
    .hi-card-ok { border-color: #2ecc71; }
    .hi-card-error { border-color: #e74c3c; }
    .hi-version {
      padding: 6px 16px;
      font-size: 10px;
      color: #aaa;
      text-align: right;
      border-top: 1px solid #eee;
    }
  `;

  // ---------- image discovery ----------

  function getFullResUrl(img) {
    let url = null;
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((s) => s.trim())
        .map((entry) => {
          const parts = entry.split(" ").filter(Boolean);
          const width = parseInt((parts[1] || "").replace("w", ""), 10) || 0;
          return { src: parts[0], width };
        });
      candidates.sort((a, b) => b.width - a.width);
      if (candidates.length) url = candidates[0].src;
    }
    if (!url) url = img.getAttribute("data-src") || img.currentSrc || img.src;
    if (url && url.startsWith("//")) url = "https:" + url;
    if (url) url = url.replace(/([?&])width=\d+/, "$1width=2048"); // helps on Shopify-style sites
    return url;
  }

  function filenameFromUrl(url, altText) {
    try {
      const u = new URL(url, location.href);
      let base = u.pathname.split("/").pop();
      if (!base || base.length < 5) base = "image.jpg";
      return base;
    } catch (e) {
      return (altText || "image").replace(/\s+/g, "-") + ".jpg";
    }
  }

  // Two different <img> tags (e.g. a "hover swap" image, or a hidden
  // quick-view duplicate) often point at the exact same underlying photo,
  // just at a different crop/size variant, with a different URL. This
  // strips the size-variant suffix and query string so those collapse
  // into a single entry instead of being counted 2-3x.
  function normaliseKey(url) {
    try {
      const u = new URL(url, location.href);
      let path = u.pathname.replace(/_(?:\d+x\d*|\d*x\d+)(?=\.[a-zA-Z0-9]+$)/, "");
      return u.origin + path;
    } catch (e) {
      return url;
    }
  }

  function isProbablyContent(img) {
    return !img.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]');
  }

  function isLargeEnough(img) {
    const w = img.naturalWidth || parseInt(img.getAttribute("width"), 10) || img.width || 0;
    const h = img.naturalHeight || parseInt(img.getAttribute("height"), 10) || img.height || 0;
    if (w && h) return w >= MIN_SIZE && h >= MIN_SIZE;
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset && /\b(\d{3,4})w\b/.test(srcset)) return true;
    return true;
  }

  // ---------- best-effort per-image Name/Description detection ----------
  //
  // Purely a convenience prefill for the Hopper's own Caption/
  // Description fields — every item still lands in the Hopper queue to
  // be sorted normally, so a missed or wrong guess here costs nothing
  // beyond a quick edit there afterwards. Deliberately bounded in length
  // so a too-broad selector match can't flood the field.
  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  // Like textOf, but keeps <br>-separated lines as real line breaks
  // (many sites put dimensions/medium/edition each on their own line)
  // and strips out share-button widgets that sometimes live inside the
  // same details block as the description.
  function multilineTextOf(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    clone.querySelectorAll('script, style, iframe, [class*="share"]').forEach((n) => n.remove());
    return (clone.textContent || "")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // The container that holds both the image and its own name/description
  // — covers common patterns like "article-details", "product-item",
  // schema.org itemscope blocks, and plain figure/list-item wrappers.
  function findItemContainer(img) {
    return (
      img.closest(
        '[class*="detail"], [class*="item"], [class*="product"], article, [itemscope], figure, li, .card'
      ) || img.parentElement
    );
  }

  function extractMeta(img) {
    const container = findItemContainer(img);

    const heading = container?.querySelector("h1, h2, h3, h4, [itemprop='name']");
    const figcaption = img.closest("figure")?.querySelector("figcaption");

    let caption =
      textOf(heading) ||
      textOf(figcaption) ||
      (img.getAttribute("alt") || "").trim() ||
      (img.getAttribute("title") || "").trim();

    const descEl = container?.querySelector(
      '[itemprop="description"], [class*="summary"], [class*="description"]'
    );
    let description = multilineTextOf(descEl);

    if (caption.length > 200) caption = caption.slice(0, 200);
    if (description.length > 1500) description = description.slice(0, 1500);

    return { caption, description };
  }

  function collectTilesFromDoc(doc) {
    const imgs = Array.from(doc.querySelectorAll("img"));
    const tiles = [];
    imgs.forEach((img) => {
      if (img.src && img.src.startsWith("data:")) return;
      if (!isProbablyContent(img)) return;
      if (!isLargeEnough(img)) return;
      const url = getFullResUrl(img);
      if (!url || url.startsWith("data:")) return;
      const { caption, description } = extractMeta(img, doc);
      tiles.push({
        url,
        filename: filenameFromUrl(url, img.alt),
        key: normaliseKey(url),
        caption,
        description,
      });
    });
    return tiles;
  }

  // ---------- pagination ----------

  function detectPaginationPages(doc) {
    const nums = new Set();
    doc.querySelectorAll("a[href]").forEach((a) => {
      try {
        const u = new URL(a.getAttribute("href"), location.href);
        const p = u.searchParams.get("page");
        if (p && /^\d+$/.test(p)) nums.add(parseInt(p, 10));
      } catch (e) {}
    });
    const curPage = parseInt(new URL(location.href).searchParams.get("page") || "1", 10);
    nums.add(curPage);
    return Array.from(nums).sort((a, b) => a - b);
  }

  function buildPageUrl(pageNum) {
    const u = new URL(location.href);
    u.searchParams.set("page", pageNum);
    return u.toString();
  }

  async function fetchDoc(url) {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return null;
      const html = await res.text();
      return new DOMParser().parseFromString(html, "text/html");
    } catch (e) {
      return null;
    }
  }

  async function scanAllTiles(onProgress) {
    const curPage = parseInt(new URL(location.href).searchParams.get("page") || "1", 10);
    const pages = detectPaginationPages(document);
    const tilesMap = new Map();

    for (const p of pages) {
      onProgress(`Scanning page ${p} of ${pages[pages.length - 1]}\u2026`);
      const doc = p === curPage ? document : await fetchDoc(buildPageUrl(p));
      if (!doc) continue;
      collectTilesFromDoc(doc).forEach((t) => {
        if (!tilesMap.has(t.key)) tilesMap.set(t.key, t);
      });
    }

    let nextPage = Math.max(...pages) + 1;
    let safety = 40;
    while (safety-- > 0) {
      onProgress(`Checking for page ${nextPage}\u2026`);
      const doc = await fetchDoc(buildPageUrl(nextPage));
      if (!doc) break;
      const tiles = collectTilesFromDoc(doc);
      const newOnes = tiles.filter((t) => !tilesMap.has(t.key));
      if (newOnes.length === 0) break;
      newOnes.forEach((t) => tilesMap.set(t.key, t));
      nextPage++;
    }

    return { tiles: Array.from(tilesMap.values()), pageCount: nextPage - 1 };
  }

  // ---------- picker UI ----------

  function buildOverlay(shadowRoot, artistName) {
    const styleEl = document.createElement("style");
    styleEl.textContent = PICKER_CSS;
    shadowRoot.appendChild(styleEl);

    const overlay = document.createElement("div");
    overlay.id = "hopper-picker-overlay";
    overlay.innerHTML = `
      <div class="hi-panel">
        <div class="hi-header">
          <div>
            <div class="hi-title">Send images to the Hopper</div>
            <div class="hi-artist">${artistName ? `Importing for: ${artistName}` : "No artist selected"}</div>
          </div>
          <div class="hi-controls">
            <button id="hi-select-all" disabled>Select all</button>
            <button id="hi-select-none" disabled>Deselect all</button>
            <span id="hi-count">Scanning\u2026</span>
            <button id="hi-send" disabled>Send to Hopper</button>
            <button id="hi-close" title="Close">\u2715</button>
          </div>
        </div>
        <div id="hi-status" class="hi-status"></div>
        <div id="hi-grid" class="hi-grid"></div>
        <div class="hi-version">extension v${chrome.runtime.getManifest().version}</div>
      </div>
    `;
    shadowRoot.appendChild(overlay);
    document.body.style.overflow = "hidden";
    overlay.querySelector("#hi-close").addEventListener("click", () => {
      const host = document.getElementById(HOST_ID);
      if (host) host.remove();
      document.body.style.overflow = "";
    });
    return overlay;
  }

  function renderGrid(overlay, tiles, token) {
    const grid = overlay.querySelector("#hi-grid");
    const countEl = overlay.querySelector("#hi-count");
    const sendBtn = overlay.querySelector("#hi-send");
    const selectAllBtn = overlay.querySelector("#hi-select-all");
    const selectNoneBtn = overlay.querySelector("#hi-select-none");
    const statusEl = overlay.querySelector("#hi-status");
    const selected = new Set();

    function updateCount() {
      countEl.textContent = `${selected.size} of ${tiles.length} selected`;
      sendBtn.disabled = selected.size === 0 || !token;
    }

    tiles.forEach((tile) => {
      const card = document.createElement("label");
      card.className = "hi-card";
      card.dataset.url = tile.url;
      const hasMeta = tile.caption || tile.description;
      card.innerHTML = `
        <input type="checkbox">
        ${hasMeta ? `<div class="hi-card-meta" title="${(tile.caption + ' \u2014 ' + tile.description).replace(/"/g, "&quot;")}">i</div>` : ""}
        <div class="hi-thumb" style="background-image:url('${tile.url.replace(/'/g, "\\'")}')"></div>
        <div class="hi-card-name">${tile.caption || tile.filename}</div>
      `;
      const input = card.querySelector("input");
      input.addEventListener("change", () => {
        card.classList.toggle("hi-selected", input.checked);
        if (input.checked) selected.add(tile);
        else selected.delete(tile);
        updateCount();
      });
      grid.appendChild(card);
    });

    selectAllBtn.disabled = false;
    selectNoneBtn.disabled = false;
    selectAllBtn.addEventListener("click", () => {
      grid.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
        cb.dispatchEvent(new Event("change"));
      });
    });
    selectNoneBtn.addEventListener("click", () => {
      grid.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      });
    });

    let sendOrder = [];
    sendBtn.addEventListener("click", () => {
      if (!token) {
        statusEl.textContent = "No artist selected \u2014 pick one from the extension popup first.";
        return;
      }
      sendOrder = Array.from(selected);
      const images = sendOrder.map((t) => ({
        url: t.url,
        filename: t.filename,
        caption: t.caption,
        description: t.description,
      }));
      sendBtn.disabled = true;
      statusEl.textContent = `Sending 1 of ${images.length}\u2026`;
      chrome.runtime.sendMessage({ type: "SEND_TO_HOPPER", images, token });
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "HOPPER_PROGRESS") {
        const status = message.ok ? "\u2714" : `\u2716 (${message.error})`;
        statusEl.textContent = `${message.index + 1} of ${message.total}: ${message.filename} ${status}`;
        const sentTile = sendOrder[message.index];
        if (sentTile) {
          const card = grid.querySelector(`.hi-card[data-url="${CSS.escape(sentTile.url)}"]`);
          if (card) card.classList.add(message.ok ? "hi-card-ok" : "hi-card-error");
        }
      }
      if (message.type === "HOPPER_DONE") {
        statusEl.textContent += " \u2014 All done!";
        sendBtn.disabled = false;
      }
    });

    updateCount();
  }

  async function run() {
    const { activeArtist } = await chrome.storage.local.get("activeArtist");
    const token = activeArtist?.hopperToken || null;

    const host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });

    const overlay = buildOverlay(shadow, activeArtist?.name);
    const statusEl = overlay.querySelector("#hi-status");

    if (!token) {
      statusEl.textContent = "No artist selected \u2014 open the extension popup, pick an artist, then activate again.";
    }

    const { tiles, pageCount } = await scanAllTiles((msg) => (statusEl.textContent = msg));
    if (!tiles.length) {
      statusEl.textContent = "No images found on this page.";
      return;
    }
    statusEl.textContent =
      pageCount > 1 ? `Found ${tiles.length} images across ${pageCount} pages.` : `Found ${tiles.length} images.`;
    renderGrid(overlay, tiles, token);
  }

  run();
})();
