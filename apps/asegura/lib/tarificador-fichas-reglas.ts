// Fichas de producto del tarificador — reglas PURAS de la parte con BD (07/10/2026). Cubiertas por
// `tarificador-fichas-reglas.test.ts`. La BD está en `tarificador-fichas.ts`; el PDF + IA en `tarificador-fichas-ia.ts`.

import { comprobarCondicionado, type CondicionesProducto } from '@central/module-tarificacion'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DatosProyecto = { compania: string; producto: string | null; documentoId: string | null; primaAnualEur: number | null }

/**
 * Lo que hace falta del `respuesta` jsonb de una tarificación RPA: compañía, producto (de la oferta con PDF o la
 * primera), id del PDF del proyecto y prima. `null` = no es una respuesta del canal RPA.
 */
export function datosProyecto(respuesta: unknown): DatosProyecto | null {
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) return null
  const r = respuesta as Record<string, unknown>
  if (r.canal !== 'rpa' || typeof r.compania !== 'string' || !r.compania.trim()) return null
  const ofertas = Array.isArray(r.ofertas) ? r.ofertas.filter((o): o is Record<string, unknown> => !!o && typeof o === 'object') : []
  const documentoId = typeof r.proyectoDocumentoId === 'string' && UUID.test(r.proyectoDocumentoId) ? r.proyectoDocumentoId : null
  const oferta = ofertas.find((o) => o.documentoId === documentoId && documentoId !== null) ?? ofertas[0] ?? null
  const producto = oferta && typeof oferta.producto === 'string' && oferta.producto.trim() ? oferta.producto.trim().slice(0, 160) : null
  const prima = oferta && typeof oferta.primaAnualEur === 'number' && Number.isFinite(oferta.primaAnualEur) && oferta.primaAnualEur > 0 ? oferta.primaAnualEur : null
  return { compania: r.compania.trim(), producto, documentoId, primaAnualEur: prima }
}

export type CandidataValidada = { id: string; version: string | null; condiciones: CondicionesProducto }

/**
 * Con fichas VALIDADAS del mismo producto (una por versión), la que mejor casa con el PDF nuevo: la que menos
 * citas pierde. Empate → la primera (vienen ordenadas por validación más reciente). Sin candidatas → `null`.
 */
export function elegirFichaValidada(candidatas: readonly CandidataValidada[], texto: string): { ficha: CandidataValidada; cambiado: boolean; citasAusentes: string[] } | null {
  let mejor: { ficha: CandidataValidada; cambiado: boolean; citasAusentes: string[] } | null = null
  for (const f of candidatas) {
    const c = comprobarCondicionado(f.condiciones, texto)
    if (mejor === null || c.citasAusentes.length < mejor.citasAusentes.length) mejor = { ficha: f, ...c }
  }
  return mejor
}

/** ¿El error es que la tabla de fichas aún no existe (SQL 2026-10-07c sin aplicar)? */
export function esSinTablaFichas(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const meta = (e as { meta?: { code?: string } } | null)?.meta?.code
  return (meta === '42P01' || /42P01|does not exist|no existe/i.test(msg)) && /tarificador_(fichas|coberturas_presupuesto)/.test(msg)
}

export const MENSAJE_SIN_TABLA =
  'Las fichas de producto aún no están activadas: falta aplicar el SQL 2026-10-07c_tarificador_fichas.sql en la BD de la correduría.'

/** Límite de una lista (1..max, por defecto `def`). */
export function limiteLista(v: string | null, def: number, max: number): number {
  const n = Number(v ?? def)
  return Number.isInteger(n) && n >= 1 && n <= max ? n : def
}

export function esUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}
