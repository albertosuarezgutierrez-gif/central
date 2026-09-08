import { cookies } from 'next/headers'
import { COOKIE_NAME, verificarSesion } from './auth'
import { prisma } from './db'

export async function getIdentidad() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verificarSesion(token)
  if (!payload) return null
  const identidad = await prisma.portalIdentidad.findUnique({
    where: { id: payload.identidadId },
    select: { id: true, nombre: true },
  })
  if (!identidad) return null
  // `corredor` ≠ null = es Alberto mirando el portal como lo ve un cliente
  // (`lib/vista-corredor.ts`). Las lecturas no lo miran —la bóveda sale del
  // vínculo temporal—; lo miran la banda de aviso y el veto a escribir.
  return { ...identidad, corredor: payload.corredor }
}

export async function requireIdentidad() {
  const i = await getIdentidad()
  if (!i) throw new Error('Sin sesión de portal')
  return i
}
