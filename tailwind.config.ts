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
      },
      animation: {
        "studio-slide-down": "studio-slide-down 250ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
