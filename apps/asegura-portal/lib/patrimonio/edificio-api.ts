// EDIFICIO SIN DIVISIÓN HORIZONTAL (27/10/2026) — lógica de `POST /api/patrimonio/inmuebles/[id]/unidades` (unidad suelta)
// y `PUT /api/patrimonio/inmuebles/[id]/reparto` (criterio y m²/% de cada unidad), SIN prisma ni sesión (puertos inyectados),
// para probar el aislamiento con `node --test`. Las rutas reales le pasan los puertos de `edificio-bd.ts`.
//
// 🚨 El id de la URL es una PETICIÓN: el puerto `edificio()` lo busca DENTRO de los titulares de `accesos()`. No existe, no
// es tuyo, no es un edificio, está archivado o tu nivel no da de alta → la MISMA 404 `no_encontrado` (nunca 403). La unidad
// nace en el TITULAR del edificio (lo pone el servidor, no el cuerpo): nunca puede colgar de un edificio de otro titular
// (además lo cierra la FK compuesta de la BD). Las unidades del cuerpo del reparto se buscan DENTRO de las del edificio.
import { MAX_UNIDADES_EDIFICIO, esCriterioReparto, pesosDeReparto, puede, puedeColgarDe, type CriterioReparto, type NivelPatrimonio } from '@central/module-patrimonio'

import { USOS_INMUEBLE, type UsoInmueble } from './usos.ts'

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>

export type UnidadDeEdificio = { id: string; alias: string; superficieM2: number | null; repartoPorcentaje: number | null }

export type EdificioAutorizado = {
  id: string
  /** Ficha del titular (clave de `accesos`). */
  clienteId: string
  titularId: string
  uso: string
  inmueblePadreId: string | null
  archivado: boolean
  unidades: UnidadDeEdificio[]
}

export interface PuertosEdificio {
  accesos(): Promise<AccesosMapa>
  /** El inmueble SOLO si cuelga de un titular de `accesos`. `null` = no existe o no es tuyo. */
  edificio(id: string, accesos: AccesosMapa): Promise<EdificioAutorizado | null>
  crearUnidad(x: { edificio: EdificioAutorizado; alias: string; uso: UsoInmueble; superficieM2: number | null }): Promise<{ id: string }>
  guardarReparto(x: { edificio: EdificioAutorizado; criterio: CriterioReparto | null; unidades: { id: string; superficieM2: number | null; porcentaje: number | null }[] }): Promise<void>
}

export type Respuesta = { status: number; body: Record<string, unknown> }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El edificio pedido, dentro de lo autorizado y con nivel de alta. `null` = 404. */
async function edificioConAlta(p: PuertosEdificio, id: string): Promise<EdificioAutorizado | null> {
  if (!UUID.test(id)) return null
  const accesos = await p.accesos()
  if (accesos.size === 0) return null
  const ed = await p.edificio(id, accesos)
  if (!ed || !accesos.has(ed.clienteId) || !puede(accesos.get(ed.clienteId), 'alta_baja')) return null
  return ed
}

/** m² del cuerpo: ausente/vacío = no consta (`null`); un número raro es un error, no un 0. */
function m2(v: unknown): { ok: true; v: number | null } | { ok: false } {
  if (v === undefined || v === null || v === '') return { ok: true, v: null }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  if (!Number.isFinite(n) || n <= 0 || n > 99_999_999) return { ok: false }
  return { ok: true, v: Math.round(n * 100) / 100 }
}

function pct(v: unknown): { ok: true; v: number | null } | { ok: false } {
  if (v === undefined || v === null || v === '') return { ok: true, v: null }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false }
  return { ok: true, v: Math.round(n * 100) / 100 }
}

