// Autenticación del webhook de WhatsApp Cloud API (Meta). PURO: sin BD ni red, para `node --test`.
//
//   · GET (alta de la suscripción): Meta manda `hub.mode=subscribe`, `hub.verify_token` y
//     `hub.challenge`; se devuelve el challenge si el token es el nuestro (tiempo constante).
//   · POST (cada evento): cabecera `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 del cuerpo
//     CRUDO (los bytes tal cual llegan, antes de cualquier JSON.parse) con el App Secret. Se
//     verifica ANTES de mirar el cuerpo: un payload sin firma válida no se parsea ni se guarda.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { secretosIguales } from '@central/module-seguros-pii'

const CABECERA = /^sha256=([0-9a-f]{64})$/i

/** `true` solo si la firma es exactamente el HMAC del cuerpo crudo con `appSecret`. */
export function verificarFirmaMeta(cuerpoCrudo: string, cabecera: string | null | undefined, appSecret: string | null | undefined): boolean {
  if (!appSecret || typeof cabecera !== 'string') return false
  const m = CABECERA.exec(cabecera.trim())
  if (!m) return false
  const esperado = createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest()
  const recibido = Buffer.from(m[1], 'hex')
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

/** Firma de un cuerpo (para tests y para probar el webhook a mano con curl). */
export function firmarCuerpo(cuerpoCrudo: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest('hex')}`
}

export type RespuestaSuscripcion = { ok: true; challenge: string } | { ok: false }

/** Handshake GET. El challenge se devuelve tal cual solo con modo `subscribe` y token correcto. */
export function verificarSuscripcion(params: URLSearchParams, verifyToken: string | null | undefined): RespuestaSuscripcion {
  if (!verifyToken) return { ok: false }
  const modo = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (modo !== 'subscribe' || !challenge || challenge.length > 200) return { ok: false }
  return secretosIguales(token, verifyToken) ? { ok: true, challenge } : { ok: false }
}
