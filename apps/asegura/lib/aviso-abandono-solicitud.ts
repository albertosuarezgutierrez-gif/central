// Aviso a ALBERTO (Telegram) de los enlaces de datos `/datos/<token>` pendientes y SIN COMPLETAR a las 24 h
// (26/10/2026, fase B). PURO.
//
// Para que llame o reenvíe el enlace a tiempo. NUNCA se escribe al cliente (ni correo, ni WhatsApp): el aviso es solo
// interno. No lleva ningún dato del cliente: ramo, hasta dónde llegó (etiquetas de la casa, `ultimoPasoDe`) y el enlace
// a la ficha en plataforma. Una sola vez por solicitud: lo garantiza el sello `aviso_abandono_at`.

import { escapeHtml } from '@central/core-telegram'
import { nombreRamoSolicitud, ramoSolicitud } from '@central/module-seguros'

/** Horas sin completar antes de avisar. */
export const HORAS_ABANDONO = 24
/** Máximo de solicitudes por aviso (y por pasada): un aviso legible; las demás, en la siguiente pasada. */
export const TOPE_ABANDONO_PASADA = 15

export type SolicitudAbandonada = {
  id: string
  ramo: string
  tercero: boolean
  /** Hasta dónde llegó (`ultimo_paso`). `null` = no ha guardado nada (no lo ha empezado, o sin el SQL del borrador). */
  ultimoPaso: string | null
  enlaceFicha: string
}

/** ¿Toca avisar ya? Creada hace ≥ 24 h (la consulta lo filtra igual; esto lo deja escrito y probado). */
export function tocaAvisoAbandono(creada: Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() - creada.getTime() >= HORAS_ABANDONO * 3_600_000
}

export function textoAvisoAbandono(filas: readonly SolicitudAbandonada[]): string {
  const lineas = filas.map((f) => {
    const r = ramoSolicitud(f.ramo)
    const ramo = r ? nombreRamoSolicitud(r) : f.ramo
    const quien = f.tercero ? ' (datos de otra persona del riesgo)' : ''
    const paso = f.ultimoPaso ? `llegó a: ${f.ultimoPaso}` : 'sin nada guardado'
    return `· <b>${escapeHtml(ramo.charAt(0).toUpperCase() + ramo.slice(1))}</b>${escapeHtml(quien)} · ${escapeHtml(paso)} · <a href="${escapeHtml(f.enlaceFicha)}">ficha</a>`
  })
  const n = filas.length
  return [
    `⏳ <b>${n} enlace${n === 1 ? '' : 's'} de datos sin completar a las ${HORAS_ABANDONO} h</b>`,
    ...lineas,
    'No se ha escrito al cliente: si quieres, llámalo o reenvíale el enlace.',
  ].join('\n')
}
