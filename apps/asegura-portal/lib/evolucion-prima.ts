// «Evolución de la prima» de una póliza (14/10/2026): lo que hay detrás del push de «subida de prima».
//
// 🔒 Aislamiento por CÓDIGO. La identidad sale de la COOKIE (`getIdentidad`), nunca de un parámetro, y va
// dentro del `where` junto con el origen y el id. El id de la póliza NO consulta por sí solo: quien llama
// (las fichas) ya lo ha encontrado DENTRO de la cartera autorizada de esa sesión y dice si es suya
// (`propia`). Una póliza vista por autorización o por figurar en ella no tiene observaciones de esta
// identidad (el cron solo observa las propias) y aquí ni se consulta.
//
// Leer no escribe. Si la lectura falla devuelve `null` (no se pinta nada): no se afirma ni «no ha subido»
// ni una cifra que no se ha leído.
import { evolucionDePrima, type EvolucionPrima } from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

const NUM = (x: { toString(): string } | null): number | null => (x === null ? null : Number(x.toString()))

export async function evolucionDePrimaDePoliza(
  origen: 'cartera' | 'aportada',
  polizaId: string,
  propia: boolean,
): Promise<EvolucionPrima | null> {
  if (!propia) return null
  const identidad = await getIdentidad()
  if (!identidad) return null
  try {
    const fila = await prisma.portalPrimaObservada.findFirst({
      where: { identidadId: identidad.id, origen, refId: polizaId },
    })
    if (!fila) return null
    return evolucionDePrima({
      importe: NUM(fila.importe),
      unidad: fila.unidad,
      observadoEn: fila.observadoEn,
      subidaDesde: NUM(fila.subidaDesde),
      subidaHasta: NUM(fila.subidaHasta),
      subidaPorcentaje: NUM(fila.subidaPorcentaje),
      subidaEn: fila.subidaEn,
    })
  } catch (e) {
    console.error('[portal/evolucion-prima] no se ha podido leer:', e instanceof Error ? e.message : e)
    return null
  }
}
