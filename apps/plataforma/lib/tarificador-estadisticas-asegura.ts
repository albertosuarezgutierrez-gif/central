// Estadísticas de los bots del tarificador (15/10/2026) — PLATAFORMA. Lee `/api/operador/tarificador/estadisticas` de asegura
// (solo agregados por compañía × ramo × versión del bot) y lo deja listo para pintar. PURO y con test: `null` = «sin datos»
// (nunca 0) y un fallo del puerto NO es «no hay trabajos».

export type VentanaBot = {
  total: number
  ok: number
  atascado: number
  requiereHumano: number
  errorDefinitivo: number
  pctOk: number | null
  pctProblema: number | null
  tiempoMedioSeg: number | null
  topAtascos: { clave: string; n: number }[]
}
export type FilaBot = { compania: string; ramo: string; botVersion: string | null; d7: VentanaBot | null; d30: VentanaBot | null }

export type LecturaEstadisticas =
  | { estado: 'ok'; filas: FilaBot[]; generadoEn: string | null; atascosDisponibles: boolean | null; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const decimal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

function ventana(v: unknown): VentanaBot | null {
  const o = obj(v)
  if (!o) return null
  const total = entero(o.total)
  if (total === null) return null
  const top = Array.isArray(o.topAtascos) ? o.topAtascos : []
  return {
    total,
    ok: entero(o.ok) ?? 0,
    atascado: entero(o.atascado) ?? 0,
    requiereHumano: entero(o.requiereHumano) ?? 0,
    errorDefinitivo: entero(o.errorDefinitivo) ?? 0,
    pctOk: decimal(o.pctOk),
    pctProblema: decimal(o.pctProblema),
    tiempoMedioSeg: decimal(o.tiempoMedioSeg),
    topAtascos: top.flatMap((t) => { const x = obj(t); const clave = cadena(x?.clave); const n = entero(x?.n); return clave && n !== null ? [{ clave, n }] : [] }).slice(0, 5),
  }
}

/** Una fila rara no desaparece sin más: se cuenta en `ilegibles`. */
export function interpretarEstadisticas(status: number, json: unknown): LecturaEstadisticas {
  const o = obj(json) ?? {}
  if (status === 503 && o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/estadisticas desplegado' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.filas)) return { estado: 'error', causa: cadena(o.causa) ?? `respuesta ilegible (HTTP ${status})` }
  const filas: FilaBot[] = []
  let ilegibles = 0
  for (const f of o.filas) {
    const x = obj(f)
    const compania = cadena(x?.compania), ramo = cadena(x?.ramo)
    if (!x || !compania || !ramo) { ilegibles++; continue }
    filas.push({ compania, ramo, botVersion: cadena(x.botVersion), d7: ventana(x.d7), d30: ventana(x.d30) })
  }
  return { estado: 'ok', filas, generadoEn: cadena(o.generadoEn), atascosDisponibles: typeof o.atascosDisponibles === 'boolean' ? o.atascosDisponibles : null, ilegibles }
}

/** «62,5 %»; null → «sin datos». */
export function textoPorcentaje(p: number | null): string {
  return p === null ? 'sin datos' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`
}

/** «45 s», «1 min 35 s», «2 h 5 min»; null → «sin datos». */
export function textoDuracion(seg: number | null): string {
  if (seg === null) return 'sin datos'
  const s = Math.round(seg)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}
