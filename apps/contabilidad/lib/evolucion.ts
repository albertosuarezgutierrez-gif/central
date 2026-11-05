// Datos de la pantalla Evolución a partir del repositorio de UNA empresa (dentro de su transacción RLS). Cálculo en el módulo puro.
import {
  aFechaISO, antiguedadSaldos, gastosPorCategoria, previsionTesoreria, serieTemporal, vencimientosEstimados,
  type Granularidad, type GastosPorCategoria, type Prevision, type PuntoSerie,
} from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'

export const CUBOS: Record<Granularidad, number> = { mes: 12, trimestre: 8, anio: 5 }

export type DatosEvolucion = {
  serie: PuntoSerie[]
  gastos: GastosPorCategoria | null
  prevision: Prevision | null
  /** Solo la parte de cobros/pagos pendientes que la previsión usa (estimada con plazo). */
  pendientes: { cobros: number | null; pagos: number | null }
}

export async function datosEvolucion(repo: RepoContable, gran: Granularidad, hoy: Date): Promise<DatosEvolucion> {
  const hoyISO = aFechaISO(hoy)
  const sumas = await repo.sumasMensuales({ hasta: hoyISO })
  const serie = serieTemporal(sumas, gran, hoy, CUBOS[gran])
  const ultimo = serie[serie.length - 1]
  const gastos = gastosPorCategoria(await repo.sumasPorCuenta({ desde: ultimo.desde, hasta: ultimo.hasta }))
  // Caja = saldo ACTUAL (acumulado hasta hoy), no el del cierre del cubo (que puede ser futuro).
  const cajaHoy = serieTemporal(sumas, 'mes', hoy, 1)[0].caja
  const partidas = await repo.partidasPorDocumento(['43', '40', '41'], { hasta: hoyISO })
  const prevision = previsionTesoreria({ saldoCaja: cajaHoy, vencimientos: vencimientosEstimados(partidas), hoy })
  return {
    serie, gastos, prevision,
    pendientes: { cobros: antiguedadSaldos(partidas, 'clientes', hoy)?.total ?? null, pagos: antiguedadSaldos(partidas, 'proveedores', hoy)?.total ?? null },
  }
}
