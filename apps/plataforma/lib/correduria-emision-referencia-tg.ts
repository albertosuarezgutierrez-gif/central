// Emitir por Telegram DESDE LA REFERENCIA del presupuesto (`AS-26-0005`, 30/09/2026) — parte PURA
// (sin `@/` ni prisma → node --test). «Emite AS-26-0005 con efecto 2026-10-10».
//
// No es otro camino de emisión: resuelve referencia → presupuesto → su tarificación y la opción EN
// DOCUMENTO que se emite, y entrega eso al flujo de siempre (`preparar_emision_nueva`: re-tarificar,
// resumen, botón de un uso, 15 min, huella). Lo que se emite es lo que se le enseñó al cliente:
//  - solo las opciones del documento (`oculta_at IS NULL`, ya filtradas por asegura);
//  - una sola → esa; varias → se pregunta cuál (nunca se elige por posición ni por precio);
//  - caducado, retirado o ya emitido → NO se emite, se dice;
//  - el precio de la tarificación se casa por su IDENTIDAD (`precioId`) y, si esa fila ya no está,
//    por compañía + categoría + modalidad exactas (regla 21): jamás «la prima más cercana».
import type { Precio } from './retarificar-asegura.ts'
import type { BusquedaReferencia, OpcionReferencia } from './referencia-presupuesto-asegura.ts'
import type { RamoNuevo } from './correduria-emision-nueva-tg.ts'

/** Lo que el LLM reconoce en el mensaje: `AS-AA-NNNN` (tolerante a minúsculas y espacios). */
export const PATRON_REFERENCIA_TEXTO = /\bAS[\s-]?\d{2}[\s-]?\d{4,}\b/i

const normal = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export type PistaOpcion = { compania: string | null; modalidad: string | null; primaEur: number | null }

export type ResolucionReferencia =
  /** `error` = no se ha podido MIRAR (nunca «no existe»). */
  | { tipo: 'no'; motivo: string; error?: boolean }
  | { tipo: 'elegir'; referencia: string; opciones: OpcionReferencia[] }
  | {
      tipo: 'ok'
      referencia: string
      presupuestoId: string
      clienteId: string
      ramo: RamoNuevo
      tarificacionId: string
      oportunidadId: string | null
      opcion: OpcionReferencia
    }

/**
 * PURO. De lo que devolvió el puerto de asegura a la opción que se emite. `pista` es lo que Alberto
 * haya dicho además de la referencia (compañía, modalidad, prima) para escoger entre varias; si no
 * deja UNA, se pregunta.
 */
