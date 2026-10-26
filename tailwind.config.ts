import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17251f",
        paper: "#f5f4ef",
        leaf: "#176b52",
        citrus: "#e6a93b",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "sans-serif"],
        display: ["var(--font-newsreader)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;