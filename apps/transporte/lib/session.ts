import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken } from './auth'
import { prisma } from './db'

// Verificación STATELESS (solo firma JWT + existencia de la cuenta). No valida contra
// `session_jti` para no acoplarse a la sesión de plataforma (que comparte la tabla `cuentas` y
// sobrescribiría ese campo). Suficiente para esta vertical; la rotación server-side se puede
// añadir con una columna propia si hiciera falta.
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
