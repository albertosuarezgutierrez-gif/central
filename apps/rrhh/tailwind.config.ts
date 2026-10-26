import type { Config } from "tailwindcss"

// Colores del tema = variables de `@central/brand` (las emite `emitirRootCss(MARCA_ASEGURA)` en app/layout.tsx).
// 🚨 Van como `color-mix(... <alpha-value> ...)`: Tailwind sustituye el marcador por el 0.4 de `bg-ink/40`.
// Con un `var(--x)` a secas NO hay canal alfa y esas clases no generan CSS (bug del 26/10/2026: fondos de modal,
// chips y avisos sin color). El cepo `lib/tema-tailwind.test.ts` compila el tema y falla si una clase de color no sale.
const token = (variable: string) => `color-mix(in oklab, var(${variable}) calc(<alpha-value> * 100%), transparent)`

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: token("--bg"),
        "paper-2": token("--bg2"),
        card: token("--panel"),
        ink: token("--text"),
        "ink-2": token("--ink-2"),
        "ink-3": token("--muted"),
        line: token("--border"),
        "line-2": token("--line-2"),
        accent: token("--brand"),
        "accent-ink": token("--brand-ink"),
        "accent-soft": token("--brand-soft"),
        ok: token("--ok"),
        warn: token("--warn"),
        alert: token("--danger"),
      },
      fontFamily: {
        sans: ["var(--font-nunito)", "system-ui", "sans-serif"],
        display: ["var(--font-quicksand)", "var(--font-nunito)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { card: "var(--radio)" },
      boxShadow: { panel: "var(--shadow-panel)", flotante: "var(--shadow-float)", encima: "var(--shadow-over)" },
    },
  },
  plugins: [],
} satisfies Config
