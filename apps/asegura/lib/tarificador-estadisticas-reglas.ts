// Estadísticas de los bots del tarificador RPA (15/10/2026) — la parte PURA: de las filas agregadas del SQL a lo que sale
// por el puerto. Solo AGREGADOS por compañía × ramo × versión del bot: ningún dato personal, ni columnas de riesgo, ni el
// error crudo. `null` = «sin datos» (nunca 0): un porcentaje sin trabajos o un tiempo sin ningún `ok` medible es `null`.

export const VENTANAS_DIAS = [7, 30] as const
export const TOP_ATASCOS = 5
const MAX_CLAVE = 80

export type FilaAgregada = {
  dias: number
  compania: string
  ramo: string
  bot_version: string | null
  total: unknown
  ok: unknown
  atascado: unknown
  requiere_humano: unknown
  error_definitivo: unknown
  /** Media de iniciado_at→terminado_at de los `ok` con ambas marcas; null si no hay ninguno medible. */
  seg_medio: unknown
}
export type FilaClave = { dias: number; compania: string; ramo: string; bot_version: string | null; clave: string; n: unknown }

export type VentanaEstadistica = {
  total: number
  ok: number
  atascado: number
  requiereHumano: number
  errorDefinitivo: number
  /** % de trabajos con precio (estado ok), 0-100 con un decimal; null si no hay trabajos. */
  pctOk: number | null
  /** % atascado + requiere_humano + error_definitivo. */
  pctProblema: number | null
  /** Segundos medios hasta el precio; null = sin datos. */
  tiempoMedioSeg: number | null
  topAtascos: { clave: string; n: number }[]
}
export type FilaEstadistica = {
  compania: string
  ramo: string
  botVersion: string | null
  d7: VentanaEstadistica | null
  d30: VentanaEstadistica | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const numONull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const pct = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null)
const clave3 = (c: string, r: string, v: string | null) => JSON.stringify([c, r, v])

export function proyectarVentana(f: FilaAgregada, claves: FilaClave[]): VentanaEstadistica {
  const total = num(f.total)
  const ok = num(f.ok)
  const atascado = num(f.atascado)
  const requiereHumano = num(f.requiere_humano)
  const errorDefinitivo = num(f.error_definitivo)
  const seg = numONull(f.seg_medio)
  return {
    total,
    ok,
    atascado,
    requiereHumano,
    errorDefinitivo,
    pctOk: pct(ok, total),
    pctProblema: pct(atascado + requiereHumano + errorDefinitivo, total),
    tiempoMedioSeg: ok > 0 && seg !== null ? Math.round(seg) : null,
    topAtascos: claves
      .map((c) => ({ clave: String(c.clave).slice(0, MAX_CLAVE), n: num(c.n) }))
      .filter((c) => c.clave.trim() !== '' && c.n > 0)
      .sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave))
      .slice(0, TOP_ATASCOS),
  }
}

export function proyectarEstadisticas(agregadas: FilaAgregada[], claves: FilaClave[]): FilaEstadistica[] {
  const grupos = new Map<string, FilaEstadistica>()
  for (const f of agregadas) {
    const k = clave3(f.compania, f.ramo, f.bot_version ?? null)
    const g = grupos.get(k) ?? { compania: f.compania, ramo: f.ramo, botVersion: f.bot_version ?? null, d7: null, d30: null }
    const delGrupo = claves.filter((c) => c.dias === f.dias && clave3(c.compania, c.ramo, c.bot_version ?? null) === k)
    if (f.dias === 7) g.d7 = proyectarVentana(f, delGrupo)
    else if (f.dias === 30) g.d30 = proyectarVentana(f, delGrupo)
    grupos.set(k, g)
  }
  // Más trabajos en 30 días primero; a igualdad, orden estable por nombre.
  return [...grupos.values()].sort(
    (a, b) => (b.d30?.total ?? 0) - (a.d30?.total ?? 0) || a.compania.localeCompare(b.compania) || a.ramo.localeCompare(b.ramo) || String(b.botVersion).localeCompare(String(a.botVersion)),
  )
}

