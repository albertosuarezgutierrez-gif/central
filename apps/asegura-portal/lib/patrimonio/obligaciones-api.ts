// PATRIMONIO (25/10/2026) — OBLIGACIONES Y RECORDATORIOS PROPIOS de un inmueble: lógica de la sección de la ficha y de
// `POST /api/patrimonio/inmuebles/[id]/obligaciones`, SIN prisma ni sesión (puertos inyectados, `hoy` inyectado) para
// poder probar el aislamiento con `node --test`. Los puertos reales están en `obligaciones-bd.ts`.
//
// 🚨 Aislamiento: el inmueble del URL se busca DENTRO de los titulares autorizados; ajeno, inexistente o sin nivel →
// la MISMA 404 `no_encontrado` (nunca 403). Una obligación del cuerpo se busca DENTRO de ese inmueble y solo si es PROPIA
// (`categoria` no nula): las precargadas/derivadas no se editan ni se archivan desde aquí.
// 🚨 Inmueble archivado = solo lectura (409 `inmueble_archivado`). Baja = archivar; nunca DELETE.
import {
  CATALOGO_CATEGORIAS,
  MAX_PROPIAS_POR_INMUEBLE,
  MESES_DE_PERIODICIDAD,
  esFecha,
  periodicidadDeMeses,
  puede,
  trasMarcarHecha,
  validarObligacionPropia,
  type CategoriaObligacionPropia,
  type Fecha,
  type NivelPatrimonio,
  type ObligacionPropiaValida,
  type PeriodicidadPropia,
} from '@central/module-patrimonio'

export type InmuebleDeObligaciones = { id: string; nivel: NivelPatrimonio; archivado: boolean }

/** Una fila PROPIA viva, ya leída. `periodicidadMeses` crudo: un valor que no entendemos no se disfraza. */
export type FilaPropia = {
  id: string
  categoria: CategoriaObligacionPropia
  vence: Fecha | null
  periodicidadMeses: number | null
  descripcion: string | null
}

export interface PuertosObligaciones {
  /** El inmueble SOLO si cuelga de un titular autorizado a esta sesión (incluso archivado). `null` = 404. */
  inmueble(idPedido: string): Promise<InmuebleDeObligaciones | null>
  /** Propias VIVAS (sin archivar) del inmueble ya autorizado. */
  propias(inmuebleId: string): Promise<FilaPropia[]>
  crear(inmuebleId: string, v: ObligacionPropiaValida): Promise<void>
  /** Solo si la fila es propia, viva y de ESE inmueble. `false` = no existe ahí. */
  actualizar(inmuebleId: string, id: string, v: ObligacionPropiaValida): Promise<boolean>
  /** Mueve `vence` (y sella `ultima`/`avisada_en` a null). Mismas condiciones que `actualizar`. */
  avanzar(inmuebleId: string, id: string, vence: Fecha, hechaEn: Fecha): Promise<boolean>
  archivar(inmuebleId: string, id: string): Promise<boolean>
}

export type PropiaPintable = {
  id: string
  categoria: CategoriaObligacionPropia
  etiqueta: string
  vence: Fecha | null
  /** `null` = periodicidad guardada que no sabemos leer (la pantalla lo dice, no la inventa). */
  periodicidad: PeriodicidadPropia | null
  descripcion: string | null
}

export type ObligacionesDeInmueble = {
  inmuebleId: string
  propias: PropiaPintable[]
  /** Puede crear/editar/archivar: nivel suficiente Y inmueble no archivado. */
  puedeEditar: boolean
}

