/**
 * Las pólizas de ESTA identidad con un cambio reciente, para la campana (27/09/2026): precio,
 * fechas, coberturas, una baja, documentación nueva… Los cambios los detecta y escribe
 * `apps/asegura` (`poliza-cambios-detector.ts`); aquí solo se leen, y los junta por póliza la MISMA
 * regla que usa el correo de la intranet (`polizasModificadasParaAviso`).
 *
 * Solo las fichas VINCULADAS a esta identidad como tomador, igual que las pólizas nuevas: un cambio
 * en la póliza de quien te autoriza a verla no es un aviso tuyo. La identidad sale de la sesión.
 */
import {
  DIAS_AVISO_POLIZA_MODIFICADA,
  polizasModificadasParaAviso,
  type PolizaModificadaParaAviso,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

const MS_DIA = 86_400_000

export async function polizasModificadasDeIdentidad(identidadId: string, hoy = new Date()): Promise<PolizaModificadaParaAviso[]> {
  const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
  if (vinculos.length === 0) return []
  const cambios = await prisma.portalPolizaCambio.findMany({
    where: {
      clienteId: { in: vinculos.map((v) => v.clienteId) },
      detectadoEn: { gte: new Date(hoy.getTime() - DIAS_AVISO_POLIZA_MODIFICADA * MS_DIA) },
    },
    select: { id: true, polizaId: true, clienteId: true, campos: true, estadoNuevo: true, detectadoEn: true },
  })
  if (cambios.length === 0) return []

  // La póliza tiene que seguir siendo de ese tomador (una fusión o un cambio de titular la mueve).
  const polizas = await prisma.poliza.findMany({
    where: { id: { in: [...new Set(cambios.map((c) => c.polizaId))] }, mergedIntoPolizaId: null },
    select: { id: true, clienteId: true, aseguradora: true, codigoEntidadDgs: true, tipo: true },
  })
  const polizaPor = new Map(polizas.map((p) => [p.id, p]))
  const codigos = [...new Set(polizas.map((p) => p.codigoEntidadDgs).filter((x): x is string => !!x))]
  const nombres = new Map(
    (codigos.length ? await prisma.companiaDgs.findMany({ where: { codigoDgs: { in: codigos } }, select: { codigoDgs: true, nombreComun: true } }) : [])
      .map((c) => [c.codigoDgs, c.nombreComun]),
  )

  return polizasModificadasParaAviso(
    cambios.flatMap((c) => {
      const p = polizaPor.get(c.polizaId)
      if (!p || p.clienteId !== c.clienteId) return []
      return [{
        id: c.id,
        polizaId: c.polizaId,
        campos: c.campos,
        estadoNuevo: c.estadoNuevo,
        detectadoEn: c.detectadoEn,
        compania: (p.codigoEntidadDgs ? nombres.get(p.codigoEntidadDgs) : undefined) ?? p.aseguradora,
        tipo: String(p.tipo),
      }]
    }),
    hoy,
  )
}

/** La misma lectura para la sesión actual (sin sesión, nada). */
export async function polizasModificadasDeSesion(): Promise<PolizaModificadaParaAviso[]> {
  const identidad = await getIdentidad()
  return identidad ? polizasModificadasDeIdentidad(identidad.id) : []
}
