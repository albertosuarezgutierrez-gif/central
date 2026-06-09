import { prisma } from './db'
import { iaRestDb } from './iarest'

export type ResumenFinanciero = {
  ingresosYtd: number
  gastosYtd: number
  resultadoYtd: number
  disponible: boolean
  nota?: string
}

const NULO: ResumenFinanciero = { ingresosYtd: 0, gastosYtd: 0, resultadoYtd: 0, disponible: false }

export async function getResumenIalimp(empresaId: string, anio: number): Promise<ResumenFinanciero> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      ingresos_base: unknown; gastos_base: unknown; resultado: unknown
    }>>`
      SELECT
        COALESCE(SUM(ingresos_base), 0)::float AS ingresos_base,
        COALESCE(SUM(gastos_base),   0)::float AS gastos_base,
        COALESCE(SUM(resultado),     0)::float AS resultado
      FROM v_contab_pyg
      WHERE empresa_id = ${empresaId}::uuid
        AND anio = ${anio}
    `
    const r = rows[0]
    return {
      ingresosYtd: Number(r.ingresos_base),
      gastosYtd:   Number(r.gastos_base),
      resultadoYtd: Number(r.resultado),
      disponible: true,
    }
  } catch {
    return { ...NULO, nota: 'error al leer ialimp' }
  }
}

export async function getResumenSivra(anio: number, propertyId?: string | null): Promise<ResumenFinanciero> {
  try {
    const [ing, gas] = await Promise.all([
      propertyId
        ? prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
              AND "propertyId" = ${propertyId}
          `
        : prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM incomes
            WHERE EXTRACT(YEAR FROM date) = ${anio}
          `,
      propertyId
        ? prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM expenses
            WHERE EXTRACT(YEAR FROM date) = ${anio}
              AND "propertyId" = ${propertyId}
          `
        : prisma.$queryRaw<Array<{ total: unknown }>>`
            SELECT COALESCE(SUM(amount), 0)::float AS total
            FROM expenses
            WHERE EXTRACT(YEAR FROM date) = ${anio}
          `,
    ])
    const i = Number(ing[0].total)
    const g = Number(gas[0].total)
    return { ingresosYtd: i, gastosYtd: g, resultadoYtd: i - g, disponible: true }
  } catch {
    return { ...NULO, nota: 'error al leer sivra' }
  }
}

export async function getResumenIaRest(localId: string | null, anio: number): Promise<ResumenFinanciero> {
  if (!localId) return { ...NULO, nota: 'sin local vinculado' }
  try {
    const { data, error } = await iaRestDb()
      .from('v_resumen_financiero_anual')
      .select('ingresos_base, gastos_base, resultado')
      .eq('local_id', localId)
      .eq('anio', anio)
      .maybeSingle()
    if (error) throw error
    const r = data as { ingresos_base: number; gastos_base: number; resultado: number } | null
    return {
      ingresosYtd:  Number(r?.ingresos_base ?? 0),
      gastosYtd:    Number(r?.gastos_base ?? 0),
      resultadoYtd: Number(r?.resultado ?? 0),
      disponible: true,
    }
  } catch {
    return { ...NULO, nota: 'error al leer ia-rest' }
  }
}

export async function getResumenNegocio(
  app: string | null,
  refExt: string | null,
  anio: number,
): Promise<ResumenFinanciero> {
  if (app === 'ialimp' && refExt) return getResumenIalimp(refExt, anio)
  if (app === 'sivra') return getResumenSivra(anio, refExt)
  if (app === 'ia-rest' && refExt) return getResumenIaRest(refExt, anio)
  return NULO
}

export function fmtEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
