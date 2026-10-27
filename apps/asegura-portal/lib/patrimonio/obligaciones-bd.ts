// PATRIMONIO (25/10/2026) — puertos con BD de las OBLIGACIONES PROPIAS de un inmueble (`obligaciones-api.ts`).
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`) y la sesión tiene que ser la de
// `identidadId`. El inmueble se busca DENTRO de los titulares autorizados; cada lectura o escritura vuelve a autorizarlo
// y filtra por `inmuebleId`. Solo se tocan filas PROPIAS (`categoria` no nula): las precargadas no se editan desde aquí.
// Sin DELETE: la baja es `archivadoEn`. Cepo `regression-portal-patrimonio-aislamiento`.
import { aDateMediodia, type CategoriaObligacionPropia } from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { fechaDe } from './lectura'
import { CategoriaNoDisponible, esRechazoDelCatalogo, mesesAGuardar, type PuertosObligaciones } from './obligaciones-api'

/** El CHECK del catálogo (p. ej. `hipoteca` sin su SQL aplicado) → señal tipada; el resto de fallos, tal cual. */
function traducir(e: unknown): never {
  if (esRechazoDelCatalogo(e)) throw new CategoriaNoDisponible()
  throw e
}

export function puertosObligaciones(identidadId: string): PuertosObligaciones {
  let accesos: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const misAccesos = async () => (accesos ??= await accesosPatrimonio(identidadId))
  const sesionEsLaMia = async () => (await getIdentidad())?.id === identidadId

  /** El inmueble SOLO dentro de los titulares autorizados (archivado incluido: se ve en solo lectura). */
  async function autorizado(idPedido: string) {
    if (!(await sesionEsLaMia())) return null
    const acc = await misAccesos()
    if (acc.size === 0) return null
    const fila = await prisma.portalPatrimonioInmueble.findFirst({
      where: { id: idPedido, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
      select: { id: true, archivadoEn: true, titular: { select: { clienteId: true } } },
    })
    if (!fila) return null
    const nivel = acc.get(fila.titular.clienteId)
    return nivel ? { id: fila.id, nivel, archivado: fila.archivadoEn !== null } : null
  }
  /** Para escribir: además, vivo. */
  async function vivo(inmuebleId: string) {
    const r = await autorizado(inmuebleId)
    return r && !r.archivado ? r : null
  }

  return {
    inmueble: (idPedido) => autorizado(idPedido),

    async propias(inmuebleId) {
      if (!(await autorizado(inmuebleId))) return []
      const filas = await prisma.portalPatrimonioObligacion.findMany({
        where: { inmuebleId, archivadoEn: null, categoria: { not: null } },
        select: { id: true, categoria: true, vence: true, periodicidadMeses: true, descripcion: true },
        orderBy: { vence: 'asc' },
        take: 200,
      })
      return filas.map((f) => ({
        id: f.id,
        categoria: f.categoria as CategoriaObligacionPropia,
        vence: fechaDe(f.vence),
        periodicidadMeses: f.periodicidadMeses,
        descripcion: f.descripcion?.trim() || null,
      }))
    },

    async crear(inmuebleId, v) {
      if (!(await vivo(inmuebleId))) throw new Error('inmueble_no_autorizado')
      await prisma.portalPatrimonioObligacion.create({
        data: {
          inmuebleId,
          tipo: 'otra',
          categoria: v.categoria,
          // El CHECK de BD exige `descripcion` en tipo 'otra': sin texto del cliente, cadena vacía.
          descripcion: v.descripcion ?? '',
          aplica: true,
          vence: aDateMediodia(v.vence),
          periodicidadMeses: mesesAGuardar(v.periodicidad),
          creadoPorIdentidadId: identidadId,
        },
        select: { id: true },
      }).catch(traducir)
    },

    async actualizar(inmuebleId, id, v) {
      if (!(await vivo(inmuebleId))) return false
      const r = await prisma.portalPatrimonioObligacion.updateMany({
        where: { id, inmuebleId, archivadoEn: null, categoria: { not: null } },
        data: {
          categoria: v.categoria,
          descripcion: v.descripcion ?? '',
          vence: aDateMediodia(v.vence),
          periodicidadMeses: mesesAGuardar(v.periodicidad),
          avisadaEn: null,
        },
      }).catch(traducir)
      return r.count === 1
    },

    async avanzar(inmuebleId, id, vence, hechaEn) {
      if (!(await vivo(inmuebleId))) return false
      const r = await prisma.portalPatrimonioObligacion.updateMany({
        where: { id, inmuebleId, archivadoEn: null, categoria: { not: null } },
        data: { vence: aDateMediodia(vence), ultima: aDateMediodia(hechaEn), avisadaEn: null },
      })
      return r.count === 1
    },

    async archivar(inmuebleId, id) {
      if (!(await vivo(inmuebleId))) return false
      const r = await prisma.portalPatrimonioObligacion.updateMany({
        where: { id, inmuebleId, archivadoEn: null, categoria: { not: null } },
        data: { archivadoEn: new Date() },
      })
      return r.count === 1
    },
  }
}
