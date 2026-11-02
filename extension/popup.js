const ARTISTS_KEY = "artists";
const ARTISTS_UPDATED_KEY = "artistsUpdatedAt";
const ACTIVE_ARTIST_KEY = "activeArtist";
const LAST_ARTIST_ID_KEY = "lastArtistId";

const artistSelect = document.getElementById("artist");
const refreshBtn = document.getElementById("refresh");
const refreshStatus = document.getElementById("refresh-status");
const lastUpdatedEl = document.getElementById("last-updated");
const activateBtn = document.getElementById("activate");
const activateStatus = document.getElementById("activate-status");
const importIsytBtn = document.getElementById("import-isyt");
const isytStatus = document.getElementById("isyt-status");

function formatUpdatedAt(iso) {
  if (!iso) return "Never refreshed.";
  const d = new Date(iso);
  return `Last refreshed: ${d.toLocaleString()}`;
}

function populateArtistSelect(artists, selectedId) {
  artistSelect.innerHTML = "";
  if (!artists || artists.length === 0) {
    artistSelect.innerHTML = `<option value="">No artists loaded \u2014 click Refresh</option>`;
    activateBtn.disabled = true;
    importIsytBtn.disabled = true;
    return;
  }
  artists.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.name;
    if (a.id === selectedId) opt.selected = true;
    artistSelect.appendChild(opt);
  });
  activateBtn.disabled = false;
  importIsytBtn.disabled = false;
}

async function loadInitialState() {
  const data = await chrome.storage.local.get([ARTISTS_KEY, ARTISTS_UPDATED_KEY, LAST_ARTIST_ID_KEY]);
  populateArtistSelect(data[ARTISTS_KEY], data[LAST_ARTIST_ID_KEY]);
  lastUpdatedEl.textContent = formatUpdatedAt(data[ARTISTS_UPDATED_KEY]);
}

artistSelect.addEventListener("change", () => {
  chrome.storage.local.set({ [LAST_ARTIST_ID_KEY]: artistSelect.value });
});

refreshBtn.addEventListener("click", async () => {
  refreshStatus.textContent = "Refreshing\u2026";
  refreshStatus.className = "";
  refreshBtn.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "REFRESH_ARTISTS" });
  refreshBtn.disabled = false;

  if (response?.error) {
    refreshStatus.textContent = response.error;
    refreshStatus.className = "err";
    return;
  }

  refreshStatus.textContent = `Loaded ${response.artists.length} artists.`;
  refreshStatus.className = "ok";
  const data = await chrome.storage.local.get([ARTISTS_UPDATED_KEY, LAST_ARTIST_ID_KEY]);
  lastUpdatedEl.textContent = formatUpdatedAt(data[ARTISTS_UPDATED_KEY]);
  populateArtistSelect(response.artists, data[LAST_ARTIST_ID_KEY]);
});

// Puts the chosen artist in place, then runs `file` on the current tab:
// content.js (pick images on any page) or isyt.js (import an ISYT site).
async function activate(file, statusEl) {
  const selectedId = artistSelect.value;
  if (!selectedId) {
    statusEl.textContent = "Choose an artist first.";
    statusEl.className = "err";
    return;
  }

  const { artists } = await chrome.storage.local.get(ARTISTS_KEY);
  const artist = (artists || []).find((a) => a.id === selectedId);
  if (!artist) {
    statusEl.textContent = "That artist is no longer in the list \u2014 refresh and try again.";
    statusEl.className = "err";
    return;
  }

  await chrome.storage.local.set({
    [ACTIVE_ARTIST_KEY]: artist,
    [LAST_ARTIST_ID_KEY]: artist.id,
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
    statusEl.textContent = `Activated for ${artist.name} \u2014 check the page.`;
    statusEl.className = "ok";
    setTimeout(() => window.close(), 700);
  } catch (err) {
    statusEl.textContent = `Couldn't activate here: ${err.message}`;
    statusEl.className = "err";
  }
}

activateBtn.addEventListener("click", () => activate("content.js", activateStatus));
importIsytBtn.addEventListener("click", () => activate("isyt.js", isytStatus));

loadInitialState();

// ---------- Update notice (2026-11-02) ----------
// Jevca publishes the importer's latest version (scripts/zip-extension.mjs,
// at every deploy). If it's newer than this copy, the popup says so, with
// a link to download it — Chrome never updates a "Load unpacked" extension
// by itself.
const UPDATE_ORIGIN = "https://jevca.netlify.app";

function isNewer(latest, current) {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(`${UPDATE_ORIGIN}/importer/version.json`, { cache: "no-store" });
    if (!res.ok) return;
    const { version: latest } = await res.json();
    const current = chrome.runtime.getManifest().version;
    if (!latest || !isNewer(latest, current)) return;
    document.getElementById("update-latest").textContent = latest;
    document.getElementById("update-current").textContent = current;
    document.getElementById("update-download").addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${UPDATE_ORIGIN}/importer/jevca-hopper-importer.zip` });
    });
    document.getElementById("update").hidden = false;
  } catch {
    // Offline or Jevca unreachable — no notice, the rest still works.
  }
}

checkForUpdate();
