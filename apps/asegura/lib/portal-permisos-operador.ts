// Permisos del portal vistos por el CORREDOR (26/10/2026): la fuente de `permisos_portal` de la campana de
// plataforma (`/correduria`). PURO: clasifica filas de `seguros.portal_autorizacion` y
// `seguros.portal_peticion_acceso` con las reglas del módulo (`estadoAutorizacion` / `estadoPeticion`), no con
// un `where` que dé por hecho que «sin aceptar» es «pendiente» (una sin aceptar y caducada no es trabajo).
//
// Qué sale:
//   · `pendiente_aceptar`  — autorización otorgada que el autorizado aún no ha aceptado (y no ha caducado).
//   · `aceptada`           — aceptada en los últimos `DIAS_RECIENTES` y sigue vigente.
//   · `revocada`           — revocada en los últimos `DIAS_RECIENTES` (la de `caducidad` NO: es limpieza, no un hecho).
//   · `peticion_pendiente` — alguien pide acceso a una ficha y nadie ha contestado (y no ha caducado).
// Solo cuentan como PENDIENTES las dos que esperan a alguien; las recientes son información.
//
// 🔒 Sin NIF, IBAN ni dirección: solo ids de ficha, el nombre de la ficha, el alcance y fechas. Un nombre que no
// se encuentra (ficha de otra correduría, identidad invitada sin ficha) sale `null`, nunca inventado.
import { estadoAutorizacion, estadoPeticion } from '@central/module-seguros-portal'

export const DIAS_RECIENTES = 7
const MS_DIA = 86_400_000

export type FilaAutorizacionPermiso = {
  id: string
  otorganteClienteId: string
  autorizadoClienteId: string | null
  autorizadoIdentidadId: string | null
  alcance: string
  otorgadoEn: Date
  aceptadoEn: Date | null
  caducaEn: Date | null
  revocadoEn: Date | null
  revocadoPor: string | null
}

export type FilaPeticionPermiso = {
  id: string
  solicitanteClienteId: string | null
  destinatarioClienteId: string | null
  alcance: string
  creadaEn: Date
  caducaEn: Date
  concedidaEn: Date | null
  rechazadaEn: Date | null
  retiradaEn: Date | null
}

export type EventoPermiso = 'pendiente_aceptar' | 'aceptada' | 'revocada' | 'peticion_pendiente'

export type MovimientoPermiso = {
  id: string
  evento: EventoPermiso
  alcance: string
  /** Cuándo pasó lo que se cuenta (otorgada / aceptada / revocada / pedida), ISO. */
  fecha: string
  /** Quien da (otorgante) o quien pide (solicitante). */
  deClienteId: string | null
  de: string | null
  /** Quien recibe (autorizado) o a quien se le pide (destinatario). `null` + `aInvitado` = identidad sin ficha. */
  aClienteId: string | null
  a: string | null
  aInvitado: boolean
  /** Solo en `revocada`: `otorgante` | `autorizado` | `corredor`. */
  revocadoPor: string | null
}

export type PermisosPortal = {
  /** Esperan a alguien: `pendiente_aceptar` + `peticion_pendiente`. */
  pendientes: number
  /** Aceptadas o revocadas en los últimos días (información, no cuenta en la campana). */
  recientes: number
  movimientos: MovimientoPermiso[]
}

const PENDIENTE: ReadonlySet<EventoPermiso> = new Set(['pendiente_aceptar', 'peticion_pendiente'])

function reciente(d: Date | null, ahora: Date): boolean {
  return d !== null && d.getTime() <= ahora.getTime() && ahora.getTime() - d.getTime() <= DIAS_RECIENTES * MS_DIA
}

