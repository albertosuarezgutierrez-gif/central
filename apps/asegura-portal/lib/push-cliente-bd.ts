import { motivoSinPush, resolverPreferenciasAvisos } from '@central/module-seguros-portal'

import { prisma } from './db'
import type { DepsPushCliente } from './push-cliente'

/**
 * Adaptador de BD de `push-cliente.ts` (03/11/2026). Lo usa SOLO `POST /api/operador/push-cliente`, que se autentica por
 * el secreto entre apps (no hay cookie: quien pide es asegura, no un visitante). Exento en
 * `test/regression-portal-aislamiento.test.ts`: el `clienteId` llega de asegura (servidor con secreto), y TODA consulta
 * `portal*` de aquí lleva `identidadId` resuelto por `portal_vinculo` de ESE cliente. No lee cartera (ni pólizas ni
 * fichas): solo vínculo, preferencias y suscripciones.
 */
export function depsPushClienteBd(enviar: DepsPushCliente['enviar'], ahora = new Date()): DepsPushCliente {
  return {
    async identidadesDeCliente(clienteId) {
      const v = await prisma.portalVinculo.findMany({ where: { clienteId }, select: { identidadId: true } })
      return v.map((x) => x.identidadId)
    },
    async omitirPorPreferencia(identidadIds) {
      const g = await prisma.portalPreferenciasAvisos.findMany({
        where: { identidadId: { in: identidadIds } },
        select: { identidadId: true, canal: true, diasAntelacion: true, noMolestarDesde: true, noMolestarHasta: true },
      })
      return new Set(g.filter((p) => motivoSinPush(resolverPreferenciasAvisos(p), ahora) !== null).map((p) => p.identidadId))
    },
    async suscripciones(identidadIds) {
      return prisma.portalPushSuscripcion.findMany({
        where: { identidadId: { in: identidadIds } },
        select: { id: true, identidadId: true, endpoint: true, p256dh: true, authKey: true },
      })
    },
    enviar,
    async borrarSuscripcion(s) {
      await prisma.portalPushSuscripcion.deleteMany({ where: { id: s.id, identidadId: s.identidadId } })
    },
    log: (m) => console.error(`[operador/push-cliente] ${m}`),
  }
}
