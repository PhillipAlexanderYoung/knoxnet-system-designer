import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: {
          DEFAULT: "#0B1220",
          50: "#1B2433",
          100: "#141C2B",
          200: "#0F1624",
          300: "#0B1220",
          400: "#080E1A",
          500: "#050913",
        },
        steel: {
          DEFAULT: "#1B2433",
          100: "#243042",
          200: "#1B2433",
          300: "#141B27",
        },
        amber: {
          knox: "#F4B740",
          glow: "#F7C765",
          deep: "#C99227",
        },
        signal: {
          green: "#2BD37C",
          red: "#FF5C7A",
          blue: "#4FB7FF",
          violet: "#B58CFF",
          teal: "#3DD4D0",
        },
        ink: {
          50: "#F5F7FA",
          100: "#E2E7EF",
          200: "#C2CADA",
          300: "#94A0B8",
          400: "#5E6B85",
          500: "#3A4458",
          600: "#262E3F",
          700: "#1A2030",
          800: "#101624",
          900: "#080C16",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        display: ["Inter", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        wordmark: "0.18em",
      },
      boxShadow: {
        glass:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(244,183,64,0.35), 0 0 24px rgba(244,183,64,0.15)",
        panel: "0 12px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset",
      },
      backdropBlur: {
        xs: "4px",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(244,183,64,0.5)" },
          "50%": { boxShadow: "0 0 0 6px rgba(244,183,64,0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 180ms ease-out",
        "slide-up": "slideUp 220ms ease-out",
        "scale-in": "scaleIn 160ms ease-out",
        "pulse-glow": "pulseGlow 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
