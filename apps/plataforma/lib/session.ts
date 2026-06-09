import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken } from './auth'
import { prisma } from './db'

export async function getSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null

  const cuenta = await prisma.cuenta.findFirst({
    where: { id: payload.cuentaId, sessionJti: payload.jti },
    select: { id: true, nombre: true, email: true },
  })
  return cuenta ? { ...cuenta, jti: payload.jti } : null
}

export async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('Unauthenticated')
  return s
}