export async function responderNuevaUnidad(p: PuertosEdificio, edificioId: string, cuerpo: unknown): Promise<Respuesta> {
  const ed = await edificioConAlta(p, edificioId)
  if (!ed) return NO_ENCONTRADO
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const uso = (b.uso === undefined ? 'vivienda' : b.uso) as UsoInmueble
  if (!(USOS_INMUEBLE as readonly string[]).includes(uso)) return { status: 400, body: { error: 'datos_invalidos', campo: 'uso' } }
  const cuelga = puedeColgarDe({ id: ed.id, titularId: ed.titularId, uso: ed.uso, inmueblePadreId: ed.inmueblePadreId, archivado: ed.archivado }, { titularId: ed.titularId, uso })
  if (!cuelga.ok) {
    // Un inmueble que no es edificio (o archivado, o una unidad): para quien pide es «no hay tal edificio».
    if (cuelga.motivo === 'unidad_no_puede_ser_edificio') return { status: 400, body: { error: 'datos_invalidos', campo: 'uso' } }
    return NO_ENCONTRADO
  }
  const alias = typeof b.alias === 'string' ? b.alias.trim().replace(/\s+/g, ' ') : ''
  if (alias.length < 1 || alias.length > 80) return { status: 400, body: { error: 'datos_invalidos', campo: 'alias' } }
  if (ed.unidades.some((u) => u.alias.toLocaleLowerCase('es') === alias.toLocaleLowerCase('es'))) return { status: 409, body: { error: 'ya_existe' } }
  if (ed.unidades.length >= MAX_UNIDADES_EDIFICIO) return { status: 409, body: { error: 'demasiadas_unidades' } }
  const sup = m2(b.superficieM2)
  if (!sup.ok) return { status: 400, body: { error: 'datos_invalidos', campo: 'superficieM2' } }
  const r = await p.crearUnidad({ edificio: ed, alias, uso, superficieM2: sup.v })
  return { status: 201, body: { id: r.id } }
}

/**
 * Criterio (`m2` | `porcentaje` | `null` = sin elegir) y, por unidad, m² y %. Lo que no viene en el cuerpo no se toca; una
 * unidad que no es de ESTE edificio es 404 (no se escribe nada). Guardar un reparto incompleto se permite (el propietario
 * puede ir rellenando); la respuesta dice si ya reparte (`reparte`) o qué falta (`motivo`, `unidades`).
 */
export async function responderReparto(p: PuertosEdificio, edificioId: string, cuerpo: unknown): Promise<Respuesta> {
  const ed = await edificioConAlta(p, edificioId)
  if (!ed || ed.uso !== 'edificio' || ed.inmueblePadreId !== null || ed.archivado) return NO_ENCONTRADO
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  let criterio: CriterioReparto | null
  if (b.criterio === null || b.criterio === '' || b.criterio === undefined) criterio = null
  else if (esCriterioReparto(b.criterio)) criterio = b.criterio
  else return { status: 400, body: { error: 'datos_invalidos', campo: 'criterio' } }

  const pedidas = Array.isArray(b.unidades) ? b.unidades : b.unidades === undefined ? [] : null
  if (pedidas === null || pedidas.length > MAX_UNIDADES_EDIFICIO) return { status: 400, body: { error: 'datos_invalidos', campo: 'unidades' } }
  const propias = new Map(ed.unidades.map((u) => [u.id, u]))
  const cambios = new Map<string, { superficieM2: number | null; porcentaje: number | null }>()
  for (const x of pedidas) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const actual = propias.get(id)
    if (!actual) return NO_ENCONTRADO
    const s = 'superficieM2' in o ? m2(o.superficieM2) : { ok: true as const, v: actual.superficieM2 }
    if (!s.ok) return { status: 400, body: { error: 'datos_invalidos', campo: 'superficieM2', unidad: id } }
    const q = 'porcentaje' in o ? pct(o.porcentaje) : { ok: true as const, v: actual.repartoPorcentaje }
    if (!q.ok) return { status: 400, body: { error: 'datos_invalidos', campo: 'porcentaje', unidad: id } }
    cambios.set(id, { superficieM2: s.v, porcentaje: q.v })
  }
  const unidades = ed.unidades.map((u) => ({ id: u.id, ...(cambios.get(u.id) ?? { superficieM2: u.superficieM2, porcentaje: u.repartoPorcentaje }) }))
  await p.guardarReparto({ edificio: ed, criterio, unidades: unidades.filter((u) => cambios.has(u.id)) })
  const r = pesosDeReparto(criterio, unidades)
  return { status: 200, body: r.ok ? { reparte: true, criterio } : { reparte: false, motivo: r.motivo, unidades: r.unidades } }
}
