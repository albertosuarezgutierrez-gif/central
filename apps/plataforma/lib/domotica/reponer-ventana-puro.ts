// lib/domotica/reponer-ventana-puro.ts — parte PURA (sin BD, sin Tuya, sin Telegram) de la reposición
// de la ventana de un PIN desde Telegram. Separada para poder testearla con `node --test`.
//
// El aviso «🕒 N PIN con la ventana desactualizada» se lee en el móvil, y hasta el 02/09/2026 su única
// salida era abrir /sivra/domotica en el portátil y pulsar «🔄 ventana». Un aviso que remite a otra
// pantalla es un aviso que se aplaza, y un PIN con la ventana corta es un huésped que a las 11:00
// tiene un código muerto en la mano. Por eso el aviso lleva ahora un botón por PIN: la pulsación es
// la «autorización nuestra» (el chat es el de Alberto, verificado por el secreto del webhook), y la
// reposición corre exactamente por el mismo camino que el botón del panel (`reponerVentanaPin`).

import type { Boton } from '@central/core-telegram'
import type { Desajuste } from './acceso-programador'

export const PREFIJO_CALLBACK_DOMOTICA = 'dom'
export const ACCION_VENTANA = 'ventana'

// Telegram corta `callback_data` a 64 bytes y el botón muere en silencio («conectando…» eterno).
export const MAX_CALLBACK_BYTES = 64

/** `callback_data` del botón «🔄 ventana» de un PIN: `dom_ventana:<dispositivoId>:<reservaRef>`. */
export function callbackReponerVentana(dispositivoId: string, reservaRef: string): string {
  return `${PREFIJO_CALLBACK_DOMOTICA}_${ACCION_VENTANA}:${dispositivoId}:${reservaRef}`
}

/**
 * Un botón por desajuste, en filas de uno (el texto lleva el nombre del huésped y no cabe de dos en
 * dos en el móvil). Los que no quepan en los 64 bytes de Telegram se quedan SIN botón —el texto del
 * aviso los sigue listando— en vez de mandar un botón que no responde. Las refs con ':' (los PIN
 * manuales) tampoco pueden ir: `parseCallback` parte por ':' y el ref llegaría troceado. Solo aplica
 * a lo que devuelve `desajustesVentana`, que son reservas de Smoobu (id numérico), pero se comprueba.
 */
export function botonesReponerVentana(dispositivoId: string, desajustes: Desajuste[]): Boton[][] {
  const filas: Boton[][] = []
  for (const x of desajustes) {
    if (x.reservaRef.includes(':')) continue
    const callback = callbackReponerVentana(dispositivoId, x.reservaRef)
    if (Buffer.byteLength(callback, 'utf8') > MAX_CALLBACK_BYTES) continue
    const quien = x.guestName ? ` · ${x.guestName.slice(0, 24)}` : ''
    filas.push([{ texto: `🔄 ventana · ${x.reservaRef}${quien}`, callback }])
  }
  return filas
}

// "2026-09-04T09:00:00.000Z" → "04/09 11:00" en hora de Madrid, para que el resultado se lea sin cuentas.
// Se monta a mano desde `formatToParts`: el ICU del runtime no siempre respeta `2-digit` en es-ES.
export function horaMadridCorta(ms: number): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(ms))
  const g = (t: string) => (p.find(x => x.type === t)?.value || '0').padStart(2, '0')
  return `${g('day')}/${g('month')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`
}

export type ResultadoReponer =
  | { ok: true; sinCambio: true; pin: string }
  | { ok: true; sinCambio?: false; pin: string; pinCambio: boolean; modo?: string; desde: string; hasta: string }
  | { ok: false; status: number; error: string }

/**
 * Texto que el bot responde tras pulsar el botón. Dice lo que pasó de verdad: si el código cambió
 * (Tuya cayó a modo offline y generó otro), lo canta en mayúsculas, porque el huésped tiene el viejo.
 */
export function textoResultadoReponer(reservaRef: string, r: ResultadoReponer): string {
  if (!r.ok) return `❌ Reserva ${reservaRef}: ${r.error}`
  if (r.sinCambio) return `✅ Reserva ${reservaRef}: la ventana ya era la correcta, no he tocado nada (código ${r.pin}).`
  const ventana = `del ${horaMadridCorta(Date.parse(r.desde))} al ${horaMadridCorta(Date.parse(r.hasta))}`
  if (r.pinCambio) {
    return `⚠️ Reserva ${reservaRef}: ventana repuesta (${ventana}) pero el código CAMBIÓ a ${r.pin} — la cerradura no aceptó el mismo. El huésped tiene el viejo: mándale el nuevo.`
  }
  return `✅ Reserva ${reservaRef}: ventana repuesta ${ventana}. El código sigue siendo ${r.pin}.`
}
