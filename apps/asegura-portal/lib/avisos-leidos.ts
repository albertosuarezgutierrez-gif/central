/**
 * Los avisos de la campana que la persona ya pulsó (29/09/2026). Solo lectura y alta: un aviso
 * leído no se «des-lee».
 */
import { esClaveDescartable } from './avisos'
import { prisma } from './db'
import { getIdentidad } from './session'

/** Las claves ya pulsadas. `identidadId` lo pone quien llama, que lo saca de la sesión. */
export async function avisosLeidosDeIdentidad(identidadId: string): Promise<Set<string>> {
  const filas = await prisma.portalAvisoLeido.findMany({ where: { identidadId }, select: { clave: true } })
  return new Set(filas.map((f) => f.clave))
}

/**
 * Sella una clave para quien tiene la sesión (la identidad NUNCA sale de la petición). Solo de
 * avisos informativos: una autorización o una firma no se «leen», se resuelven.
 */
export async function marcarAvisoLeidoDeSesion(clave: string): Promise<'ok' | 'sin_sesion' | 'clave_no_valida'> {
  const identidad = await getIdentidad()
  if (!identidad) return 'sin_sesion'
  if (!esClaveDescartable(clave)) return 'clave_no_valida'
  await prisma.portalAvisoLeido.createMany({ data: [{ identidadId: identidad.id, clave }], skipDuplicates: true })
  return 'ok'
}
