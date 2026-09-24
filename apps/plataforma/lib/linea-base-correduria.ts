// Línea base semanal de la correduría (§N.2 de ASegura OS) — la parte PURA: leer la respuesta del
// puerto y montar la tabla. La importa el client component y la prueba
// `test/regression-linea-base-correduria.test.ts`. La red y la BD viven en `linea-base-correduria-red.ts`.
import {
  SERIES_LINEA_BASE,
  celdasSerie,
  proporcionAutomatica,
  semanasLineaBase,
  type CeldaSemana,
  type SerieLineaBase,
} from '@central/module-seguros'

export type Conteos = Record<string, number>

export type LecturaCartera =
  | { estado: 'ok'; conteos: Partial<Record<SerieLineaBase, Conteos>> }
  | { estado: 'sin_configurar' | 'no_desplegado' }
  | { estado: 'error'; motivo: string }

const SEMANA = /^\d{4}-\d{2}-\d{2}$/

function conteos(v: unknown): Conteos | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const out: Conteos = {}
  for (const [k, n] of Object.entries(v)) {
    if (!SEMANA.test(k) || typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null
    out[k] = n
  }
  return out
}

/** Una serie ilegible tumba la lectura: pintarla a 0 diría que esa semana no pasó nada. */
export function interpretarCartera(status: number, json: unknown): LecturaCartera {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_desplegado' }
  if (status !== 200 || o.estado !== 'ok') return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? `HTTP ${status}`) }
  const c = (typeof o.conteos === 'object' && o.conteos !== null ? o.conteos : null) as Record<string, unknown> | null
  if (!c) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const out: Partial<Record<SerieLineaBase, Conteos>> = {}
  for (const def of SERIES_LINEA_BASE) {
    if (def.fuente !== 'asegura' || c[def.id] === undefined) continue
    const x = conteos(c[def.id])
    if (!x) return { estado: 'error', motivo: 'respuesta_ilegible' }
    out[def.id] = x
  }
  return { estado: 'ok', conteos: out }
}

export type FilaTabla = { id: SerieLineaBase; etiqueta: string; celdas: CeldaSemana[] }

export type TablaLineaBase = {
  semanas: string[]
  filas: FilaTabla[]
  /** Parte de los cambios que hizo el sistema, por semana (0-1). `null` = no se puede decir. */
  automatica: (number | null)[]
  /** Por qué falta una fuente, para decirlo en pantalla. */
  avisos: string[]
}

/**
 * Junta las dos fuentes. Si una falla, sus series salen a `null` con su aviso; la otra se ve igual.
 * `correos === null` = no se pudo contar el correo (no «0 correos»).
 */
export function montarTabla(cartera: LecturaCartera, correos: Conteos | null, ahora: Date): TablaLineaBase {
  const semanas = semanasLineaBase(ahora)
  const avisos: string[] = []
  if (correos === null) avisos.push('No se ha podido contar el correo.')
  if (cartera.estado !== 'ok') {
    avisos.push(`No se ha podido leer la cartera (${cartera.estado === 'error' ? cartera.motivo : cartera.estado}).`)
  }
  const filas = SERIES_LINEA_BASE.map((def) => {
    let fuente: Conteos | null
    if (def.fuente === 'plataforma') fuente = correos
    else fuente = cartera.estado === 'ok' ? (cartera.conteos[def.id] ?? {}) : null
    return { id: def.id, etiqueta: def.etiqueta, celdas: celdasSerie(fuente, semanas, def.desde, ahora) }
  })
  const fila = (id: SerieLineaBase) => filas.find((f) => f.id === id)!.celdas
  const auto = fila('automaticas')
  const mano = fila('a_mano')
  return { semanas, filas, automatica: semanas.map((_, i) => proporcionAutomatica(auto[i], mano[i])), avisos }
}

/** «21/09». */
export function etiquetaSemana(lunes: string): string {
  return `${lunes.slice(8, 10)}/${lunes.slice(5, 7)}`
}