export function clasificarAutorizacion(f: FilaAutorizacionPermiso, ahora: Date): { evento: EventoPermiso; fecha: Date } | null {
  const e = estadoAutorizacion(f, ahora)
  if (e === 'pendiente') return { evento: 'pendiente_aceptar', fecha: f.otorgadoEn }
  if (e === 'revocada') {
    if (f.revocadoPor === 'caducidad' || !reciente(f.revocadoEn, ahora)) return null
    return { evento: 'revocada', fecha: f.revocadoEn as Date }
  }
  if (e === 'vigente' && reciente(f.aceptadoEn, ahora)) return { evento: 'aceptada', fecha: f.aceptadoEn as Date }
  return null
}

export function clasificarPeticion(f: FilaPeticionPermiso, ahora: Date): { evento: EventoPermiso; fecha: Date } | null {
  return estadoPeticion(f, ahora) === 'pendiente' ? { evento: 'peticion_pendiente', fecha: f.creadaEn } : null
}

/** Los ids de ficha cuyos nombres hay que leer (para pedirlos de una vez, siempre filtrando por correduría). */
export function fichasImplicadas(auts: readonly FilaAutorizacionPermiso[], pets: readonly FilaPeticionPermiso[]): string[] {
  const s = new Set<string>()
  for (const a of auts) { s.add(a.otorganteClienteId); if (a.autorizadoClienteId) s.add(a.autorizadoClienteId) }
  for (const p of pets) { if (p.solicitanteClienteId) s.add(p.solicitanteClienteId); if (p.destinatarioClienteId) s.add(p.destinatarioClienteId) }
  return [...s]
}

/**
 * Compone la respuesta. `nombres` SOLO trae fichas de la correduría del puerto: un id que no esté (otra correduría)
 * sale con nombre `null` y SIN id, para que la pantalla no enlace a una ficha que no es suya.
 * Orden: lo pendiente primero (lo más antiguo arriba: es lo que más lleva esperando); luego lo reciente, lo último arriba.
 */
export function componerPermisos(
  auts: readonly FilaAutorizacionPermiso[],
  pets: readonly FilaPeticionPermiso[],
  nombres: ReadonlyMap<string, string>,
  ahora: Date,
): PermisosPortal {
  const ficha = (id: string | null): { id: string | null; nombre: string | null } =>
    id !== null && nombres.has(id) ? { id, nombre: nombres.get(id) ?? null } : { id: null, nombre: null }
  const movimientos: MovimientoPermiso[] = []
  for (const a of auts) {
    const c = clasificarAutorizacion(a, ahora)
    if (!c) continue
    const de = ficha(a.otorganteClienteId)
    const al = ficha(a.autorizadoClienteId)
    movimientos.push({
      id: a.id, evento: c.evento, alcance: a.alcance, fecha: c.fecha.toISOString(),
      deClienteId: de.id, de: de.nombre, aClienteId: al.id, a: al.nombre,
      aInvitado: a.autorizadoClienteId === null && a.autorizadoIdentidadId !== null,
      revocadoPor: c.evento === 'revocada' ? a.revocadoPor : null,
    })
  }
  for (const p of pets) {
    const c = clasificarPeticion(p, ahora)
    if (!c) continue
    const de = ficha(p.solicitanteClienteId)
    const al = ficha(p.destinatarioClienteId)
    movimientos.push({
      id: p.id, evento: c.evento, alcance: p.alcance, fecha: c.fecha.toISOString(),
      deClienteId: de.id, de: de.nombre, aClienteId: al.id, a: al.nombre, aInvitado: false, revocadoPor: null,
    })
  }
  movimientos.sort((x, y) => {
    const px = PENDIENTE.has(x.evento) ? 0 : 1
    const py = PENDIENTE.has(y.evento) ? 0 : 1
    if (px !== py) return px - py
    return px === 0 ? x.fecha.localeCompare(y.fecha) : y.fecha.localeCompare(x.fecha)
  })
  const pendientes = movimientos.filter((m) => PENDIENTE.has(m.evento)).length
  return { pendientes, recientes: movimientos.length - pendientes, movimientos }
}
