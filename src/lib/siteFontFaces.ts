import localFont from "next/font/local";
import type { SiteFontId } from "@/lib/siteFonts";

// The font files for lib/siteFonts.ts (2026-10-07) — regular, bold and
// italic of each, Latin, and light and light italic (2026-10-22, the
// Light looks) where the font has them; a font without draws Light as
// regular. From the @fontsource npm packages, served from
// the site itself like the business website's fonts (see
// websiteFonts.ts): nothing is fetched from Google, during the build or
// by visitors. Not preloaded — a browser only downloads a font a page
// actually uses. next/font needs every path written out in full.

// Jost (2026-10-19 — the first Presentation template, from Louise's
// website): medium 500 too.
const jost = localFont({
  src: [
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/jost/files/jost-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const lato = localFont({
  src: [
    { path: "../../node_modules/@fontsource/lato/files/lato-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/lato/files/lato-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/lato/files/lato-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/lato/files/lato-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/lato/files/lato-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const montserrat = localFont({
  src: [
    { path: "../../node_modules/@fontsource/montserrat/files/montserrat-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/montserrat/files/montserrat-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/montserrat/files/montserrat-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const workSans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/work-sans/files/work-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/work-sans/files/work-sans-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/work-sans/files/work-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/work-sans/files/work-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/work-sans/files/work-sans-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const dmSans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/dm-sans/files/dm-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/dm-sans/files/dm-sans-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const raleway = localFont({
  src: [
    { path: "../../node_modules/@fontsource/raleway/files/raleway-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/raleway/files/raleway-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/raleway/files/raleway-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/raleway/files/raleway-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/raleway/files/raleway-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const sourceSans3 = localFont({
  src: [
    { path: "../../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["sans-serif"],
});

const playfairDisplay = localFont({
  src: [
    { path: "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["serif"],
});

const lora = localFont({
  src: [
    { path: "../../node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/lora/files/lora-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/lora/files/lora-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["serif"],
});

const cormorantGaramond = localFont({
  src: [
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-300-italic.woff2", weight: "300", style: "italic" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["serif"],
});

const ebGaramond = localFont({
  src: [
    { path: "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["serif"],
});

const libreBaskerville = localFont({
  src: [
    { path: "../../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["serif"],
});

const spaceMono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/space-mono/files/space-mono-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  preload: false,
  fallback: ["monospace"],
});

// Each font's CSS font-family, by id.
export const SITE_FONT_FAMILY: Record<SiteFontId, string> = {
  "dm-sans": dmSans.style.fontFamily,
  jost: jost.style.fontFamily,
  lato: lato.style.fontFamily,
  montserrat: montserrat.style.fontFamily,
  raleway: raleway.style.fontFamily,
  "source-sans-3": sourceSans3.style.fontFamily,
  "work-sans": workSans.style.fontFamily,
  "cormorant-garamond": cormorantGaramond.style.fontFamily,
  "eb-garamond": ebGaramond.style.fontFamily,
  "libre-baskerville": libreBaskerville.style.fontFamily,
  lora: lora.style.fontFamily,
  "playfair-display": playfairDisplay.style.fontFamily,
  "space-mono": spaceMono.style.fontFamily,
};
