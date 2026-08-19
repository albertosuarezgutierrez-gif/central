// 📒 Libro de operaciones del bróker — IO (Prisma). Lo escribe POST /api/trading/operaciones
// (pasada diaria del agente trading-analista, que es quien lee IBKR). La parte pura vive en
// operaciones.ts.
//
// El libro es INMUTABLE: una ejecución ya registrada no se actualiza nunca, porque el hecho no
// cambia. Por eso el guardado es «insertar las que falten» (skipDuplicates sobre la clave única
// broker+trade_id) y no un upsert: reenviar la misma pasada diez veces deja el libro idéntico.
import { prisma } from '@/lib/db'
import type { OperacionIn } from './operaciones'

export type ResultadoGuardado = {
  recibidas: number
  /** Ejecuciones nuevas que han entrado en el libro. */
  insertadas: number
  /** Ya estaban: la pasada se solapa con la anterior, que es lo normal y lo deseable. */
  duplicadas: number
  /** Total del libro tras la pasada. */
  total: number
  /** La ejecución más reciente del libro. null = libro vacío. */
  ultimaEjecucion: Date | null
}

export async function guardarOperaciones(
  cuentaId: string,
  broker: string,
  operaciones: OperacionIn[],
): Promise<ResultadoGuardado> {
  const insertadas = operaciones.length
    ? (await prisma.tradingOperacion.createMany({
        data: operaciones.map(o => ({
          cuentaId, broker,
          tradeId: o.tradeId, orderId: o.orderId,
          simbolo: o.simbolo, descripcion: o.descripcion, tipoActivo: o.tipoActivo,
          lado: o.lado, cantidad: o.cantidad, precio: o.precio, divisa: o.divisa,
          comision: o.comision, importeNeto: o.importeNeto, tipoOrden: o.tipoOrden,
          ejecutadoEn: o.ejecutadoEn, pnlBroker: o.pnlBroker, tipoCambio: o.tipoCambio,
        })),
        skipDuplicates: true,
      })).count
    : 0

  const [total, ultima] = await Promise.all([
    prisma.tradingOperacion.count({ where: { cuentaId, broker } }),
    prisma.tradingOperacion.findFirst({
      where: { cuentaId, broker },
      orderBy: { ejecutadoEn: 'desc' },
      select: { ejecutadoEn: true },
    }),
  ])
  const ultimaEjecucion = ultima?.ejecutadoEn ?? null

  // La marca de sincronización se escribe SIEMPRE, aunque no haya entrado nada nuevo: es
  // justamente el caso que hay que poder distinguir de «hace semanas que no se lee».
  const datos = { ultimaEjecucion, numOperaciones: total, actualizadoEn: new Date() }
  await prisma.tradingOperacionesSync.upsert({
    where: { cuentaId_broker: { cuentaId, broker } },
    create: { cuentaId, broker, ...datos },
    update: datos,
  })

  return { recibidas: operaciones.length, insertadas, duplicadas: operaciones.length - insertadas, total, ultimaEjecucion }
}

export type EstadoLibro = {
  broker: string
  /** Cuándo se leyó IBKR por última vez. */
  actualizado: Date
  ultimaEjecucion: Date | null
  numOperaciones: number
  /** Cuántas filas siguen sin tipo de cambio: mientras sea > 0 no hay cifra en euros defendible. */
  sinTipoCambio: number
}

/** Estado del libro. `null` = NUNCA sincronizado, que no es lo mismo que «libro vacío»
 *  (eso es un objeto con numOperaciones 0). */
export async function getEstadoLibro(cuentaId: string): Promise<EstadoLibro | null> {
  const sync = await prisma.tradingOperacionesSync.findFirst({
    where: { cuentaId },
    orderBy: { actualizadoEn: 'desc' },
  })
  if (!sync) return null
  const sinTipoCambio = await prisma.tradingOperacion.count({
    where: { cuentaId, broker: sync.broker, tipoCambio: null },
  })
  return {
    broker: sync.broker,
    actualizado: sync.actualizadoEn,
    ultimaEjecucion: sync.ultimaEjecucion,
    numOperaciones: sync.numOperaciones,
    sinTipoCambio,
  }
}
