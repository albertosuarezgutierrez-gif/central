// Proyección de la base imponible a fin de año: base real devengada + reservas
// futuras confirmadas de sivra (incomes) + ingresos/gastos recurrentes proyectados.
// Extraído de /api/finanzas/proyeccion para que también lo consuma la comparativa
// de declaración (/api/finanzas/comparativa) sin duplicar las queries.
import { prisma } from './db'
import { detectarPatronesRecurrentes, type PatronRecurrente } from './gastos-recurrentes'
import type { ResumenFinanciero } from './finanzas'

export type ProyeccionFiscal = {
  baseReal: number
  baseProyectada: number
  ingresosFuturos: number
  reservasFuturas: { mes: string; totalNeto: number; numReservas: number }[]
  patrones: PatronRecurrente[]
  ingresosRecurrentesProyectados: number
  gastosDeduciblesProyectados: number
  mesesRestantes: number
}

export async function getProyeccionFiscal(
  cuentaId: string,
  year: number,
  resumen: ResumenFinanciero,
): Promise<ProyeccionFiscal> {
  const hoy = new Date().toISOString().slice(0, 10)
  const finAnio = `${year}-12-31`

  const [reservasFuturasRows, patronesResult] = await Promise.all([
    prisma.$queryRaw<Array<{ mes: string; total_neto: unknown; num_reservas: unknown }>>`
      SELECT
        to_char(date_trunc('month', "checkIn"), 'YYYY-MM') AS mes,
        coalesce(sum(amount), 0) AS total_neto,
        count(*)::int AS num_reservas
      FROM incomes
      WHERE "checkIn" > ${hoy}::date
        AND "checkIn" <= ${finAnio}::date
        AND amount > 0
      GROUP BY date_trunc('month', "checkIn")
      ORDER BY 1
    `,
    detectarPatronesRecurrentes(cuentaId, year),
  ])

  const reservasFuturas = reservasFuturasRows.map(r => ({
    mes: r.mes as string,
    totalNeto: Number(r.total_neto),
    numReservas: Number(r.num_reservas),
  }))

  const ingresosFuturos = reservasFuturas.reduce((s, r) => s + r.totalNeto, 0)

  const baseReal = resumen.fiscal.baseImponibleEstimada
  const baseProyectada =
    baseReal +
    ingresosFuturos +
    patronesResult.ingresosProyectados -
    patronesResult.gastosProyectados

  return {
    baseReal,
    baseProyectada,
    ingresosFuturos,
    reservasFuturas,
    patrones: patronesResult.patrones,
    ingresosRecurrentesProyectados: patronesResult.ingresosProyectados,
    gastosDeduciblesProyectados: patronesResult.gastosProyectados,
    mesesRestantes: patronesResult.mesesRestantes,
  }
}
