import bcrypt from 'bcryptjs'
import {
  genJti,
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
} from '@central/core-identity'

export const COOKIE_NAME = 'almacen_session'
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 } as const

// Secreto PROPIO de la vertical. NUNCA fallback a literal en producción (guardián regression-secrets).
const SECRET = () =>
  process.env.ALMACEN_SESSION_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('ALMACEN_SESSION_SECRET no configurado')
      })()
    : 'almacen-dev-secret-change-in-prod')

export { genJti }

export const hashPassword = (p: string) => bcrypt.hash(p, 12)
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash)

export async function createSessionToken(
  cuentaId: string,
  email: string,
): Promise<{ token: string; jti: string }> {
  return createToken({ claims: { cuentaId, email }, secret: SECRET(), expiresIn: '30d' })
}

export async function verifySessionToken(
  token: string,
): Promise<{ cuentaId: string; email: string; jti: string } | null> {
  const payload = await verifyToken(token, SECRET())
  if (!payload) return null
  return {
    cuentaId: payload.cuentaId as string,
    email: payload.email as string,
    jti: payload.jti as string,
  }
}

export { COOKIE_OPTS }
