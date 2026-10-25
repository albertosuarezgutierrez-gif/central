// PATRIMONIO (25/10/2026) — puertos con BD de las ofertas que pulsa el cliente (`ofertas-api.ts`).
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` y la sesión tiene que ser la de `identidadId`. El inmueble se
// busca DENTRO de los titulares autorizados, el contrato DENTRO de ese inmueble y la póliza declarada con `identidadId` en
// el `where` (y sin eliminar). Nada de un id del cuerpo llega a un `findUnique`. Sin RLS: un `where` de menos devolvería
// datos de cualquiera. Cepo `regression-portal-patrimonio-aislamiento`.
import { declaradaVigente } from '@central/module-patrimonio'

import { prisma } from '../db'
import { DECLARADA_NO_ELIMINADA } from '../declaradas-eliminadas'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { fechaMadrid } from './dia-madrid'
import { esRespuestaHipoteca } from './ofertas'
import type { PuertosOfertas } from './ofertas-api'
import { pedirPrecioPorPuente } from './pedir-precio-puente'

export function puertosOfertas(identidadId: string): PuertosOfertas {
  let accesos: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const misAccesos = async () => (accesos ??= await accesosPatrimonio(identidadId))
  const sesionEsLaMia = async () => (await getIdentidad())?.id === identidadId

  async function inmuebleDentro(id: string) {
    if (!(await sesionEsLaMia())) return null
    const acc = await misAccesos()
    if (acc.size === 0) return null
    const fila = await prisma.portalPatrimonioInmueble.findFirst({
      where: { id, archivadoEn: null, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
      select: { id: true, hipoteca: true, titular: { select: { clienteId: true } } },
    })
    if (!fila) return null
    const nivel = acc.get(fila.titular.clienteId)
    return nivel ? { fila, nivel } : null
  }

  return {
    async inmueble(id) {
      const r = await inmuebleDentro(id)
      if (!r) return null
      // Un valor fuera de la lista cerrada se lee como «no lo ha dicho» (nunca como «sí»).
      return { id: r.fila.id, nivel: r.nivel, hipoteca: esRespuestaHipoteca(r.fila.hipoteca) ? r.fila.hipoteca : null }
    },

    async contrato(inmuebleId, contratoId) {
      // `inmuebleId` sale de `inmueble()` (ya autorizado); se vuelve a comprobar por si alguien llama sin pasar por ahí.
      if (!(await inmuebleDentro(inmuebleId))) return null
      const c = await prisma.portalPatrimonioContrato.findFirst({
        where: { id: contratoId, inmuebleId, archivadoEn: null },
        select: { id: true, terminadoEn: true },
      })
      return c ? { id: c.id, terminadoEn: c.terminadoEn ? c.terminadoEn.toISOString().slice(0, 10) : null } : null
    },

    async declarada(id) {
      if (!(await sesionEsLaMia())) return null
      const d = await prisma.portalPolizaDeclarada.findFirst({
        where: { id, identidadId, ...DECLARADA_NO_ELIMINADA },
        select: { id: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true },
      })
      return d ? { id: d.id, vigente: declaradaVigente(d, new Date()) } : null
    },

    hoy: () => fechaMadrid(new Date()),

    pedirPorPuente: (x) => pedirPrecioPorPuente({ identidadId, ...x }),

    async guardarHipoteca(inmuebleId, valor) {
      if (!(await inmuebleDentro(inmuebleId))) return
      await prisma.portalPatrimonioInmueble.updateMany({ where: { id: inmuebleId, archivadoEn: null }, data: { hipoteca: valor } })
    },
  }
}
