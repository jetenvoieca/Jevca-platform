import { Cormorant_Garamond, Inter } from "next/font/google";

// Fonts for the business website, jetenvoieca.com (2026-09-29) —
// Cormorant Garamond for headings, Inter for small labels and body
// text, as in the design mockups. Loaded through next/font (self-hosted
// at build time) and applied by className, so they never depend on
// Tailwind's font-serif/font-sans defaults.
export const websiteSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const websiteSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
