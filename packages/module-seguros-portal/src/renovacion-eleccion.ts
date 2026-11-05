// RENOVACIÓN CON ALTERNATIVAS: QUIÉN puede elegir y de quién es la elección (Alberto, 05/11/2026). PURO: sin BD ni red.
// Lo usan los dos lados: asegura (el puente que ESCRIBE la elección y decide a quién se publica) y el portal (la página,
// la campana). Una sola regla para «lo ve / puede elegir» en los dos sitios, como `autorizacionVigente`.
//
// Decisiones de Alberto (05/11/2026):
//   1. Además de quien entra con la ficha del TOMADOR (vínculo con nivel de operar, o el enlace del WhatsApp del tomador),
//      un AUTORIZADO por el tomador con nivel que deja OPERAR (Gestión o Total en la tabla VIGENTE `portal_autorizacion`,
//      nunca el booleano revocado `puede_ver_polizas`) ve la renovación, recibe el aviso y puede ELEGIR.
//      Caso real: la tomadora es la cónyuge y quien usa la app es él, autorizado.
//   2. La PRIMERA elección vale. La otra persona ve «ya elegida por <nombre de pila>» y no la cambia. Quien eligió sí puede
//      cambiar de opinión (como hasta ahora, con su tope diario).
//
// Persona = identidad (regla de la casa: agrupar por identidad, nunca por nombre). El lado del TOMADOR es UNA persona
// (todas sus cuentas vinculadas a SU ficha y su enlace del WhatsApp son la misma ficha); cada autorizado es SU identidad
// del portal: dos identidades distintas no se funden jamás.
//
// 🚨 Fail-closed: un alcance desconocido, una autorización no vigente o de otra póliza, o un vínculo sin nivel de operar NO
// abren nada. El tipo de otorgante se toma como persona FÍSICA (el lado restrictivo: `partes` solo no basta).

import { nivelPuedeOperar } from './acceso.ts'
import { autorizacionVigente, esAlcance, type Alcance } from './autorizacion.ts'
import { nivelCompartido } from './capacidades.ts'

/** Tipo del evento append-only `presupuesto_evento` que guarda cada elección (el mismo que escribe asegura). */
export const EVENTO_ELECCION_RENOVACION = 'renovacion_eleccion_cliente'

/** ¿Estos alcances (sumados) dejan ELEGIR? Solo Gestión o Total. Consulta (o nada conocido) no. */
export function autorizacionDejaElegir(alcances: readonly unknown[]): boolean {
  const n = nivelCompartido(alcances, 'fisica')
  return n === 'gestion' || n === 'total'
}

/** Una fila de autorización vista desde UNA identidad del portal (las dos vías por las que le llega). */
export type FilaAutorizacionRenovacion = {
  autorizacionId: string
  alcance: string
  aceptadoEn: Date | null
  caducaEn: Date | null
  revocadoEn: Date | null
  /** La póliza concedida (`null` = toda la ficha del otorgante, futuras incluidas). */
  polizaId: string | null
  /** A qué póliza se fusionó la concedida (`null` = no está fusionada). Se sigue un salto, como la bóveda. */
  polizaFusionadaEn: string | null
  /** La identidad del portal que mira por esta autorización. */
  identidadId: string
  /**
   * `null` = la autorización es a esa IDENTIDAD. Si llega por una FICHA del autorizado, el nivel del vínculo de esa
   * identidad con esa ficha: sin nivel de operar no actúa en nombre de nadie (tampoco de sí mismo).
   */
  nivelVinculo: string | null
  /** El vínculo es la vista temporal del corredor: nunca cuenta. */
  vinculoDeCorredor?: boolean
  /** Nombre de quien mira (ficha del autorizado o su identidad). Solo para decirlo; nunca decide. */
  nombre: string | null
}

/**
 * Las identidades que, por autorizaciones VIGENTES del tomador, pueden ELEGIR en la renovación de `polizaId`. Los alcances
 * de una misma identidad se SUMAN (una de toda la ficha + otra de esta póliza), como en la bóveda. Devuelve identidad →
 * nombre (el primero que conste).
 */
