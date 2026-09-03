import {
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
  requireSecret,
} from '@central/core-identity'
import { createHash } from 'node:crypto'

export const COOKIE_NAME = 'asegura_portal_session'
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

export async function verificarSesion(token: string): Promise<{ identidadId: string } | null> {
  const payload = await verifyToken(token, SECRET())
  if (!payload) return null
  return { identidadId: payload.identidadId as string }
}
