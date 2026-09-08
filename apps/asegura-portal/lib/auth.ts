import {
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
  requireSecret,
} from '@central/core-identity'
import { createHash } from 'node:crypto'
import { IDENTIDAD_CORREDOR_ID, SESION_CORREDOR, SESION_CORREDOR_SEGUNDOS } from '@central/module-seguros-portal'

import { COOKIE_NAME } from './auth-cookie'
export { COOKIE_NAME }
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const

// Secreto PROPIO del portal, distinto del panel del corredor: una sesión del
// portal no debe valer jamás en la app interna. `requireSecret` lanza en
// producción si falta y solo cae al literal en desarrollo — es lo que exige el
// guardián `test/regression-secrets.test.ts` (ver `packages/core-identity/src/secret.ts`).
const SECRET = () => requireSecret('ASEGURA_PORTAL_SESSION_SECRET', 'portal-dev-secret-change-in-prod')

/**
 * Hash del canal para poder buscarlo sin guardar el email o el móvil en claro.
 * Va con pimienta de entorno: sin ella, una tabla de hashes de emails es
 * trivial de revertir con un diccionario.
 *
 * Por eso la pimienta usa `requireSecret` y no `?? ''`. Con el fallback vacío la
 * app NO fallaba: seguía funcionando y guardaba SHA-256 pelados del email, que
 * es justo lo que este hash existe para evitar — la protección se apagaba sola y
 * nadie se enteraba (medido en producción el 03/09/2026: el envío del código
 * funcionaba con la env sin poner). El guardián `test/regression-secrets.test.ts`
 * no lo caza a propósito, porque su regla —«una cadena vacía no es una credencial
 * usable»— es cierta para un secreto que FIRMA y falsa para una pimienta.
 */
export function hashCanal(valor: string): string {
  const pimienta = requireSecret('ASEGURA_PORTAL_CANAL_PEPPER', 'portal-dev-pepper-change-in-prod')
  return createHash('sha256').update(`${pimienta}:${valor.trim().toLowerCase()}`).digest('hex')
}

export async function crearSesion(identidadId: string): Promise<string> {
  const { token } = await createToken({ claims: { identidadId }, secret: SECRET(), expiresIn: '30d' })
  return token
}

/**
 * La sesión del CORREDOR mirando el portal como lo ve un cliente (08/09/2026).
 * Es la identidad dedicada `IDENTIDAD_CORREDOR_ID` con el cliente que se mira
 * en el propio token: quien lea la cookie sabe que NO es el cliente, y la
 * banda de aviso y el veto a escrituras (`middleware.ts`) salen de aquí.
 * Dura 4 h, no 30 días: es una consulta, no una cuenta.
 */
export type SesionCorredor = { clienteId: string }

export type SesionPortal = { identidadId: string; corredor: SesionCorredor | null }

export async function crearSesionCorredor(clienteId: string): Promise<string> {
  const { token } = await createToken({
    claims: { identidadId: IDENTIDAD_CORREDOR_ID, corredor: { clienteId } },
    secret: SECRET(),
    expiresIn: SESION_CORREDOR,
  })
  return token
}

export const COOKIE_OPTS_CORREDOR = { ...COOKIE_OPTS, maxAge: SESION_CORREDOR_SEGUNDOS } as const

export function leerCorredor(payload: Record<string, unknown>): SesionCorredor | null {
  const c = payload.corredor
  if (typeof c !== 'object' || c === null) return null
  const clienteId = (c as Record<string, unknown>).clienteId
  return typeof clienteId === 'string' && clienteId !== '' ? { clienteId } : null
}

export async function verificarSesion(token: string): Promise<SesionPortal | null> {
  const payload = await verifyToken(token, SECRET())
  if (!payload) return null
  return { identidadId: payload.identidadId as string, corredor: leerCorredor(payload) }
}
