import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--surface-muted) / <alpha-value>)",
        "surface-elevated": "rgb(var(--surface-elevated) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--foreground-muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-strong": "rgb(var(--primary-strong) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-foreground) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        rate: "rgb(var(--rate) / <alpha-value>)",
        "effective-rate": "rgb(var(--effective-rate) / <alpha-value>)",
        "balance-value": "rgb(var(--balance) / <alpha-value>)",
      },
      boxShadow: {
        panel: "0 1px 2px rgb(var(--shadow) / 0.04), 0 8px 24px rgb(var(--shadow) / 0.08)",
        elevated: "0 8px 30px rgb(var(--shadow) / 0.16), 0 2px 8px rgb(var(--shadow) / 0.08)",
        md: "0 4px 14px rgb(var(--shadow) / 0.1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
