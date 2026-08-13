import type { Config } from "tailwindcss";

// Bảng màu thương hiệu Hoàng Gia — xem plan mục "Bảng màu thương hiệu".
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#EDF1F7",
          100: "#D7E0EE",
          700: "#123A6B",
          900: "#0B2447",
        },
        brandRed: {
          50: "#FDEAEC",
          600: "#C8102E",
          700: "#9E0B22",
        },
        gray: {
          50: "#F4F6F9",
          200: "#E2E6ED",
          500: "#6B7280",
          900: "#111827",
        },
        success: { 600: "#1E9E63" },
        warning: { 500: "#F2A93B" },
        info: { 500: "#2F6FED" },
        gold: { 500: "#D4A017" },
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#0B2447",
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "#C8102E",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F4F6F9",
          foreground: "#6B7280",
        },
        accent: {
          DEFAULT: "#EDF1F7",
          foreground: "#0B2447",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#111827",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(11,36,71,0.06), 0 1px 3px 0 rgba(11,36,71,0.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
