import bcrypt from 'bcryptjs'
import {
  genJti,
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
} from '@central/core-identity'

export const COOKIE_NAME = 'asegura_session'

// ─── Caducidad: 12 h, y no es una cifra de gusto (20/09/2026) ────────────────
// Esta sesión NO SE PUEDE REVOCAR: `prisma_seguros` solo tiene SELECT sobre
// `public.cuentas`, así que esta app no puede escribir `session_jtis` y el
// logout no pasa de borrar la cookie del navegador que la borra. Con 30 días,
// un token copiado (un portátil prestado, un log, una extensión) valía un mes
// entero sobre la cartera de 32.600 fichas y sobre el botón que gasta dinero.
// Mientras no exista `GRANT UPDATE (session_jtis) … TO prisma_seguros` (ver la
// cabecera de `lib/session.ts`), la ventana es el ÚNICO tope que existe.
// El coste es bajo a propósito: esto es la trastienda, donde no trabaja nadie a
// diario (la pantalla de Alberto es `plataforma` → `/correduria`).
const HORAS_SESION = 12
const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * HORAS_SESION } as const

// Secreto PROPIO de la vertical. NUNCA fallback a literal en producción (guardián regression-secrets).
const SECRET = () =>
  process.env.ASEGURA_SESSION_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('ASEGURA_SESSION_SECRET no configurado')
      })()
    : 'asegura-dev-secret-change-in-prod')

export { genJti }

export const hashPassword = (p: string) => bcrypt.hash(p, 12)
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash)

export async function createSessionToken(
  cuentaId: string,
  email: string,
): Promise<{ token: string; jti: string }> {
  // La caducidad del JWT y la de la cookie SALEN DE LA MISMA CONSTANTE: si la
  // cookie muriera antes que el token, el token copiado seguiría valiendo — que
  // es justo lo que esto acota.
  return createToken({ claims: { cuentaId, email }, secret: SECRET(), expiresIn: `${HORAS_SESION}h` })
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
