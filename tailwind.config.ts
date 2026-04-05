import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#F7B731",
          "gold-dim": "#C4922A",
          green: "#26de81",
          red: "#fc5c65",
          dark: "#0a0a0f",
          card: "#12121a",
          "card-hover": "#1a1a28",
          border: "#1e1e2e",
          muted: "#6b7280",
          accent: "#8b5cf6",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
