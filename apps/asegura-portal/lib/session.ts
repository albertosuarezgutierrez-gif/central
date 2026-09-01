import { cookies } from 'next/headers'
import { COOKIE_NAME, verificarSesion } from './auth'
import { prisma } from './db'

export async function getIdentidad() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verificarSesion(token)
  if (!payload) return null
  return prisma.portalIdentidad.findUnique({
    where: { id: payload.identidadId },
    select: { id: true, nombre: true },
  })
}

export async function requireIdentidad() {
  const i = await getIdentidad()
  if (!i) throw new Error('Sin sesión de portal')
  return i
}
