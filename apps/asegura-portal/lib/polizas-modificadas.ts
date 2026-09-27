/**
 * Las pólizas de ESTA identidad con un cambio reciente, para la campana (27/09/2026): precio,
 * fechas, coberturas, una baja, documentación nueva… Los cambios los detecta y escribe
 * `apps/asegura` (`poliza-cambios-detector.ts`); aquí solo se leen, y los junta por póliza la MISMA
 * regla que usa el correo de la intranet (`polizasModificadasParaAviso`).
 *
 * Las fichas VINCULADAS a esta identidad como tomador y, desde el 27/09/2026, las pólizas de quien
 * le dio «Acceso total» (vigente). Con «Solo ver» no se avisa de lo ajeno. La identidad sale de la sesión.
 */
import {
  autorizacionVigente,
  DIAS_AVISO_POLIZA_MODIFICADA,
  polizasModificadasParaAviso,
  type PolizaModificadaParaAviso,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

const MS_DIA = 86_400_000

export async function polizasModificadasDeIdentidad(identidadId: string, hoy = new Date()): Promise<PolizaModificadaParaAviso[]> {
  const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
  const propios = new Set(vinculos.map((v) => v.clienteId))

  // Las de OTRA persona que le dio «Acceso total» (27/09/2026): con ese permiso ya puede actuar en
  // su nombre, así que enterarse de que su póliza cambió es parte de lo concedido. Con «Solo ver»
  // NO: mira cuando quiere, pero no se le avisa de lo ajeno (mismo criterio que el push de CIMA).
  const auts = await prisma.portalAutorizacion.findMany({
    where: {
      alcance: 'total',
      revocadoEn: null,
      aceptadoEn: { not: null },
      OR: [{ autorizadoIdentidadId: identidadId }, ...(propios.size > 0 ? [{ autorizadoClienteId: { in: [...propios] } }] : [])],
    },
    select: { otorganteClienteId: true, polizaId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
  })
  const vigentes = auts.filter((a) => autorizacionVigente(a, hoy) && !propios.has(a.otorganteClienteId))
  const otorganteEntero = new Set(vigentes.filter((a) => a.polizaId === null).map((a) => a.otorganteClienteId))
  const polizaSuelta = new Map(vigentes.filter((a) => a.polizaId !== null).map((a) => [a.polizaId!, a.otorganteClienteId]))
  if (propios.size === 0 && otorganteEntero.size === 0 && polizaSuelta.size === 0) return []

  const cambios = await prisma.portalPolizaCambio.findMany({
    where: {
      detectadoEn: { gte: new Date(hoy.getTime() - DIAS_AVISO_POLIZA_MODIFICADA * MS_DIA) },
      OR: [
        { clienteId: { in: [...propios, ...otorganteEntero] } },
        ...(polizaSuelta.size > 0 ? [{ polizaId: { in: [...polizaSuelta.keys()] } }] : []),
      ],
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
  const ajenos = [...new Set(polizas.map((p) => p.clienteId).filter((c) => !propios.has(c)))]
  const [nombres, titulares] = await Promise.all([
    codigos.length ? prisma.companiaDgs.findMany({ where: { codigoDgs: { in: codigos } }, select: { codigoDgs: true, nombreComun: true } }) : [],
    ajenos.length ? prisma.cliente.findMany({ where: { id: { in: ajenos } }, select: { id: true, nombre: true } }) : [],
  ])
  const compania = new Map(nombres.map((c) => [c.codigoDgs, c.nombreComun]))
  const nombrePila = new Map(titulares.map((t) => [t.id, t.nombre?.trim() || null]))

  return polizasModificadasParaAviso(
    cambios.flatMap((c) => {
      const p = polizaPor.get(c.polizaId)
      if (!p || p.clienteId !== c.clienteId) return []
      const propia = propios.has(p.clienteId)
      const ajenaOk = otorganteEntero.has(p.clienteId) || polizaSuelta.get(p.id) === p.clienteId
      if (!propia && !ajenaOk) return []
      return [{
        id: c.id,
        polizaId: c.polizaId,
        campos: c.campos,
        estadoNuevo: c.estadoNuevo,
        detectadoEn: c.detectadoEn,
        compania: (p.codigoEntidadDgs ? compania.get(p.codigoEntidadDgs) : undefined) ?? p.aseguradora,
        tipo: String(p.tipo),
        ...(propia ? {} : { titularAjeno: nombrePila.get(p.clienteId) ?? null }),
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
