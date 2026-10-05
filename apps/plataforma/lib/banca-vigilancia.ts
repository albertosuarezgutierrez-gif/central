// lib/banca-vigilancia.ts — lógica PURA de dos avisos de banca (cron banca-alertas):
//  1. frescura POR CUENTA: una cuenta/tarjeta activa que lleva > N días sin un movimiento nuevo.
//  2. picos de gasto recurrente: un proveedor con ≥3 cargos en 6 meses cuyo gasto de los últimos
//     30 días supera 2× su media mensual previa.
// Sin BD ni red: las consultas viven en banca-vigilancia-datos.ts. Fechas en 'YYYY-MM-DD'.
import { eur } from './dinero.ts'
import { claveComercio } from './comercio-canonico.ts'

const DIA_MS = 86_400_000
const aDia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DIA_MS
export const diasEntre = (desde: string, hasta: string) => Math.round(aDia(hasta) - aDia(desde))

// ── 1. Frescura por cuenta ───────────────────────────────────────────────────────────────────
export type CuentaFrescura = {
  banco: string
  alias: string | null
  iban: string | null          // IBAN o máscara; solo se usan los 4 últimos si son dígitos
  oculta: boolean
  ultimoMovimiento: string | null   // 'YYYY-MM-DD'; null = sin movimientos
}
export type CuentaAviso = { etiqueta: string; ultimo: string; dias: number }

/** «Kutxabank ·0855». Máscaras tipo «IDAD»/«NUAL» (no son dígitos) no se enseñan: sería inventar. */
export function etiquetaCuenta(c: Pick<CuentaFrescura, 'banco' | 'alias' | 'iban'>): string {
  const nombre = (c.alias?.trim() || c.banco).trim()
  const l4 = /\d{4}$/.exec((c.iban ?? '').replace(/\s+/g, ''))?.[0]
  return l4 ? `${nombre} ·${l4}` : nombre
}

/**
 * Cuentas ACTIVAS (no ocultas) con movimientos en la ventana (180 d) pero sin ninguno nuevo desde
 * hace > `umbralDias`. Sin movimientos nunca (null) NO se afirma nada: «no sé» ≠ «parada».
 * `ocultas` = cuentas ocultas con movimientos en la ventana, para que no se olviden.
 */
export function frescuraCuentas(
  cuentas: CuentaFrescura[], hoy: string, umbralDias = 3, ventanaDias = 180,
): { obsoletas: CuentaAviso[]; ocultas: CuentaAviso[] } {
  const obsoletas: CuentaAviso[] = []
  const ocultas: CuentaAviso[] = []
  for (const c of cuentas) {
    if (!c.ultimoMovimiento) continue
    const dias = diasEntre(c.ultimoMovimiento, hoy)
    if (dias > ventanaDias) continue
    const fila = { etiqueta: etiquetaCuenta(c), ultimo: c.ultimoMovimiento, dias }
    if (c.oculta) ocultas.push(fila)
    else if (dias > umbralDias) obsoletas.push(fila)
  }
  obsoletas.sort((a, b) => b.dias - a.dias)
  ocultas.sort((a, b) => a.dias - b.dias)
  return { obsoletas, ocultas }
}

export function textoFrescura(
  r: { obsoletas: CuentaAviso[]; ocultas: CuentaAviso[] },
  esc: (s: string) => string, umbralDias = 3,
): string | null {
  const l: string[] = []
  if (r.obsoletas.length) {
    l.push(`🏦 <b>Cuentas sin movimientos nuevos</b> (más de ${umbralDias} días):`)
    for (const o of r.obsoletas) l.push(`• ${esc(o.etiqueta)} — último ${o.ultimo} (hace ${o.dias} d)`)
  }
  if (r.ocultas.length) {
    if (l.length) l.push('')
    l.push(`🙈 ${r.ocultas.length} cuentas ocultas con movimientos recientes: ${r.ocultas.map(o => `${esc(o.etiqueta)} (${o.ultimo})`).join('; ')}`)
  }
  return l.length ? l.join('\n') : null
}

// ── 2. Picos de gasto recurrente ─────────────────────────────────────────────────────────────
export type Cargo = { fecha: string; proveedor: string; importe: number } // importe > 0 = gasto
export type Pico = { proveedor: string; gastado30: number; mediaMensual: number; cargos: number; ratio: number }

/** Clave de proveedor: normalizador del repo + alias de marcas con varios rótulos bancarios. */
export function claveProveedor(raw: string): string {
  const k = claveComercio(raw)
  if (/\b(ANTHROPIC|CLAUDE AI)\b/.test(k)) return 'ANTHROPIC'
  return k
}

/**
 * Proveedores con ≥ `minCargos` cargos en `ventanaDias` (180) y gasto de los últimos 30 días >
 * `factor`× su media mensual PREVIA (gasto en [hoy-180, hoy-30] / 5 meses). Sin gasto previo no hay
 * media (proveedor nuevo): no se afirma pico. `minGasto30` filtra ruido de céntimos.
 */
export function picosGasto(
  cargos: Cargo[], hoy: string,
  o: { factor?: number; minCargos?: number; ventanaDias?: number; minGasto30?: number } = {},
): Pico[] {
  const { factor = 2, minCargos = 3, ventanaDias = 180, minGasto30 = 50 } = o
  const mesesPrevios = (ventanaDias - 30) / 30
  const por = new Map<string, { nombre: string; n: number; g30: number; previo: number }>()
  for (const c of cargos) {
    if (!(c.importe > 0)) continue
    const edad = diasEntre(c.fecha, hoy)
    if (edad < 0 || edad >= ventanaDias) continue
    const k = claveProveedor(c.proveedor)
    if (!k) continue
    const e = por.get(k) ?? { nombre: k, n: 0, g30: 0, previo: 0 }
    e.n += 1
    if (edad < 30) e.g30 += c.importe
    else e.previo += c.importe
    por.set(k, e)
  }
  const picos: Pico[] = []
  for (const [prov, e] of por) {
    if (e.n < minCargos || e.previo <= 0 || e.g30 < minGasto30) continue
    const media = e.previo / mesesPrevios
    if (e.g30 > factor * media) picos.push({ proveedor: prov, gastado30: e.g30, mediaMensual: media, cargos: e.n, ratio: e.g30 / media })
  }
  return picos.sort((a, b) => b.gastado30 - a.gastado30)
}

/** Une picos de dos fuentes (movimientos y gastos) SIN sumar: una factura y su cargo son el mismo gasto. */
export function fusionarPicos(a: Pico[], b: Pico[]): Pico[] {
  const m = new Map<string, Pico>()
  for (const p of [...a, ...b]) {
    const previo = m.get(p.proveedor)
    if (!previo || p.cargos > previo.cargos) m.set(p.proveedor, p)
  }
  return [...m.values()].sort((x, y) => y.gastado30 - x.gastado30)
}

export function textoPicos(picos: Pico[], esc: (s: string) => string): string | null {
  if (!picos.length) return null
  return [
    '📈 <b>Gasto recurrente disparado</b> (30 d &gt; 2× su media mensual):',
    ...picos.map(p => `• ${esc(p.proveedor)} — ${eur(p.gastado30)} en 30 d vs media ${eur(p.mediaMensual)}/mes (×${p.ratio.toFixed(1).replace('.', ',')}; ${p.cargos} cargos en 6 m)`),
  ].join('\n')
}
