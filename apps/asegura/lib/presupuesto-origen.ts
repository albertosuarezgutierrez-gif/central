// De dónde salen los precios de un presupuesto (05/10/2026, `prisma/sql/2026-10-05_oportunidad_ofertas.sql`).
//
//   · `codeoscopic` — una tarificación PAGADA en Avant2 (`tarificacion_id` obligatorio). Lo de siempre:
//     se comprueba que no sea simulada antes de salir, y se emite/re-tarifica por Codeoscopic.
//   · `ofertas`     — PDFs de compañías subidos a la oportunidad, leídos por IA y REVISADOS por el
//     corredor. SIN tarificación: NUNCA llega a Codeoscopic (ni emisión, ni ReRate, ni la comprobación
//     de «simulado», que no tiene nada que mirar). Se emite en la compañía, a mano.
//
// PURO (sin BD ni red): lo importan el envío, la aceptación, la referencia y su guardián
// (`test/regression-presupuesto-ofertas.test.ts`). Un origen que no se reconoce es `null` y todo lo
// que decide aquí falla CERRADO: ni se envía ni se emite.

export const ORIGENES_PRESUPUESTO = ['codeoscopic', 'ofertas'] as const
export type OrigenPresupuesto = (typeof ORIGENES_PRESUPUESTO)[number]

/** El origen leído de la BD o del puerto. Cualquier otra cosa = `null` (no se sabe → no se actúa). */
export function origenPresupuesto(v: unknown): OrigenPresupuesto | null {
  return v === 'codeoscopic' || v === 'ofertas' ? v : null
}

/**
 * 🚨 LA puerta de todo lo que toca Codeoscopic desde un presupuesto (emisión, ReRate, «simulado»,
 * datos de la petición). Solo un presupuesto de origen `codeoscopic` CON su tarificación pasa.
 * Un `ofertas`, un origen desconocido o una tarificación ausente no pasan nunca.
 */
export function admiteCodeoscopic(p: { origen: unknown; tarificacionId: string | null | undefined }): p is {
  origen: 'codeoscopic'
  tarificacionId: string
} {
  return origenPresupuesto(p.origen) === 'codeoscopic' && typeof p.tarificacionId === 'string' && p.tarificacionId.trim() !== ''
}

export type OpcionDeOferta = { ofertaId: string | null; estadoOferta: string | null; mismaOportunidad: boolean }

export type DecisionSalida =
  | { ok: true; via: 'codeoscopic' | 'ofertas' }
  | { ok: false; motivo: 'simulado' | 'sin_revisar' | 'origen_desconocido'; detalle: string }

/**
 * ¿Puede este presupuesto salir hacia el cliente? Misma regla que el trigger
 * `presupuesto_no_enviar_simulado()` de la BD, dicha antes para dar un motivo legible:
 *   · codeoscopic → su tarificación tiene que ser REAL (`simulado === false`; `null` = no se pudo
 *     comprobar → no sale).
 *   · ofertas     → hay al menos una opción visible y TODAS salen de una oferta REVISADA de su
 *     oportunidad. Nada de tarificaciones.
 */
export function decidirSalida(
  p: { origen: unknown; tarificacionId: string | null | undefined },
  datos: { simulado?: boolean | null; opciones?: readonly OpcionDeOferta[] | null },
): DecisionSalida {
  const origen = origenPresupuesto(p.origen)
  if (origen === 'ofertas') {
    const opciones = datos.opciones ?? null
    if (opciones === null || opciones.length === 0) {
      return { ok: false, motivo: 'sin_revisar', detalle: 'El presupuesto no tiene ninguna opción visible que salga de una oferta revisada.' }
    }
    const malas = opciones.filter((o) => !o.ofertaId || o.estadoOferta !== 'revisada' || !o.mismaOportunidad)
    if (malas.length > 0) {
      return {
        ok: false,
        motivo: 'sin_revisar',
        detalle: `${malas.length === 1 ? 'Una opción no sale' : `${malas.length} opciones no salen`} de una oferta revisada: lo que no has revisado no se le enseña al cliente.`,
      }
    }
    return { ok: true, via: 'ofertas' }
  }
  if (!admiteCodeoscopic(p)) {
    return { ok: false, motivo: 'origen_desconocido', detalle: 'No se sabe de dónde salen los precios de este presupuesto: no se envía.' }
  }
  if (datos.simulado !== false) {
    return { ok: false, motivo: 'simulado', detalle: 'Los precios salen de una tarificación simulada: ninguna compañía los ha dado y no se le enseñan a un cliente.' }
  }
  return { ok: true, via: 'codeoscopic' }
}

/** Lo que se le dice al corredor cuando un presupuesto de ofertas llega a algo que solo hace Avant2. */
export function motivoNoCodeoscopic(compania: string | null): string {
  return `Este presupuesto sale de ofertas de compañías (PDF), no de Avant2: no se emite ni se re-tarifica por Codeoscopic. ` +
    `Se emite directamente en ${compania?.trim() ? compania.trim() : 'la compañía'}.`
}

/**
 * Mismo test que `admiteCodeoscopic`, con otro nombre para los ficheros que su guardián
 * (`test/regression-presupuesto-referencia.test.ts`) no deja nombrar al vendor: el PDF y la referencia.
 */
export const esDeAvant2 = admiteCodeoscopic
