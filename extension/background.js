const JEVCA_ORIGIN = "https://jevca.netlify.app";
const JEVCA_TAB_PATTERN = "*://jevca.netlify.app/*";

const ARTISTS_STORAGE_KEY = "artists"; // [{ id, name, hopperToken }]
const ARTISTS_UPDATED_STORAGE_KEY = "artistsUpdatedAt";

// ---------- refreshing the artist/token list ----------

async function refreshArtists() {
  const [tab] = await chrome.tabs.query({ url: JEVCA_TAB_PATTERN });
  if (!tab || !tab.id) {
    return { error: "No Jevca admin tab is open. Open the Jevca dashboard in a tab, then try again." };
  }

  // Runs INSIDE the already-open Jevca admin tab, so the fetch is
  // same-origin and carries that tab's own login cookie automatically —
  // the extension itself never touches the cookie or calls this
  // endpoint cross-site.
  const [{ result, error } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      return fetch("/api/extension/artists", { credentials: "include" })
        .then(async (res) => {
          if (!res.ok) return { error: `Could not load artist list (${res.status})` };
          const data = await res.json();
          return { result: data };
        })
        .catch((err) => ({ error: err.message }));
    },
  }).then((injectionResults) => injectionResults.map((r) => r.result));

  if (error) return { error };
  if (!result || !Array.isArray(result.artists)) {
    return { error: "Unexpected response from the artist list." };
  }

  await chrome.storage.local.set({
    [ARTISTS_STORAGE_KEY]: result.artists,
    [ARTISTS_UPDATED_STORAGE_KEY]: new Date().toISOString(),
  });

  return { artists: result.artists };
}

// ---------- finding the full-size version of a source image ----------
//
// Many gallery/portfolio site builders serve a smaller "display" image
// and keep the full-size original at the same path with just a size
// number swapped (e.g. .../_cached/400/123.jpg vs .../_cached/720/123.jpg,
// or .../thumbs/300/... vs .../thumbs/1600/...). Rather than hardcoding
// any one site's numbers, this looks for a purely-numeric path segment,
// then actually tries a range of larger sizes and uses whichever one is
// real — so it keeps working if a site's own maximum size changes, and
// works across different sites using the same pattern.
const UPGRADE_CANDIDATE_SIZES = [2400, 2000, 1800, 1600, 1400, 1200, 1024, 960, 900, 840, 800, 760, 720, 680, 640];
const MAX_UPGRADE_PROBES = 6;

function findSizeSegment(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    // The size folder is normally the segment right before the filename.
    for (let i = parts.length - 2; i >= 1; i--) {
      if (/^\d{2,4}$/.test(parts[i])) {
        return { u, index: i, value: parseInt(parts[i], 10) };
      }
    }
  } catch (e) {
    // not a valid absolute URL — nothing to upgrade
  }
  return null;
}

// Downloads the best available version of an image, trying larger sizes
// first and falling back to the URL exactly as found on the page.
async function fetchBestImage(url) {
  const seg = findSizeSegment(url);
  if (seg) {
    const candidates = UPGRADE_CANDIDATE_SIZES.filter((s) => s > seg.value)
      .sort((a, b) => b - a)
      .slice(0, MAX_UPGRADE_PROBES);

    for (const size of candidates) {
      const parts = seg.u.pathname.split("/");
      parts[seg.index] = String(size);
      const candidateUrl = new URL(seg.u.toString());
      candidateUrl.pathname = parts.join("/");
      try {
        const res = await fetch(candidateUrl.toString());
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.startsWith("image/")) {
            return { blob: await res.blob(), url: candidateUrl.toString() };
          }
        }
      } catch (e) {
        // that size doesn't exist here — try the next one
      }
    }
  }

  // No numeric size segment, or none of the larger sizes existed — use
  // the image exactly as the page linked to it.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download image (${res.status})`);
  return { blob: await res.blob(), url };
}

// ---------- sending images to a real artist's Hopper ----------

function guessContentType(url) {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function sendOneImage({ url, filename, caption, description }, token) {
  // 1. Get the best real version of the image bytes we can find. This
  //    works even though the source page itself blocks dragging, since
  //    the extension's host permissions exempt it from that page's own
  //    CORS restrictions.
  const { blob, url: resolvedUrl } = await fetchBestImage(url);
  const contentType = blob.type || guessContentType(resolvedUrl);

  // 2. Ask the Jevca app for a presigned upload slot for this artist.
  const requestRes = await fetch(`${JEVCA_ORIGIN}/api/hopper/request-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, filename, contentType }),
  });
  const requestData = await requestRes.json().catch(() => ({}));
  if (!requestRes.ok) throw new Error(requestData.error || `request-upload failed (${requestRes.status})`);
  const { uploadUrl, key, kind } = requestData;

  // 3. Upload the bytes straight to R2 using the presigned URL.
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "content-type": contentType },
  });
  if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

  // 4. Finalize — creates the real Image row, status HOPPER, exactly
  //    like the iPhone Shortcut's own second step.
  const finalizeRes = await fetch(`${JEVCA_ORIGIN}/api/hopper/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      key,
      contentType,
      kind,
      caption: caption || undefined,
      description: description || undefined,
    }),
  });
  const finalizeData = await finalizeRes.json().catch(() => ({}));
  if (!finalizeRes.ok) throw new Error(finalizeData.error || `finalize failed (${finalizeRes.status})`);

  return finalizeData;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REFRESH_ARTISTS") {
    refreshArtists().then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  if (message.type === "SEND_TO_HOPPER") {
    (async () => {
      const { images, token } = message;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          await sendOneImage(img, token);
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "HOPPER_PROGRESS",
            index: i,
            total: images.length,
            ok: true,
            filename: img.filename,
          });
        } catch (err) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: "HOPPER_PROGRESS",
            index: i,
            total: images.length,
            ok: false,
            filename: img.filename,
            error: err.message,
          });
        }
        // A short pause between items is polite to the API and avoids races.
        await new Promise((r) => setTimeout(r, 400));
      }
      chrome.tabs.sendMessage(sender.tab.id, { type: "HOPPER_DONE" });
    })();
  }
});
