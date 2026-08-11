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
  // Coste deducible variable estimado de las reservas futuras (ingresosFuturos × margen histórico).
  costeTuristicoFuturo: number
  // Ratio histórico gasto-deducible/ingreso de los pisos (0..1) usado para el coste variable.
  margenTuristico: number
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
  const meses = patronesResult.mesesRestantes

  // ── Coste deducible VARIABLE de las reservas futuras ────────────────────────────────────────
  // `ingresosFuturos` (tabla `incomes`) es NETO de comisión del portal, pero BRUTO de coste de
  // operación (limpieza/lavandería/suministros por estancia). Aplicamos el ratio histórico
  // gasto-deducible/ingreso de los pisos del propio `resumen` (ya sin amortizables) para descontar
  // ese coste. Cap [0, 0.6] y guarda contra división por cero.
  const pisos = resumen.pisos.total
  const margenTuristico = pisos.ingresos > 0
    ? Math.min(0.6, Math.max(0, pisos.gastos / pisos.ingresos))
    : 0
  const costeTuristicoFuturo = ingresosFuturos * margenTuristico

  // ── Recurrentes proyectados: SOLO correduría (`seguros`) ────────────────────────────────────
  // El ingreso/gasto turístico futuro YA entra por `ingresosFuturos` (neto del coste variable de
  // arriba). Los patrones turísticos del BANCO (payouts de Booking, gastos fijos de pisos) se
  // proyectarían OTRA VEZ hacia el futuro → doble conteo. Se excluyen de la proyección (siguen en
  // `patrones` solo para mostrarlos). Correduría no tiene equivalente en `incomes` → sí se proyecta.
  const segurosProy = patronesResult.patrones.filter(p => p.destino === 'seguros')
  const ingresosSegurosProy = segurosProy.filter(p => p.tipo === 'ingreso').reduce((s, p) => s + p.importeMedioMensual * meses, 0)
  const gastosSegurosProy = segurosProy.filter(p => p.tipo === 'gasto').reduce((s, p) => s + p.importeMedioMensual * meses, 0)

  const baseReal = resumen.fiscal.baseImponibleEstimada
  const baseProyectada =
    baseReal +
    ingresosFuturos -
    costeTuristicoFuturo +
    ingresosSegurosProy -
    gastosSegurosProy

  return {
    baseReal,
    baseProyectada,
    ingresosFuturos,
    reservasFuturas,
    patrones: patronesResult.patrones,
    ingresosRecurrentesProyectados: ingresosSegurosProy,
    // El gasto deducible proyectado total = fijos de correduría + coste variable turístico.
    gastosDeduciblesProyectados: gastosSegurosProy + costeTuristicoFuturo,
    costeTuristicoFuturo,
    margenTuristico,
    mesesRestantes: meses,
  }
}
