// Estadísticas de los bots del tarificador (15/10/2026) — PLATAFORMA. Lee `/api/operador/tarificador/estadisticas` de asegura
// (solo agregados por compañía × ramo × versión del bot) y lo deja listo para pintar. PURO y con test: `null` = «sin datos»
// (nunca 0) y un fallo del puerto NO es «no hay trabajos».

import { eur } from './dinero.ts'
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

export type Madurez = 'estable' | 'en_pruebas' | 'sin_precio'
/** Madurez y coste ESTIMADO (Fly) por compañía × ramo. `null` = sin datos (nunca 0). */
export type ParejaBot = {
  compania: string
  ramo: string
  madurez: Madurez
  ok7d: number
  fallos7d: number
  trabajos30d: number
  sinMedir30d: number
  segMedioPorTrabajo: number | null
  costeMedioEur: number | null
  costeTotal30dEur: number | null
}

export type LecturaEstadisticas =
  | { estado: 'ok'; filas: FilaBot[]; parejas: ParejaBot[]; parejasIlegibles: boolean; generadoEn: string | null; atascosDisponibles: boolean | null; ilegibles: number }
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
  // `parejas` ausente (asegura sin desplegar esta versión) ≠ lista vacía: se avisa en vez de pintar «sin precio» a todos.
  const parejasCrudas = Array.isArray(o.parejas) ? o.parejas : null
  const parejas: ParejaBot[] = []
  for (const p of parejasCrudas ?? []) {
    const x = obj(p)
    const compania = cadena(x?.compania), ramo = cadena(x?.ramo)
    const madurez = x?.madurez === 'estable' || x?.madurez === 'en_pruebas' || x?.madurez === 'sin_precio' ? x.madurez : null
    if (!x || !compania || !ramo || !madurez) { ilegibles++; continue }
    parejas.push({
      compania, ramo, madurez,
      ok7d: entero(x.ok7d) ?? 0, fallos7d: entero(x.fallos7d) ?? 0, trabajos30d: entero(x.trabajos30d) ?? 0, sinMedir30d: entero(x.sinMedir30d) ?? 0,
      segMedioPorTrabajo: decimal(x.segMedioPorTrabajo), costeMedioEur: decimal(x.costeMedioEur), costeTotal30dEur: decimal(x.costeTotal30dEur),
    })
  }
  return { estado: 'ok', filas, parejas, parejasIlegibles: parejasCrudas === null, generadoEn: cadena(o.generadoEn), atascosDisponibles: typeof o.atascosDisponibles === 'boolean' ? o.atascosDisponibles : null, ilegibles }
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

export const ETIQUETA_MADUREZ: Record<Madurez, { texto: string; tono: 'positivo' | 'aviso' | 'negativo'; ayuda: string }> = {
  estable: { texto: 'Estable', tono: 'positivo', ayuda: 'Al menos 3 trabajos con precio y 0 fallos de portal en los últimos 7 días' },
  en_pruebas: { texto: 'En pruebas', tono: 'aviso', ayuda: 'Ya ha dado algún precio, pero no cumple lo de estable' },
  sin_precio: { texto: 'Sin precio', tono: 'negativo', ayuda: 'Nunca ha dado un precio' },
}

/** Coste ESTIMADO en euros: «2,50€»; null → «sin datos»; un importe real por debajo del céntimo → «<0,01€» (nunca «0,00€»). */
export function textoCoste(n: number | null): string {
  if (n === null) return 'sin datos'
  if (n > 0 && n < 0.005) return '<0,01€'
  return eur(n)
}
