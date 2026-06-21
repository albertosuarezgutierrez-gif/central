import type { Config } from "tailwindcss"
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:   "#060609",
        surf:  "#0F0F14",
        card:  "#17171E",
        rim:   "#252530",
        muted: "#4A4A58",
        pale:  "#9898A8",
        snow:  "#F5F5F2",
        lime:  "#BBFF44",
        "lime-dim": "#8FCC22",
        elec:  "#3B3BFF",
      },
      fontFamily: {
        syne: ["Syne", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
export default config