export type Respuesta = { status: number; body: Record<string, unknown> }
const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Todo lo que pinta la sección de la ficha. `null` = 404. Leer exige poder `ver` (cualquier nivel reconocido). */
export async function obligacionesDeInmueble(p: PuertosObligaciones, idPedido: unknown): Promise<ObligacionesDeInmueble | null> {
  if (typeof idPedido !== 'string' || !UUID.test(idPedido)) return null
  const inm = await p.inmueble(idPedido)
  if (inm === null || !puede(inm.nivel, 'ver')) return null
  const filas = await p.propias(inm.id)
  const propias = filas
    .map((f): PropiaPintable => ({
      id: f.id,
      categoria: f.categoria,
      etiqueta: CATALOGO_CATEGORIAS[f.categoria].etiqueta,
      vence: f.vence,
      periodicidad: periodicidadDeMeses(f.periodicidadMeses),
      descripcion: f.descripcion,
    }))
    .sort((a, b) => (a.vence === null ? 1 : b.vence === null ? -1 : a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0))
  return { inmuebleId: inm.id, propias, puedeEditar: !inm.archivado && puede(inm.nivel, 'gestionar_obligaciones') }
}

/**
 * `POST /api/patrimonio/inmuebles/[id]/obligaciones`. Acciones: `crear` · `editar` (+`obligacionId`) · `hecha`
 * (+`obligacionId`) · `archivar` (+`obligacionId`). `hoy` (`YYYY-MM-DD`, día de Madrid) lo pone quien llama.
 */
export async function responderObligaciones(p: PuertosObligaciones, idPedido: unknown, cuerpo: unknown, hoy: Fecha): Promise<Respuesta> {
  if (typeof idPedido !== 'string' || !UUID.test(idPedido)) return NO_ENCONTRADO
  const inm = await p.inmueble(idPedido)
  // Ajeno, inexistente o sin nivel para gestionar: la MISMA 404 (nunca 403).
  if (inm === null || !puede(inm.nivel, 'gestionar_obligaciones')) return NO_ENCONTRADO
  const c = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null
  if (c === null) return { status: 400, body: { error: 'datos_invalidos' } }
  if (!esFecha(hoy)) throw new Error('hoy_invalido')
  if (inm.archivado) return { status: 409, body: { error: 'inmueble_archivado' } }

  if (c.accion === 'crear') {
    const v = validarObligacionPropia(c)
    if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
    if ((await p.propias(inm.id)).length >= MAX_PROPIAS_POR_INMUEBLE) return { status: 409, body: { error: 'demasiadas' } }
    await p.crear(inm.id, v.valor)
    return { status: 201, body: { ok: true } }
  }

  if (c.accion === 'editar' || c.accion === 'hecha' || c.accion === 'archivar') {
    if (typeof c.obligacionId !== 'string' || !UUID.test(c.obligacionId)) return { status: 400, body: { error: 'datos_invalidos', campo: 'obligacionId' } }
    if (c.accion === 'archivar') return (await p.archivar(inm.id, c.obligacionId)) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
    if (c.accion === 'editar') {
      const v = validarObligacionPropia(c)
      if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
      return (await p.actualizar(inm.id, c.obligacionId, v.valor)) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
    }
    // hecha: la fila se busca DENTRO de las propias de este inmueble.
    const fila = (await p.propias(inm.id)).find((f) => f.id === c.obligacionId)
    if (!fila) return NO_ENCONTRADO
    if (fila.vence === null) return { status: 409, body: { error: 'sin_fecha' } }
    const t = trasMarcarHecha(fila.vence, fila.periodicidadMeses, hoy)
    if (t === null) return { status: 409, body: { error: 'periodicidad_desconocida' } }
    const ok = t.accion === 'archivar' ? await p.archivar(inm.id, fila.id) : await p.avanzar(inm.id, fila.id, t.vence, hoy)
    return ok ? { status: 200, body: { ok: true, ...(t.accion === 'avanzar' ? { vence: t.vence } : { archivada: true }) } } : NO_ENCONTRADO
  }

  return { status: 400, body: { error: 'datos_invalidos', campo: 'accion' } }
}

/** Lo que se guarda en `periodicidad_meses` para una periodicidad validada. */
export const mesesAGuardar = (p: PeriodicidadPropia): number | null => MESES_DE_PERIODICIDAD[p]
