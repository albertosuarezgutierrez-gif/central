// Resumen mensual para Telegram: gastos del mes, bandeja, recurrentes que faltan
// y desglose de rentabilidad por piso (ingresos − gastos).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { recurrentesQueFaltan, type ReglaFaltante } from './anomalias'

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export interface PisoRentabilidad {
  propiedad: string
  nombre: string
  ingresos: number
  gastos: number
  neto: number
}

export interface ResumenMensual {
  year: number
  month: number
  gastosCount: number
  gastosSum: number
  bandejaCount: number
  faltan: ReglaFaltante[]
  pisos: PisoRentabilidad[]
  totalIngresos: number
  totalGastos: number
  totalNeto: number
}

export async function calcularResumen(year: number, month: number): Promise<ResumenMensual> {
  // Gastos del mes que cuentan (revisado != false).
  const [gtot] = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS n, coalesce(sum(total),0)::float AS s
    FROM gastos
    WHERE (revisado IS DISTINCT FROM false)
      AND EXTRACT(YEAR FROM fecha) = ${year} AND EXTRACT(MONTH FROM fecha) = ${month}
  `)
  const [band] = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS n FROM gastos WHERE revisado = false`)

  // Ingresos por piso (mes).
  const ingresos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "propertyId" AS propiedad, coalesce(sum(amount),0)::float AS s
    FROM incomes
    WHERE EXTRACT(YEAR FROM date) = ${year} AND EXTRACT(MONTH FROM date) = ${month}
    GROUP BY "propertyId"
  `)
  // Gastos por piso (mes), solo los que cuentan.
  const gastosPorPiso = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT propiedad, coalesce(sum(total),0)::float AS s
    FROM gastos
    WHERE (revisado IS DISTINCT FROM false)
      AND EXTRACT(YEAR FROM fecha) = ${year} AND EXTRACT(MONTH FROM fecha) = ${month}
    GROUP BY propiedad
  `)
  // Pisos reales (con smoobuId).
  const props = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, name FROM properties WHERE "smoobuId" IS NOT NULL ORDER BY name`)

  const ingMap = new Map(ingresos.map((r) => [r.propiedad, Number(r.s)]))
  const gasMap = new Map(gastosPorPiso.map((r) => [r.propiedad, Number(r.s)]))

  const pisos: PisoRentabilidad[] = props.map((p) => {
    const ing = ingMap.get(p.id) ?? 0
    const gas = gasMap.get(p.id) ?? 0
    return { propiedad: p.id, nombre: p.name, ingresos: ing, gastos: gas, neto: +(ing - gas).toFixed(2) }
  })

  const totalIngresos = +pisos.reduce((a, p) => a + p.ingresos, 0).toFixed(2)
  const totalGastos = +pisos.reduce((a, p) => a + p.gastos, 0).toFixed(2)

  return {
    year, month,
    gastosCount: Number(gtot?.n ?? 0),
    gastosSum: Number(gtot?.s ?? 0),
    bandejaCount: Number(band?.n ?? 0),
    faltan: await recurrentesQueFaltan(year, month),
    pisos,
    totalIngresos,
    totalGastos,
    totalNeto: +(totalIngresos - totalGastos).toFixed(2),
  }
}

const eur = (n: number) => `${n >= 0 ? '' : ''}${n.toFixed(0)}€`

export function construirMensaje(r: ResumenMensual): string {
  const cab = `📊 <b>${MESES[r.month]} ${r.year}</b>`
  const linGastos = `Gastos: ${r.gastosCount} · ${r.gastosSum.toFixed(0)}€${r.bandejaCount > 0 ? ` · ${r.bandejaCount} en bandeja` : ''}`
  const linFaltan = r.faltan.length
    ? `⏳ Falta: ${r.faltan.slice(0, 4).map((f) => f.proveedor || f.fingerprint).join(', ')}`
    : ''
  const pisos = r.pisos
    .map((p) => `• ${p.nombre}: <b>${p.neto >= 0 ? '+' : ''}${eur(p.neto)}</b> (ingr ${eur(p.ingresos)} − gastos ${eur(p.gastos)})`)
    .join('\n')
  const total = `Neto pisos: <b>${r.totalNeto >= 0 ? '+' : ''}${eur(r.totalNeto)}</b> (ingr ${eur(r.totalIngresos)} − gastos ${eur(r.totalGastos)})`
  return [cab, linGastos, linFaltan, '', '<b>Rentabilidad por piso</b>', pisos, total].filter(Boolean).join('\n')
}
