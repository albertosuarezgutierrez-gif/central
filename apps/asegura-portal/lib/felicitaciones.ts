/**
 * La felicitación de cumpleaños de HOY para esta identidad (campana del portal).
 *
 * La escribe el cron de `apps/asegura` (tabla `felicitacion`): la fecha de nacimiento va cifrada y
 * aquí no hay clave, así que el portal no decide si es el cumpleaños de nadie; solo lee si hoy hay
 * una felicitación para alguna ficha VINCULADA a esta identidad. La identidad sale de la sesión
 * (quien llama la trae de `requireIdentidad()`), nunca de la petición.
 */
import { diaMadrid } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

export async function felicitacionesDeIdentidad(identidadId: string): Promise<{ id: string }[]> {
  const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
  if (vinculos.length === 0) return []
  return prisma.felicitacion.findMany({
    where: { clienteId: { in: vinculos.map((v) => v.clienteId) }, dia: new Date(`${diaMadrid(new Date())}T00:00:00Z`) },
    select: { id: true },
  })
}

/** La misma lectura para la sesión actual (sin sesión, nada). */
export async function felicitacionesDeSesion(): Promise<{ id: string }[]> {
  const identidad = await getIdentidad()
  return identidad ? felicitacionesDeIdentidad(identidad.id) : []
}
