/**
 * ¿Sale ESTE correo de vencimiento, o la persona pidió «solo en el móvil» y el push ya le llegó?
 * (14/10/2026). Regla pura, sin BD: la lectura vive en `leerCanalesDeFichas` (`avisos-vencimiento.ts`).
 *
 * La usan los DOS emisores de correo de vencimiento: `avisos-vencimiento.ts` (obligación del portal) y
 * `avisos-intranet.ts` (obligación del portal, vencimiento derivado de la póliza y recordatorio de 2 días).
 *
 * El puente: ficha (tomador de la póliza) → `portal_vinculo` (sin el vínculo temporal del CORREDOR) →
 * identidades → `portal_preferencias_avisos.canal`. Una ficha puede tener 0..n identidades.
 * Fusiones: no se resuelven lápidas aquí. `fusionar_clientes()` re-apunta TODA FK a `clientes` (también
 * `portal_vinculo.cliente_id`) a la superviviente, y borra antes solo los vínculos que ya existían en
 * ella; en una cadena A→B→C, al fusionar B en C se mueven también los que vinieron de A. Y si aun así
 * faltara un vínculo, el aviso cae en `identidad_ajena` → se manda.
 *
 * 🚨 Regla: por defecto SE MANDA. Un correo se calla SOLO si se cumplen las tres:
 *  (a) va ligado a una `portal_obligacion` cuyo push YA SALIÓ en ESTE ciclo (`avisada_push_at` no
 *      anterior a la fecha accionable − 31 días: `selloDeEsteCiclo`). El vencimiento
 *      DERIVADO de la póliza (sin obligación) no tiene push detrás: se manda siempre;
 *  (b) la identidad de esa obligación es una de las vinculadas a la ficha del tomador (el push le llegó
 *      a una persona de ESTA ficha, no a un tercero autorizado);
 *  (c) TODAS las identidades de la ficha eligieron exactamente `'movil'`. Una sin preferencia (`null` =
 *      «no lo ha configurado», nunca «no quiere») o con `'correo'`/`'ambos'`/valor raro → se manda.
 * No se pueden leer las preferencias → se manda (fail-OPEN) y el cron lo dice. Es el preaviso del
 * art. 22 LCS: callárselo a toda la cartera por un GRANT perdido es peor que un correo de más.
 *
 * Lo que NO decide: la antelación (`dias_antelacion` es la del PUSH) ni «no molestar» (un correo no suena).
 */

import { selloDeEsteCiclo } from '@central/module-seguros-portal'

export const CANAL_SOLO_MOVIL = 'movil'

export interface PreferenciaIdentidad {
  identidadId: string
  /** `null` = sin fila o sin canal. */
  canal: string | null
}

/** Lo leído en una pasada: identidades por ficha. `null` = la lectura falló. */
export type CanalesDeFichas = Map<string, PreferenciaIdentidad[]> | null

/** De dónde sale el aviso de vencimiento que se va a escribir. */
export type OrigenAviso =
  | { tipo: 'derivado' }
  | { tipo: 'obligacion'; identidadId: string; avisadaPushAt: Date | null; fechaAccionable: Date }

export type DecisionCorreoVencimiento =
  | { enviar: true; motivo: 'derivado' | 'sin_push_enviado' | 'preferencias_no_leidas' | 'identidad_ajena' | 'sin_solo_movil' }
  | { enviar: false; motivo: 'solo_movil' }

export function decidirAvisoVencimiento(x: { origen: OrigenAviso; fichaId: string; canales: CanalesDeFichas }): DecisionCorreoVencimiento {
  if (x.origen.tipo === 'derivado') return { enviar: true, motivo: 'derivado' }
  // Defensa en profundidad: un sello de push de un ciclo ANTERIOR (renovación sin reset) no prueba
  // que el push de este vencimiento haya salido. Mismo criterio que `sellosAReiniciar` del portal.
  if (!selloDeEsteCiclo(x.origen.avisadaPushAt, x.origen.fechaAccionable)) return { enviar: true, motivo: 'sin_push_enviado' }
  if (x.canales === null) return { enviar: true, motivo: 'preferencias_no_leidas' }
  const identidades = x.canales.get(x.fichaId) ?? []
  const idObligacion = x.origen.identidadId
  if (!identidades.some((i) => i.identidadId === idObligacion)) return { enviar: true, motivo: 'identidad_ajena' }
  if (!identidades.every((i) => i.canal === CANAL_SOLO_MOVIL)) return { enviar: true, motivo: 'sin_solo_movil' }
  return { enviar: false, motivo: 'solo_movil' }
}

/** De las filas leídas a las identidades de cada ficha (una identidad, una vez; sin fila = `null`). */
export function canalesPorFicha(x: {
  vinculos: { identidadId: string; clienteId: string }[]
  canalDe: Map<string, string | null>
}): Map<string, PreferenciaIdentidad[]> {
  const ids = new Map<string, Set<string>>()
  for (const v of x.vinculos) ids.set(v.clienteId, (ids.get(v.clienteId) ?? new Set()).add(v.identidadId))
  const out = new Map<string, PreferenciaIdentidad[]>()
  for (const [ficha, s] of ids) out.set(ficha, [...s].map((identidadId) => ({ identidadId, canal: x.canalDe.get(identidadId) ?? null })))
  return out
}
