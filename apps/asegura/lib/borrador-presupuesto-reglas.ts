/**
 * Reglas PURAS del borrador de presupuesto en servidor (05/10/2026). Sin BD ni red: las prueba
 * `borrador-presupuesto-reglas.test.ts`. Tabla: `seguros.borradores_presupuesto`
 * (`prisma/sql/2026-10-05_borradores_presupuesto.sql`).
 *
 * Validador propio (patrón «validator custom»), no Zod: el cuerpo es pequeño y lo único que hay que
 * fijar es forma + tamaño + marca de tiempo creíble. Nunca `as` tras `JSON.parse`.
 *
 * Un borrador NO es una oportunidad ni una cotización: aquí no se decide nada de la cartera.
 */

export const RAMOS_BORRADOR = ['auto', 'moto', 'hogar', 'salud', 'vida', 'decesos'] as const
export type RamoBorrador = (typeof RAMOS_BORRADOR)[number]

/** Tope del JSON tecleado (en caracteres). Un formulario real ocupa ~2-4 KB; esto frena basura, no uso. */
export const MAX_DATOS_BORRADOR = 64_000

/** Antes de esto no existía la pantalla: una marca anterior es un reloj roto o basura. */
const MARCA_MINIMA = Date.UTC(2026, 0, 1)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BorradorEntrante = {
  clienteId: string
  oportunidadId: string | null
  ramo: RamoBorrador
  datos: Record<string, unknown>
  /** Cuándo se tecleó (ms, reloj del navegador). Se recorta con `marcaCreible()` al guardar. */
  guardadoEn: number
  actor: string
}

export type Revision<T> = { ok: true; valor: T } | { ok: false; motivo: string }

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function esRamoBorrador(v: unknown): v is RamoBorrador {
  return typeof v === 'string' && (RAMOS_BORRADOR as readonly string[]).includes(v)
}

function oportunidadDe(v: unknown): Revision<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, valor: null }
  if (typeof v === 'string' && UUID.test(v)) return { ok: true, valor: v.toLowerCase() }
  return { ok: false, motivo: 'oportunidadId no es un uuid' }
}

/** Cuerpo de `POST /api/operador/borrador-presupuesto` (guardar). */
export function revisarBorradorEntrante(b: unknown): Revision<BorradorEntrante> {
  if (!esObjetoPlano(b)) return { ok: false, motivo: 'cuerpo no es un objeto' }
  if (typeof b.clienteId !== 'string' || !UUID.test(b.clienteId)) return { ok: false, motivo: 'clienteId no es un uuid' }
  const op = oportunidadDe(b.oportunidadId)
  if (!op.ok) return op
  if (!esRamoBorrador(b.ramo)) return { ok: false, motivo: 'ramo desconocido' }
  if (!esObjetoPlano(b.datos)) return { ok: false, motivo: 'datos no es un objeto' }
  let tam: number
  try {
    tam = JSON.stringify(b.datos).length
  } catch {
    return { ok: false, motivo: 'datos no serializables' }
  }
  if (tam > MAX_DATOS_BORRADOR) return { ok: false, motivo: `datos demasiado grandes (${tam} > ${MAX_DATOS_BORRADOR})` }
  const g = b.guardadoEn
  if (typeof g !== 'number' || !Number.isFinite(g) || !Number.isInteger(g) || g < MARCA_MINIMA) {
    return { ok: false, motivo: 'guardadoEn no es una marca de tiempo válida' }
  }
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 200) : 'plataforma'
  return {
    ok: true,
    valor: { clienteId: b.clienteId.toLowerCase(), oportunidadId: op.valor, ramo: b.ramo, datos: b.datos, guardadoEn: g, actor },
  }
}

/** Selector de lectura/borrado: `?clienteId=&ramo=` (y `oportunidadId` opcional para borrar). */
export function revisarSelectorBorrador(
  clienteId: unknown,
  ramo: unknown,
  oportunidadId?: unknown,
): Revision<{ clienteId: string; ramo: RamoBorrador; oportunidadId: string | null }> {
  if (typeof clienteId !== 'string' || !UUID.test(clienteId)) return { ok: false, motivo: 'clienteId no es un uuid' }
  if (!esRamoBorrador(ramo)) return { ok: false, motivo: 'ramo desconocido' }
  const op = oportunidadDe(oportunidadId)
  if (!op.ok) return op
  return { ok: true, valor: { clienteId: clienteId.toLowerCase(), ramo, oportunidadId: op.valor } }
}

/**
 * La marca que se guarda: la del navegador, pero nunca en el FUTURO del servidor. Un equipo con el
 * reloj adelantado ganaría siempre la comparación «el más reciente» y dejaría a los demás sin poder
 * guardar nada encima. Se recorta a `ahora`.
 */
export function marcaCreible(guardadoEn: number, ahora: number): number {
  return Math.min(guardadoEn, ahora)
}