// ─── Madurez y coste estimado por pareja compañía × ramo (15/10/2026) ─────────────────────────────────────────────
// Se calcula por PAREJA (todas las versiones del bot juntas): la pregunta es «¿puedo fiarme de este bot?», no de qué versión.

/** Trabajos con precio mínimos en 7 días para ser «estable». */
export const MIN_OK_ESTABLE = 3
/**
 * Coste de Fly.io por minuto de bot, en EUROS. ESTIMADO, no medido: shared-cpu-1x ronda 0,0000022 US$/s (~0,00013 US$/min,
 * ~0,00012 €/min) pero un Playwright necesita más memoria que la base, así que se fija un valor CONSERVADOR (más alto)
 * de 0,0002 €/min. Sustitúyelo por el dato de la factura de Fly cuando se tenga; la pantalla lo rotula «estimado».
 */
export const COSTE_FLY_EUR_POR_MINUTO = 0.0002

export type Madurez = 'estable' | 'en_pruebas' | 'sin_precio'

/**
 * - estable: >= MIN_OK_ESTABLE trabajos con precio (estado ok) y 0 fallos de portal en los últimos 7 días.
 * - en_pruebas: algún precio alguna vez, sin llegar a estable.
 * - sin_precio: nunca ha dado precio.
 * «Fallo de portal» = atascado + requiere_humano + error_definitivo (todo lo que no acaba en precio ni sigue en cola).
 * `okSiempre` es el histórico completo (no la ventana de 30 días): «nunca» no puede salir de una ventana.
 */
export function calcularMadurez(x: { ok7d: number; fallos7d: number; okSiempre: number }): Madurez {
  if (x.ok7d >= MIN_OK_ESTABLE && x.fallos7d === 0) return 'estable'
  if (x.okSiempre > 0 || x.ok7d > 0) return 'en_pruebas'
  return 'sin_precio'
}

/** Euros de bot para `segundos` de ejecución a la tarifa estimada. */
export const costeDeSegundos = (segundos: number, eurPorMinuto = COSTE_FLY_EUR_POR_MINUTO): number => (segundos / 60) * eurPorMinuto

export type FilaPareja = {
  compania: string
  ramo: string
  ok_7d: unknown
  fallos_7d: unknown
  ok_siempre: unknown
  trabajos_30d: unknown
  /** Trabajos de 30 días con iniciado_at y terminado_at medibles. */
  medidos_30d: unknown
  /** Suma de segundos de esos trabajos medidos. */
  seg_total_30d: unknown
}
export type ParejaEstadistica = {
  compania: string
  ramo: string
  madurez: Madurez
  ok7d: number
  fallos7d: number
  trabajos30d: number
  /** Trabajos de 30 días sin duración medible (no entran en el coste). */
  sinMedir30d: number
  /** Segundos medios por trabajo medido; null = ninguno medible. */
  segMedioPorTrabajo: number | null
  /** € ESTIMADOS (COSTE_FLY_EUR_POR_MINUTO). null = sin datos, nunca 0. */
  costeMedioEur: number | null
  costeTotal30dEur: number | null
}

export function proyectarParejas(filas: FilaPareja[]): ParejaEstadistica[] {
  return filas
    .map((f): ParejaEstadistica => {
      const ok7d = num(f.ok_7d), fallos7d = num(f.fallos_7d), okSiempre = num(f.ok_siempre)
      const trabajos30d = num(f.trabajos_30d), medidos = Math.min(num(f.medidos_30d), trabajos30d), seg = num(f.seg_total_30d)
      const hayCoste = medidos > 0
      return {
        compania: f.compania,
        ramo: f.ramo,
        madurez: calcularMadurez({ ok7d, fallos7d, okSiempre }),
        ok7d,
        fallos7d,
        trabajos30d,
        sinMedir30d: trabajos30d - medidos,
        segMedioPorTrabajo: hayCoste ? Math.round(seg / medidos) : null,
        costeMedioEur: hayCoste ? costeDeSegundos(seg / medidos) : null,
        costeTotal30dEur: hayCoste ? costeDeSegundos(seg) : null,
      }
    })
    .sort((a, b) => b.trabajos30d - a.trabajos30d || a.compania.localeCompare(b.compania) || a.ramo.localeCompare(b.ramo))
}
