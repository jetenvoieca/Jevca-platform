// Run this LOCALLY, on your own computer — never on Netlify.
//
// Why: Namecheap's API only accepts requests from an IP address you've
// explicitly whitelisted in your Namecheap account, and it only accepts a
// fixed IPv4 address. Netlify's serverless functions don't have one (it
// can change between requests), so calling Namecheap directly from the
// deployed app doesn't work reliably. Running this on your own machine
// sidesteps the problem entirely — your home/office IP is what you
// whitelist, and it's what actually makes the request.
//
// Setup (one-time):
//   1. Namecheap → Profile → Tools → Namecheap API Access → enable it,
//      generate an API key, and whitelist your current IP address.
//   2. Copy .env.namecheap.example to .env.namecheap and fill in your
//      username, API key, and whitelisted IP. That file is gitignored —
//      it never gets committed, matching how every other secret in this
//      project is handled (DATABASE_URL, Stripe keys, etc.).
//
// Usage:
//   node scripts/fetch-domains.js
//
// Writes namecheap-domains.json in the project root. Import that file on
// the Namecheap Sync screen in the app to apply it to your Sites.

require("dotenv").config({ path: ".env.namecheap" });

const https = require("https");
const fs = require("fs");

const API_USER = process.env.NAMECHEAP_API_USER;
const API_KEY = process.env.NAMECHEAP_API_KEY;
const CLIENT_IP = process.env.NAMECHEAP_CLIENT_IP;

if (!API_USER || !API_KEY || !CLIENT_IP) {
  console.error(
    "Missing NAMECHEAP_API_USER, NAMECHEAP_API_KEY, or NAMECHEAP_CLIENT_IP.\n" +
      "Copy .env.namecheap.example to .env.namecheap and fill it in first."
  );
  process.exit(1);
}

function fetchPage(page) {
  return new Promise((resolve, reject) => {
    const url =
      `https://api.namecheap.com/xml.response?ApiUser=${encodeURIComponent(API_USER)}` +
      `&ApiKey=${encodeURIComponent(API_KEY)}&UserName=${encodeURIComponent(API_USER)}` +
      `&ClientIp=${encodeURIComponent(CLIENT_IP)}&Command=namecheap.domains.getList` +
      `&PageSize=100&Page=${page}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function extractAttr(str, attr) {
  const m = str.match(new RegExp(attr + '="([^"]+)"'));
  return m ? m[1] : "";
}

// Namecheap returns dates as MM/DD/YYYY — convert to ISO (YYYY-MM-DD) so
// the app can parse them directly.
function toIsoDate(mmddyyyy) {
  const m = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// "Renewal cost" isn't something Namecheap's API exposes per-domain (it
// depends on promos/pricing tier at purchase time) — deliberately not
// attempted here, see decisions log. Status is derived from IsExpired and
// how close Expires is, so the app doesn't need to do date maths itself.
function deriveStatus(isExpired, isoExpiry) {
  if (isExpired === "true") return "Expired";
  if (!isoExpiry) return "Active";
  const daysUntil = (new Date(isoExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 30) return "Expiring soon";
  return "Active";
}

async function main() {
  console.log("Fetching domain list from Namecheap…");

  const firstPage = await fetchPage(1);

  if (firstPage.includes("<Status>ERROR</Status>")) {
    const errMatch = firstPage.match(/<Error Number[^>]*>([^<]+)<\/Error>/);
    console.error(
      "Namecheap API error:",
      errMatch ? errMatch[1] : "(unknown — see raw response below)"
    );
    console.error(firstPage.slice(0, 1000));
    process.exit(1);
  }

  const totalMatch = firstPage.match(/<TotalItems>(\d+)<\/TotalItems>/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const totalPages = Math.ceil(total / 100) || 1;

  let allXml = firstPage;
  for (let p = 2; p <= totalPages; p++) {
    allXml += await fetchPage(p);
  }

  const parts = allXml.split("<Domain ");
  const domains = [];
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const name = extractAttr(block, "Name");
    if (!name) continue;
    const isoExpiry = toIsoDate(extractAttr(block, "Expires"));
    const isExpired = extractAttr(block, "IsExpired");
    domains.push({
      name,
      expires: isoExpiry,
      status: deriveStatus(isExpired, isoExpiry),
    });
  }

  fs.writeFileSync("namecheap-domains.json", JSON.stringify(domains, null, 2));
  console.log(`Wrote ${domains.length} domains to namecheap-domains.json`);
  console.log("Now import that file on the Namecheap Sync screen in the app.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