export function identidadesQueEligenRenovacion(
  filas: readonly FilaAutorizacionRenovacion[],
  polizaId: string | null,
  ahora: Date,
): Map<string, { nombre: string | null }> {
  const alcances = new Map<string, Alcance[]>()
  const nombres = new Map<string, string | null>()
  for (const f of filas) {
    const identidad = typeof f.identidadId === 'string' ? f.identidadId.trim() : ''
    if (identidad === '') continue
    if (!esAlcance(f.alcance)) continue
    if (!autorizacionVigente({ aceptadoEn: f.aceptadoEn, caducaEn: f.caducaEn, revocadoEn: f.revocadoEn }, ahora)) continue
    if (f.vinculoDeCorredor === true) continue
    if (f.nivelVinculo !== null && !nivelPuedeOperar(f.nivelVinculo)) continue
    // Una autorización de UNA póliza solo abre esa (o aquella en la que se fusionó). Sin póliza en el presupuesto, solo
    // valen las de la ficha entera.
    const cubre = f.polizaId === null || (polizaId !== null && (f.polizaId === polizaId || f.polizaFusionadaEn === polizaId))
    if (!cubre) continue
    alcances.set(identidad, [...(alcances.get(identidad) ?? []), f.alcance])
    if (!nombres.get(identidad) && f.nombre?.trim()) nombres.set(identidad, f.nombre.trim())
  }
  const out = new Map<string, { nombre: string | null }>()
  for (const [identidad, a] of alcances) {
    if (autorizacionDejaElegir(a)) out.set(identidad, { nombre: nombres.get(identidad) ?? null })
  }
  return out
}

/** Quién elige. `identidadId` del tomador puede faltar (entró con el enlace del WhatsApp, sin cuenta del portal). */
export type ElectorRenovacion =
  | { papel: 'tomador'; via: 'app' | 'enlace_whatsapp'; identidadId: string | null; nombre: string | null }
  | { papel: 'autorizado'; via: 'app'; identidadId: string; nombre: string | null }

/** De quién es la elección ya hecha (lo que se selló con la PRIMERA elección: columnas `eleccion_por_*` de 2026-11-05c). */
export type DuenoEleccion = { papel: 'tomador' | 'autorizado'; identidadId: string | null; nombre: string | null }

/** El `detalle` que se escribe en el evento de elección: quién y por dónde. Sin DNI, IBAN ni dirección: nombre de pila. */
export function detalleElector(e: ElectorRenovacion): { papel: string; via: string; identidadId: string | null; porNombre: string | null } {
  return { papel: e.papel, via: e.via, identidadId: e.identidadId, porNombre: e.nombre }
}

/**
 * Lee el dueño de la elección de lo sellado con la PRIMERA (`{ papel, identidadId, porNombre }`, la forma de
 * `detalleElector`; en BD, las columnas `eleccion_por_*`). `hayEleccion = false` → `null` (nadie ha elegido).
 * Una elección ANTERIOR a esta regla (sin `papel`) es del tomador: hasta el 05/11/2026 solo podía elegir su ficha.
 * Un `papel` que no se reconoce se trata como de OTRA persona sin nombre (fail-closed: nadie la pisa).
 */
export function duenoDeEleccion(detalle: unknown, hayEleccion: boolean): DuenoEleccion | null {
  if (!hayEleccion) return null
  const d = detalle && typeof detalle === 'object' && !Array.isArray(detalle) ? (detalle as Record<string, unknown>) : {}
  const nombre = typeof d.porNombre === 'string' && d.porNombre.trim() ? d.porNombre.trim() : null
  const identidadId = typeof d.identidadId === 'string' && d.identidadId.trim() ? d.identidadId.trim() : null
  if (d.papel === undefined) return { papel: 'tomador', identidadId, nombre }
  if (d.papel === 'tomador') return { papel: 'tomador', identidadId, nombre }
  if (d.papel === 'autorizado' && identidadId) return { papel: 'autorizado', identidadId, nombre }
  return { papel: 'autorizado', identidadId: null, nombre }
}

/** ¿Es la misma persona? Tomador ↔ tomador (su ficha); autorizado ↔ la MISMA identidad. */
export function mismaPersonaQueElige(d: DuenoEleccion, quien: { papel: 'tomador' | 'autorizado'; identidadId: string | null }): boolean {
  if (d.papel === 'tomador') return quien.papel === 'tomador'
  return quien.papel === 'autorizado' && d.identidadId !== null && d.identidadId === quien.identidadId
}

/** Lo que ve quien NO eligió: «ya elegida por <nombre>». `null` = nadie ha elegido, o fue esta misma persona. */
export function eleccionDeOtraPersona(d: DuenoEleccion | null, quien: { papel: 'tomador' | 'autorizado'; identidadId: string | null }): { nombre: string | null } | null {
  if (d === null || mismaPersonaQueElige(d, quien)) return null
  return { nombre: d.nombre }
}

/** «Ya la ha elegido Laura» / «Ya la ha elegido otra persona con acceso». Sin más datos. */
export function textoYaElegida(nombre: string | null): string {
  return `Ya la ha elegido ${nombre?.trim() ? nombre.trim() : 'otra persona con acceso a esta póliza'}. Vale la primera elección: si queréis cambiarla, escribidme.`
}
