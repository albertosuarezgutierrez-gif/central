// Marca de «Mi empresa» (mismo criterio que contabilidad/lib/marca.ts y rrhh/lib/marca-empresa.ts). PURO (sin BD).
// Base visual = `emitirRootCss(MARCA_ASEGURA)` (neutros, radio, sombras, Quicksand/Nunito Sans). Encima, SOLO el acento de la
// EMPRESA (`--brand*`), oscurecido hasta AA 4,5:1 si su color es claro. Logo y nombre de la empresa mandan en la cabecera;
// «con Grupo ASegura» va siempre como línea pequeña en cobalto (`--asegura`) y no es editable.
import { MARCA_ASEGURA } from '@central/brand'

export const SELLO = 'con Grupo ASegura'
const BLANCO = '#ffffff'
const HEX = /^#[0-9a-f]{6}$/

export function normalizarHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  const c = t.startsWith('#') ? t : `#${t}`
  return HEX.test(c) ? c : null
}

const canales = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const aHex = (c: number[]) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mezcla = (hex: string, objetivo: number, t: number) => aHex(canales(hex).map((c) => c + (objetivo - c) * t))

/**
 * Acento a partir del color corporativo con AA garantizado: texto blanco sobre `brand` y `brand` sobre `brandSoft` ≥ 4,5:1.
 * Un color demasiado claro se OSCURECE hasta cumplirlo. null si el hex no es válido (se queda el cobalto de Grupo ASegura).
 */
export function paletaEmpresa(color: unknown): { brand: string; brandInk: string; brandSoft: string } | null {
  const base = normalizarHex(color)
  if (!base) return null
  let brand = base
  let soft = mezcla(brand, 255, 0.88)
  for (let t = 0; t <= 1 && (contraste(brand, BLANCO) < 4.5 || contraste(brand, soft) < 4.5); t += 0.02) {
    brand = mezcla(base, 0, t)
    soft = mezcla(brand, 255, 0.88)
  }
  return { brand, brandInk: mezcla(brand, 0, 0.2), brandSoft: soft }
}

/** `:root{--brand…}` del acento (empresa o, sin color válido, el cobalto de Grupo ASegura). Texto sobre el acento: blanco (AA). */
export function cssAcento(color: unknown): string {
  const p = paletaEmpresa(color) ?? paletaEmpresa(MARCA_ASEGURA.paleta.primario)!
  return `:root{--brand:${p.brand};--brand-ink:${p.brandInk};--brand-soft:${p.brandSoft};--on-brand:${BLANCO};--asegura:${MARCA_ASEGURA.paleta.primario}}`
}

export type MarcaCabecera = { nombre: string; logoUrl: string | null; iniciales: string }

/** Cabecera: logo de la empresa si lo hay; si no, sus iniciales sobre el acento. Nunca el logo de Grupo ASegura en grande. */
export function marcaCabecera(e: { razonSocial: string; logoUrl: string | null } | null): MarcaCabecera {
  const nombre = e?.razonSocial?.trim() || 'Mi empresa'
  const logoUrl = e?.logoUrl && /^https:\/\//.test(e.logoUrl) ? e.logoUrl : null
  const iniciales = nombre.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'ME'
  return { nombre, logoUrl, iniciales }
}
