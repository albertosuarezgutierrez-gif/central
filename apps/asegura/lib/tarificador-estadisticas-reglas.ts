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
