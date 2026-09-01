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
 */
export function hashCanal(valor: string): string {
  const pimienta = process.env.ASEGURA_PORTAL_CANAL_PEPPER ?? ''
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
