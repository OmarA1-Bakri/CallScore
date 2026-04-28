import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Spec breakpoint contract: phone ≤480 · tab 481–1024 · desk ≥1025
      // (phase-3-development-pack §03). Tailwind defaults sm/md/lg/xl remain
      // available for legacy components during phased migration.
      screens: {
        tab: "481px",
        desk: "1025px",
      },
      colors: {
        ink: {
          0: "#0A0A0B",
          50: "#0E0F10",
          100: "#141517",
          150: "#1A1B1E",
          200: "#22242A",
          250: "#2B2D33",
          300: "#3A3D44",
          400: "#5B5F68",
          500: "#7A7F89",
          600: "#9CA0A9",
          700: "#C2C5CC",
          800: "#E1E3E7",
          900: "#F4F5F7",
        },
        accent: {
          DEFAULT: "#C9A24B",
          dim: "#8E7235",
          low: "#3A2F17",
        },
        pos: { DEFAULT: "#6FA56A", dim: "#3E5D3B" },
        neg: { DEFAULT: "#D47A70", dim: "#6A3631" },
        warn: "#D97757",
        stale: "#8A7A5E",
        lock: "#8C8FA0",
        new: "#7FA6C9",
        lown: "#A78C6B",
        // Temporary compatibility aliases for legacy components while routes migrate.
        brand: {
          gold: "#C9A24B",
          "gold-dim": "#8E7235",
          green: "#6FA56A",
          red: "#D47A70",
          dark: "#0A0A0B",
          card: "#141517",
          "card-hover": "#1A1B1E",
          border: "#22242A",
          muted: "#7A7F89",
          accent: "#C9A24B",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      spacing: {
        "30": "120px",
      },
      zIndex: {
        page: "0",
        content: "1",
        sticky: "10",
        masthead: "50",
        "drawer-overlay": "59",
        drawer: "60",
        "sheet-overlay": "64",
        sheet: "65",
        "popover-overlay": "69",
        popover: "70",
        "tooltip-overlay": "74",
        tooltip: "75",
        "modal-overlay": "99",
        modal: "100",
        toast: "110",
      },
      fontSize: {
        h1: ["44px", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "400" }],
        h2: ["28px", { lineHeight: "1.20", letterSpacing: "-0.01em", fontWeight: "400" }],
        h3: ["24px", { lineHeight: "1.20", letterSpacing: "-0.015em", fontWeight: "400" }],
        "metric-hero": ["36px", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "500" }],
        "metric-card": ["32px", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "500" }],
        body: ["13px", { lineHeight: "1.5" }],
        "body-lg": ["15px", { lineHeight: "1.55" }],
        lede: ["16px", { lineHeight: "1.55" }],
        "mono-xs": ["9px", { letterSpacing: "0.1em" }],
        "mono-sm": ["10px", { letterSpacing: "0.08em" }],
        mono: ["11px", { letterSpacing: "0.06em" }],
        "mono-lg": ["12px", { letterSpacing: "0.04em" }],
        "mono-xl": ["13px", { letterSpacing: "0.04em" }],
      },
      letterSpacing: {
        kicker: "0.1em",
        caps: "0.08em",
        tight: "-0.015em",
      },
      borderColor: {
        hair: "#22242A",
        "hair-strong": "#2B2D33",
        "hair-soft": "#1A1B1E",
      },
      boxShadow: {
        modal: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,75,0.15)",
        popover: "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,75,0.12)",
        tooltip: "0 8px 32px rgba(0,0,0,0.5)",
      },
      backdropBlur: {
        nav: "12px",
        bar: "6px",
      },
      animation: {
        "fresh-ring": "fresh-ring 2.4s ease-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
      keyframes: {
        "fresh-ring": {
          "0%": { transform: "scale(0.6)", opacity: "0.6" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "-100% 0" },
        },
      },
      maxWidth: {
        page: "1360px",
      },
    },
  },
  plugins: [],
};

export default config;
