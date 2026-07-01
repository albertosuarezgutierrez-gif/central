import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET no configurado') })()
      : 'rrhh-dev-secret-change-in-prod')
)

export type Sesion = { usuario_id: string; empresa_id: string; jti: string }

export async function hashPassword(plain: string) { return bcrypt.hash(plain, 10) }
export async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash) }

export async function firmarSesion(s: Omit<Sesion, 'jti'>): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID()
  const token = await new SignJWT({ empresa_id: s.empresa_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.usuario_id)
    .setJti(jti)
    .setExpirationTime('30d')
    .sign(secret)
  return { token, jti }
}

export async function firmarPendiente(usuario_id: string): Promise<string> {
  return new SignJWT({ pendiente: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario_id)
    .setExpirationTime('5m')
    .sign(secret)
}

export async function verificarPendiente(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret)
  if (!payload.pendiente) throw new Error('Token no pendiente')
  return String(payload.sub)
}

export async function verificarSesion(token: string): Promise<Sesion> {
  const { payload } = await jwtVerify(token, secret)
  return { usuario_id: String(payload.sub), empresa_id: String(payload.empresa_id), jti: String(payload.jti) }
}
