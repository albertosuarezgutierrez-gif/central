// 💼 Cartera REAL del bróker — IO (Prisma). La escribe POST /api/trading/cartera (pasada diaria
// del agente trading-analista, que es quien lee IBKR); la lee el panel /trading. La parte pura
// (normalización + resumen) vive en cartera-real.ts.
import { prisma } from '@/lib/db'
import type { PosicionRealIn } from './cartera-real'

export type PosicionRealUI = PosicionRealIn & { actualizado: Date }

export type CarteraRealUI = {
  broker: string
  /** Cuándo se leyó IBKR por última vez. */
  actualizado: Date
  /** [] = leída y SIN posiciones (dato real, no un hueco). */
  posiciones: PosicionRealUI[]
}

/** Reemplaza la foto completa de la cartera de una cuenta+bróker (transacción: borrar + insertar
 *  + marcar sincronización). Un array vacío es válido: significa «leída, sin posiciones». */
export async function reemplazarCarteraReal(
  cuentaId: string,
  broker: string,
  posiciones: PosicionRealIn[],
): Promise<void> {
  const ahora = new Date()
  await prisma.$transaction([
    prisma.tradingCarteraReal.deleteMany({ where: { cuentaId, broker } }),
    ...(posiciones.length
      ? [prisma.tradingCarteraReal.createMany({
          data: posiciones.map(p => ({
            cuentaId, broker,
            simbolo: p.simbolo, descripcion: p.descripcion,
            cantidad: p.cantidad, precioMedio: p.precioMedio, precioActual: p.precioActual,
            valorMercado: p.valorMercado, pnlNoRealizado: p.pnlNoRealizado, pnlDiario: p.pnlDiario,
            divisa: p.divisa, actualizadoEn: ahora,
          })),
        })]
      : []),
    prisma.tradingCarteraRealSync.upsert({
      where: { cuentaId_broker: { cuentaId, broker } },
      create: { cuentaId, broker, numPosiciones: posiciones.length, actualizadoEn: ahora },
      update: { numPosiciones: posiciones.length, actualizadoEn: ahora },
    }),
  ])
}

/** Última foto conocida de la cartera real de la cuenta. `null` = NUNCA sincronizada (distinto de
 *  «sin posiciones»: eso es un objeto con posiciones []). Si hubiera varios brókers, devuelve el
 *  sincronizado más recientemente (hoy solo hay Interactive Brokers). */
export async function getCarteraReal(cuentaId: string): Promise<CarteraRealUI | null> {
  const sync = await prisma.tradingCarteraRealSync.findFirst({
    where: { cuentaId },
    orderBy: { actualizadoEn: 'desc' },
  })
  if (!sync) return null
  const filas = await prisma.tradingCarteraReal.findMany({
    where: { cuentaId, broker: sync.broker },
    orderBy: { valorMercado: { sort: 'desc', nulls: 'last' } },
  })
  return {
    broker: sync.broker,
    actualizado: sync.actualizadoEn,
    posiciones: filas.map(f => ({
      simbolo: f.simbolo,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad),
      precioMedio: f.precioMedio != null ? Number(f.precioMedio) : null,
      precioActual: f.precioActual != null ? Number(f.precioActual) : null,
      valorMercado: f.valorMercado != null ? Number(f.valorMercado) : null,
      pnlNoRealizado: f.pnlNoRealizado != null ? Number(f.pnlNoRealizado) : null,
      pnlDiario: f.pnlDiario != null ? Number(f.pnlDiario) : null,
      divisa: f.divisa,
      actualizado: f.actualizadoEn,
    })),
  }
}
