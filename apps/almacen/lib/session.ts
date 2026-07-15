import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken } from './auth'
import { prisma } from './db'

// Verificación STATELESS (solo firma JWT + existencia de la cuenta), igual que transporte:
// no valida `session_jti` para no acoplarse a la sesión de plataforma (comparten `cuentas`).
export async function getSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null

  const cuenta = await prisma.cuenta.findFirst({
    where: { id: payload.cuentaId },
    select: { id: true, nombre: true, email: true },
  })
  return cuenta ?? null
}

export async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('Unauthenticated')
  return s
}
