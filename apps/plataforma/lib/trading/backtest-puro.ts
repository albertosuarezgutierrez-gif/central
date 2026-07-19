import type { PuntoPrecio } from './precios-stooq'

// Parte PURA del retrovisor (backtest punto-en-el-tiempo): fechas de snapshot, precios/retornos
// sobre una serie con fechas. SOLO type-imports locales (node --test no resuelve relativos sin
// extensión): `factoresEnFecha` — que necesita edgar+módulo en runtime — vive en `backtest.ts`.

export const VENTANAS_FORWARD = [28, 56, 91] as const

export const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Fechas de snapshot: día 1 de cada mes, desde hace `meses` hasta hace `margenDias` (para que la
// ventana forward más larga quepa entera en la serie de precios).
export function fechasSnapshot(hoy: string, meses = 24, margenDias = 98): string[] {
  const [y, m] = hoy.split('-').map(Number)
  const limite = sumarDias(hoy, -margenDias)
  const out: string[] = []
  for (let i = meses; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i
    const fecha = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
    if (fecha <= limite) out.push(fecha)
  }
  return out
}

// Último cierre con fecha <= objetivo (los snapshots caen en festivos/fin de semana sin cotización).
export function precioEn(puntos: PuntoPrecio[], fecha: string): number | null {
  let ultimo: number | null = null
  for (const p of puntos) {
    if (p.fecha > fecha) break
    ultimo = p.cierre
  }
  return ultimo
}

// Retorno desde `fecha` al primer cierre >= fecha+dias. null si la serie no llega o no hay base.
export function retornoForward(puntos: PuntoPrecio[], fecha: string, dias: number): number | null {
  const base = precioEn(puntos, fecha)
  if (base == null || base <= 0) return null
  const objetivo = sumarDias(fecha, dias)
  for (const p of puntos) {
    if (p.fecha >= objetivo) return p.cierre / base - 1
  }
  return null
}

export type FactoresFecha = {
  piotroski: number | null; roic: number | null; ey: number | null; momentum: number | null
  precio: number | null; ret28: number | null; ret56: number | null; ret91: number | null
}
