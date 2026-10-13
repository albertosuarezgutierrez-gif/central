// apps/asegura/lib/tarea-suelta-reglas.ts — PURO (sin BD) para poder probarlo: ver `tarea-suelta.ts`.

import { PREFIJO_TAREA_DEVOLUCION } from '@central/module-seguros'

export type FalloSuelta = { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto'; motivo: string; status: 404 | 409 | 422 }

export type FilaSuelta = { oportunidadId: string | null; clienteId: string | null; estado: string; observaciones: string | null }

/** PURO: si sobre esta tarea cabe «Hecho»/«Posponer» por la vía de las sueltas. `null` = adelante. */
export function rechazoSuelta(t: FilaSuelta | undefined): FalloSuelta | null {
  if (!t) return { ok: false, estado: 'no_encontrado', motivo: 'No hay tarea con ese id en esta correduría.', status: 404 }
  if (t.oportunidadId !== null) {
    return { ok: false, estado: 'conflicto', motivo: 'Esa tarea cuelga de una oportunidad: se gestiona desde su seguimiento.', status: 409 }
  }
  if ((t.observaciones ?? '').startsWith(PREFIJO_TAREA_DEVOLUCION)) {
    return { ok: false, estado: 'conflicto', motivo: 'Es un hito del recibo devuelto (art. 15 LCS): lleva plazo legal y no se toca desde aquí.', status: 409 }
  }
  if (t.estado === 'cerrada') return { ok: false, estado: 'conflicto', motivo: 'Esa tarea ya estaba cerrada.', status: 409 }
  return null
}
