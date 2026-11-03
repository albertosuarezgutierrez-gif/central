// Marca de la EMPRESA dentro del portal (27/10/2026, decisión de Alberto: «algo intermedio»).
// Los empleados desconfiaban de ver «Grupo ASegura» por todas partes: dentro de la app (cuando ya se sabe la empresa) el
// logo y el color son los de SU empresa y Grupo ASegura queda como una línea pequeña («con Grupo ASegura»).
// Sin logo ni color válido de la empresa → se mantiene la cara Grupo ASegura de antes. PURO (sin BD) → testeable.
import { normalizaHex } from '@/lib/branding'

export type MarcaCabecera = {
  /** 'empresa' = logo/nombre de la empresa en grande + «con Grupo ASegura» pequeño; 'asegura' = la cara de siempre. */
  modo: 'empresa' | 'asegura'
  logoUrl: string | null
  nombre: string | null
  /** Variables CSS (`--brand*`) para el contenedor. `{}` si la empresa no tiene color válido (se queda el cobalto). */
  estilo: Record<string, string>
}

const BLANCO = '#ffffff'

function canales(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
function aHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Ratio de contraste WCAG entre dos colores `#rrggbb` (1 a 21). */
export function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
function mezcla(hex: string, objetivo: number, t: number): string {
  const [r, g, b] = canales(hex)
  return aHex([r + (objetivo - r) * t, g + (objetivo - g) * t, b + (objetivo - b) * t])
}

/**
 * Paleta de acento a partir del color corporativo, con AA garantizado: el texto blanco de los botones sobre `brand`
 * (y el texto `brand` sobre el fondo suave de los avisos) llega a ≥ 4,5:1. Si el color es demasiado claro se OSCURECE
 * hasta cumplirlo (un amarillo corporativo acaba en ocre oscuro, pero legible). `null` si el hex no es válido.
 */
export function paletaEmpresa(color: string | null | undefined): { brand: string; brandInk: string; brandSoft: string } | null {
  const base = normalizaHex(color)
  if (!base) return null
  let brand = base
  let soft = mezcla(brand, 255, 0.88)
  for (let t = 0; t <= 1 && (contraste(brand, BLANCO) < 4.5 || contraste(brand, soft) < 4.5); t += 0.02) {
    brand = mezcla(base, 0, t)
    soft = mezcla(brand, 255, 0.88)
  }
  return { brand, brandInk: mezcla(brand, 0, 0.2), brandSoft: soft }
}

/** Qué marca pinta la cabecera/pantallas internas. Empresa si tiene logo o color válido; si no, Grupo ASegura como antes. */
export function marcaCabecera(e: { nombre?: string | null; logoUrl?: string | null; color?: string | null } | null | undefined): MarcaCabecera {
  const logoUrl = (e?.logoUrl ?? '').trim() || null
  const nombre = (e?.nombre ?? '').trim() || null
  const p = paletaEmpresa(e?.color)
  if (!logoUrl && !p) return { modo: 'asegura', logoUrl: null, nombre, estilo: {} }
  return {
    modo: 'empresa', logoUrl, nombre,
    estilo: p ? { '--brand': p.brand, '--brand-ink': p.brandInk, '--brand-soft': p.brandSoft } : {},
  }
}
