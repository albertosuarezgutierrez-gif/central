// Botón «Pedir emisión» del tarificador (11/10/2026) — lo PURO: cuándo se ve, a qué presupuesto apunta y cómo se cuenta la
// respuesta del API. Sin red ni envs: importable desde 'use client'. El servidor (asegura) re-comprueba TODO; esto solo
// evita ofrecer el botón donde seguro no vale y traduce los 403/409/503 a un motivo que se entienda.
//
// 🚨 Lo que la lista de presupuestos NO trae (IPID de la aceptación, opción elegida) es `null` = «no consta», nunca «sí»:
//    el botón queda activo (asegura decide) pero con la advertencia; un `false` explícito lo desactiva.

import type { PresupuestoEnLista } from './presupuesto-asegura.ts'

/** Lista blanca en plataforma (espejo de `clavesEmision()` de module-tarificacion; un test las compara). */
export const EMISION_PERMITIDA: readonly string[] = ['allianz::comunidades']

export const TEXTO_CONFIRMACION = 'Se te pedirá el OK por Telegram. El robot pulsará "Aceptar" una sola vez.'
export const TEXTO_ESPERANDO = 'Esperando tu OK en Telegram (caduca en 24 h)'

const clave = (compania: string, ramo: string) => `${compania.trim().toLowerCase()}::${ramo.trim().toLowerCase()}`

export type EntradaVisibilidad = {
  compania: string
  ramo: string
  /** Estado del trabajo de tarificación de origen. */
  estadoTrabajo: string
  /** Tiene al menos una oferta con prima. */
  conOferta: boolean
  /** Estado del presupuesto candidato (`null` = no hay). */
  estadoPresupuesto: string | null
  /** ¿Consta el IPID en la aceptación? `null` = la lista no lo dice (asegura lo comprueba). */
  ipidConsta: boolean | null
  /** Hay una emisión pedida y sin resolver para este presupuesto (lo sabe esta pantalla o asegura). */
  emisionEnCurso: boolean
}

export type Visibilidad = { visible: boolean; activo: boolean; motivo: string | null; aviso: string | null }

const NO: Visibilidad = { visible: false, activo: false, motivo: null, aviso: null }

export function visibilidadEmision(e: EntradaVisibilidad): Visibilidad {
  if (!EMISION_PERMITIDA.includes(clave(e.compania, e.ramo))) return NO
  if (e.estadoTrabajo !== 'ok' || !e.conOferta) return NO
  if (e.estadoPresupuesto === null) return NO
  if (e.estadoPresupuesto !== 'aceptado') {
    // Visible solo si ya es un presupuesto en marcha: se explica por qué aún no (no se ofrece sobre uno sin decidir).
    return e.estadoPresupuesto === 'emitido' ? { visible: true, activo: false, motivo: 'Este presupuesto ya figura como emitido.', aviso: null } : NO
  }
  if (e.emisionEnCurso) return { visible: true, activo: false, motivo: TEXTO_ESPERANDO, aviso: null }
  if (e.ipidConsta === false) return { visible: true, activo: false, motivo: 'La aceptación no lleva IPID: no se emite.', aviso: null }
  return {
    visible: true, activo: true, motivo: null,
    aviso: e.ipidConsta === null ? 'El IPID de la aceptación lo comprueba asegura al pedirla.' : null,
  }
}

const claveCia = (c: string) => c.trim().toLowerCase()

/**
 * Presupuestos de la lista a los que puede apuntar el botón de ESTE trabajo: aceptados y firmados, del mismo ramo (un
 * ramo desconocido NO vale) y, si la lista trae las opciones, con alguna de esa compañía. Orden de la lista.
 */
export function candidatosPresupuesto(lista: readonly PresupuestoEnLista[], b: { compania: string; ramo: string; clienteId?: string | null }): PresupuestoEnLista[] {
  return lista.filter((p) =>
    p.estado === 'aceptado' &&
    p.ramo !== null && p.ramo.trim().toLowerCase() === b.ramo.trim().toLowerCase() &&
    (!b.clienteId || p.clienteId === null || p.clienteId === b.clienteId) &&
    (p.detalle === null || p.detalle.some((o) => claveCia(o.compania).includes(claveCia(b.compania)))))
}

/** Prima de la opción de esa compañía si es INEQUÍVOCA (una sola opción con prima); si no, `null`. */
export function primaDeCompania(p: PresupuestoEnLista, compania: string): number | null {
  const ops = (p.detalle ?? []).filter((o) => claveCia(o.compania).includes(claveCia(compania)) && o.primaEur !== null)
  return ops.length === 1 ? ops[0].primaEur : null
}

export type RespuestaEmision = { tono: 'ok' | 'aviso' | 'error'; texto: string; pendiente: boolean }

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Traduce el POST de `/api/correduria/tarificador/emision`. 202 = pedida (queda esperando el OK en Telegram). */
export function leerRespuestaEmision(status: number, json: unknown): RespuestaEmision {
  const o = obj(json)
  const motivo = typeof o.motivo === 'string' ? o.motivo : typeof o.mensaje === 'string' ? o.mensaje : ''
  if (status === 202 && o.estado === 'encolado') return { tono: 'ok', texto: TEXTO_ESPERANDO, pendiente: true }
  if (status === 403) return { tono: 'error', texto: 'No autorizado: solo el titular puede pedir una emisión.', pendiente: false }
  if (status === 409) {
    if (/emision_incierta|ya_hay_emision_viva/i.test(motivo)) {
      return { tono: 'aviso', texto: 'Ya hay una emisión pendiente o incierta para este presupuesto. Mira ePAC y el Telegram antes de pedir otra.', pendiente: true }
    }
    return { tono: 'aviso', texto: `No se puede pedir la emisión: ${motivo || 'el presupuesto no cumple las condiciones'}.`, pendiente: false }
  }
  if (status === 503) {
    if (/emision_apagada/i.test(motivo)) return { tono: 'aviso', texto: 'La emisión está desactivada (interruptor del tarificador). No se ha pedido nada.', pendiente: false }
    if (/emision_sin_esquema/i.test(motivo)) return { tono: 'aviso', texto: 'La emisión aún no está preparada en la base de datos (falta aplicar el SQL). No se ha pedido nada.', pendiente: false }
    if (o.estado === 'apagado') return { tono: 'aviso', texto: 'El tarificador (bot) está apagado. No se ha pedido nada.', pendiente: false }
    return { tono: 'error', texto: `No se ha podido pedir (asegura no responde bien${motivo ? `: ${motivo}` : ''}). No consta que se haya pedido: mira antes de repetir.`, pendiente: false }
  }
  if (status === 400) return { tono: 'error', texto: 'Petición mal formada (faltan identificadores del presupuesto o del trabajo).', pendiente: false }
  return { tono: 'error', texto: `No se ha podido pedir (HTTP ${status}). No consta que se haya pedido: mira antes de repetir.`, pendiente: false }
}
