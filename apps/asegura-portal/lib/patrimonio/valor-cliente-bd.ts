// PATRIMONIO (27/10/2026) — lectura con BD del valor del grupo de un titular (cupo de IA de las facturas). Lee CARTERA
// (`polizas`), así que parte de la identidad: sesión (`getIdentidad`, defensa en profundidad) y los accesos de
// `accesosPatrimonio(identidadId)`, que salen de `portalVinculo` (la costura identidad ↔ ficha) y de las autorizaciones
// vivas. El `clienteId` solo se acepta si está en esos accesos; el grupo se amplía con las autorizaciones que ESE titular
// ha dado. Nada que llegue en la petición consulta por sí mismo. Lanza si falla: el llamador lo toma como «no se sabe».
import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { recompensaVigenteDeIdentidad } from './recomendacion-bd'
import { valorDelGrupo } from './valor-cliente'

export async function valorClienteDeIdentidad(identidadId: string, clienteId: string) {
  if ((await getIdentidad())?.id !== identidadId) throw new Error('sesion')
  if (!(await accesosPatrimonio(identidadId)).has(clienteId)) throw new Error('sin_acceso')
  const dadas = await prisma.portalAutorizacion.findMany({
    where: { otorganteClienteId: clienteId, revocadoEn: null, autorizadoClienteId: { not: null } },
    select: { autorizadoClienteId: true },
  })
  const grupo = [...new Set([clienteId, ...dadas.map((a) => a.autorizadoClienteId as string)])]
  const filas = await prisma.poliza.findMany({
    where: { clienteId: { in: grupo } },
    select: { importRef: true, eiacXmlHash: true, estado: true, sustituidaAt: true, mergedIntoPolizaId: true },
  })
  // Recompensa por recomendar: de la IDENTIDAD de la sesión (no del titular de la URL). Un fallo = sin recompensa.
  return valorDelGrupo(filas, await recompensaVigenteDeIdentidad(identidadId))
}
