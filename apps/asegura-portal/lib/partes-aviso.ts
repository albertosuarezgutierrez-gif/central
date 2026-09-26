import { DIAS_AVISO_PARTE, partesParaAviso, type ParteParaAviso } from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

const MS_DIA = 86_400_000

/**
 * Los partes de ESTA identidad con un cambio reciente (abierto en la compañía o
 * descartado), para la campana. La identidad sale de la sesión, nunca de la request.
 */
export async function partesAvisoDeIdentidad(identidadId: string, hoy = new Date()): Promise<ParteParaAviso[]> {
  const desde = new Date(hoy.getTime() - DIAS_AVISO_PARTE * MS_DIA)
  const filas = await prisma.portalParteSiniestro.findMany({
    where: {
      identidadId,
      OR: [{ abiertoEnCompaniaAt: { gte: desde } }, { descartadoAt: { gte: desde } }],
    },
    select: {
      id: true,
      fechaHecho: true,
      abiertoEnCompaniaAt: true,
      descartadoAt: true,
      motivoDescarte: true,
      polizaId: true,
      polizaDesligadaCompania: true,
      polizaDeclarada: { select: { compania: true } },
    },
  })
  if (filas.length === 0) return []

  // La compañía de las pólizas de CARTERA: sin relación de Prisma (ver el modelo).
  const ids = [...new Set(filas.map((f) => f.polizaId).filter((x): x is string => x !== null))]
  // Y solo de las fichas que esta identidad tiene vinculadas: un parte cuya póliza
  // ya no es suya (vínculo retirado) se queda sin compañía, no con la de otro.
  const vinculos = ids.length ? await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } }) : []
  const cartera = vinculos.length
    ? await prisma.poliza.findMany({
        where: { id: { in: ids }, clienteId: { in: vinculos.map((v) => v.clienteId) } },
        select: { id: true, aseguradora: true },
      })
    : []
  const aseguradora = new Map(cartera.map((p) => [p.id, p.aseguradora]))

  return partesParaAviso(
    filas.map((f) => ({
      id: f.id,
      fechaHecho: f.fechaHecho,
      abiertoEnCompaniaAt: f.abiertoEnCompaniaAt,
      descartadoAt: f.descartadoAt,
      motivoDescarte: f.motivoDescarte,
      compania:
        (f.polizaId ? aseguradora.get(f.polizaId) : undefined) ??
        f.polizaDeclarada?.compania ??
        f.polizaDesligadaCompania ??
        null,
    })),
    hoy,
  )
}

/** La misma lectura, resolviendo la identidad por la sesión. Sin sesión, nada. */
export async function partesAvisoDeSesion(): Promise<ParteParaAviso[]> {
  const identidad = await getIdentidad()
  return identidad ? partesAvisoDeIdentidad(identidad.id) : []
}