export function resolverReferenciaEmision(b: BusquedaReferencia, pista: PistaOpcion): ResolucionReferencia {
  if (b.estado === 'no_aplica') return { tipo: 'no', motivo: 'eso no tiene forma de referencia de presupuesto (AS-AA-NNNN)' }
  if (b.estado === 'no_encontrado') return { tipo: 'no', motivo: `la referencia ${b.referencia} no existe en la correduría` }
  if (b.estado === 'error') return { tipo: 'no', motivo: `no he podido buscar la referencia ${b.referencia} (${b.motivo}); no digas que no existe`, error: true }
  const p = b.presupuesto
  const ref = p.referencia
  if (p.estado === 'retirado') return { tipo: 'no', motivo: `el presupuesto ${ref} está RETIRADO: no se emite. Si el cliente lo quiere, hay que preparar otro` }
  if (p.estado === 'emitido' || p.polizaEmitidaId) return { tipo: 'no', motivo: `el presupuesto ${ref} ya está EMITIDO` }
  if (p.estado === 'caducado') return { tipo: 'no', motivo: `el presupuesto ${ref} está CADUCADO: con ese precio no se emite, hay que volver a tarificar` }
  if (!p.emitible) return { tipo: 'no', motivo: `el presupuesto ${ref} no admite emitir (${p.rotuloEstado})` }
  const ramo: RamoNuevo | null = p.ramo === 'auto' || p.ramo === 'moto' ? p.ramo : null
  if (!ramo) {
    return { tipo: 'no', motivo: `el presupuesto ${ref} es de ${p.ramo || 'un ramo sin leer'} y por Telegram solo se emite coche o moto: que lo emita desde la intranet` }
  }
  // Un presupuesto de una póliza de la cartera es una SUSTITUCIÓN, no una póliza nueva: por aquí se
  // crearía una segunda póliza al lado de la que sigue viva.
  if (p.polizaId) return { tipo: 'no', motivo: `el presupuesto ${ref} sustituye a una póliza de la cartera: esa emisión se hace desde la pantalla de la póliza, no como póliza nueva` }
  if (p.opciones.length === 0) return { tipo: 'no', motivo: `el presupuesto ${ref} no tiene ninguna opción en el documento` }

  let candidatas = p.opciones
  const c = normal(pista.compania)
  if (c) {
    candidatas = candidatas.filter((o) => normal(o.compania).includes(c))
    if (candidatas.length === 0) return { tipo: 'no', motivo: `el documento de ${ref} no lleva ninguna opción de ${pista.compania}` }
  }
  const t = normal(pista.modalidad)
  if (t) {
    const palabras = t.split(' ').filter((w) => w.length > 1)
    const con = candidatas.filter((o) => {
      const hay = normal(`${o.compania} ${o.modalidad ?? ''} ${o.categoria ?? ''} ${o.producto}`)
      return palabras.every((w) => hay.includes(w))
    })
    if (con.length === 0) return { tipo: 'no', motivo: `ninguna opción del documento de ${ref} casa con «${pista.modalidad}»` }
    candidatas = con
  }
  if (pista.primaEur !== null && Number.isFinite(pista.primaEur) && candidatas.length > 1) {
    const x = pista.primaEur
    const cerca = candidatas.filter((o) => o.primaEur !== null && Math.abs(o.primaEur - x) <= Math.max(5, x * 0.03))
    if (cerca.length === 0) return { tipo: 'no', motivo: `ninguna opción del documento de ${ref} se acerca a ${x}€` }
    candidatas = cerca
  }
  if (candidatas.length > 1) return { tipo: 'elegir', referencia: ref, opciones: candidatas }
  return {
    tipo: 'ok',
    referencia: ref,
    presupuestoId: p.id,
    clienteId: p.clienteId,
    ramo,
    tarificacionId: p.tarificacionId,
    oportunidadId: p.oportunidadId,
    opcion: candidatas[0],
  }
}

export type PrecioDeOpcion = { tipo: 'uno'; precio: Precio } | { tipo: 'no'; motivo: string }

/**
 * PURO. El precio de la tarificación guardada que corresponde a la opción del documento.
 * 1) Por su identidad (`precioId`, la fila de `tarificacion_precios`).
 * 2) Si esa fila ya no está (la tabla se reescribe al re-leer), por compañía + categoría + modalidad
 *    EXACTAS (regla 21). Más de uno o ninguno → no se emite: nunca «el más parecido».
 */
export function precioDeOpcion(precios: readonly Precio[], o: OpcionReferencia): PrecioDeOpcion {
  const validos = precios.filter((p) => p.compania && p.categoria && typeof p.primaEur === 'number')
  if (o.precioId) {
    const porId = validos.filter((p) => p.precioId === o.precioId)
    if (porId.length === 1) return { tipo: 'uno', precio: porId[0] }
  }
  if (!o.modalidad || !o.categoria) {
    return { tipo: 'no', motivo: `la opción ${o.compania} del documento no trae modalidad y categoría con las que identificar su precio en la tarificación` }
  }
  const exactos = validos.filter((p) =>
    normal(p.compania) === normal(o.compania) && normal(p.categoria) === normal(o.categoria) && normal(p.modalidad) === normal(o.modalidad))
  if (exactos.length === 1) return { tipo: 'uno', precio: exactos[0] }
  if (exactos.length === 0) return { tipo: 'no', motivo: `la tarificación guardada ya no tiene el precio ${o.compania} · ${o.modalidad} del documento` }
  return { tipo: 'no', motivo: `la tarificación guardada tiene ${exactos.length} precios ${o.compania} · ${o.modalidad} y no se puede saber cuál es el del documento` }
}
