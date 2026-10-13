import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "studio-slide-down": {
          from: { opacity: "0", transform: "translateY(-1rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // A published site's pages cross-fade (2026-10-13, Craig's
        // choice: plain cross-fade, 0.8 s) — see PublishedSite.
        "page-fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "page-fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
      },
      animation: {
        "studio-slide-down": "studio-slide-down 250ms ease-out",
        "page-fade-in": "page-fade-in 800ms ease both",
        "page-fade-out": "page-fade-out 800ms ease both",
      },
    },
  },
  plugins: [],
};

export default config;
