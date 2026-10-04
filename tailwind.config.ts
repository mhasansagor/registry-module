import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2330",
        paper: "#f6f7f9",
        line: "#dfe3ea",
        brand: { DEFAULT: "#1f5f5b", dark: "#174a47", soft: "#e3f0ee" },
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
