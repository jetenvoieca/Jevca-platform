import localFont from "next/font/local";

// Fonts for the business website, jetenvoieca.com (2026-09-29) —
// Cormorant Garamond for headings, Inter for small labels and body
// text, as in the design mockups. Applied by className, so they never
// depend on Tailwind's font-serif/font-sans defaults.
//
// The font files come from the @fontsource npm packages (2026-10-05),
// installed with everything else, rather than next/font/google — that
// downloads from Google Fonts during every build, and a failed or
// stale download breaks the whole build. Latin, weights 400 and 500.
const FONTS = "../../node_modules/@fontsource";

export const websiteSerif = localFont({
  src: [
    {
      path: `${FONTS}/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2`,
      weight: "400",
      style: "normal",
    },
    {
      path: `${FONTS}/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2`,
      weight: "500",
      style: "normal",
    },
  ],
  display: "swap",
});

export const websiteSans = localFont({
  src: [
    { path: `${FONTS}/inter/files/inter-latin-400-normal.woff2`, weight: "400", style: "normal" },
    { path: `${FONTS}/inter/files/inter-latin-500-normal.woff2`, weight: "500", style: "normal" },
  ],
  display: "swap",
});
