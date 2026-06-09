import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { genJti } from '@iarest/core-identity'

export const COOKIE_NAME = 'plataforma_session'
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 } as const

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado') })()
      : 'plataforma-dev-secret-change-in-prod'),
  )

export { genJti }

export const hashPassword = (p: string) => bcrypt.hash(p, 12)
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash)

export async function createSessionToken(cuentaId: string, email: string): Promise<{ token: string; jti: string }> {
  const jti = genJti()
  const token = await new SignJWT({ cuentaId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
  return { token, jti }
}

export async function verifySessionToken(token: string): Promise<{ cuentaId: string; email: string; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return { cuentaId: payload.cuentaId as string, email: payload.email as string, jti: payload.jti as string }
  } catch {
    return null
  }
}

export { COOKIE_OPTS }
