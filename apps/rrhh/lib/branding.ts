// Marca blanca por empresa (white-label): cada empresa define su color corporativo y su logo,
// y el Portal del Empleado se tiñe con ellos. Funciones PURAS (sin BD) → testeables.

export type Paleta = { accent: string; accentInk: string; accentSoft: string }

/** Normaliza un color hex a `#rrggbb` en minúsculas. Admite `#rgb`. Devuelve null si no es válido. */
export function normalizaHex(color: string | null | undefined): string | null {
  if (!color) return null
  let c = color.trim().toLowerCase()
  if (!c.startsWith('#')) c = '#' + c
  if (/^#[0-9a-f]{3}$/.test(c)) {
    // #abc → #aabbcc
    return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  }
  if (/^#[0-9a-f]{6}$/.test(c)) return c
  return null
}

/** ¿Es un color hex válido (#rgb o #rrggbb)? */
export function esHexValido(color: string | null | undefined): boolean {
  return normalizaHex(color) !== null
}

function aRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function aHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}
/** Mezcla un canal hacia un objetivo (0=negro, 255=blanco) en proporción t∈[0,1]. */
function mezcla([r, g, b]: [number, number, number], objetivo: number, t: number): [number, number, number] {
  return [r + (objetivo - r) * t, g + (objetivo - g) * t, b + (objetivo - b) * t]
}

/**
 * Deriva la paleta del acento a partir del color corporativo:
 * - `accent`    = el propio color
 * - `accentInk` = una versión más oscura (hover de botones / textos sobre claro)
 * - `accentSoft`= un tinte muy claro (fondos de badges / outline de foco)
 */
export function derivarPaleta(color: string): Paleta | null {
  const hex = normalizaHex(color)
  if (!hex) return null
  const rgb = aRgb(hex)
  const ink = mezcla(rgb, 0, 0.2) // 20% hacia negro
  const soft = mezcla(rgb, 255, 0.84) // 84% hacia blanco
  return { accent: hex, accentInk: aHex(...ink), accentSoft: aHex(...soft) }
}

/**
 * Variables CSS para teñir el portal con el color de la empresa. Pensado para aplicarse como
 * `style` inline en el contenedor del portal (las custom properties heredan a los descendientes).
 * Si el color no es válido, devuelve `{}` (se mantiene la marca de la casa).
 */
export function estiloMarca(color: string | null | undefined): Record<string, string> {
  const p = derivarPaleta(color ?? '')
  if (!p) return {}
  return { '--accent': p.accent, '--accent-ink': p.accentInk, '--accent-soft': p.accentSoft }
}
