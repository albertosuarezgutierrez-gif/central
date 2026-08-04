// ────────────────────────────────────────────────────────────────────────────
// Rentabilidad turística con los datos PROPIOS: cuánto rinde al año un
// dormitorio en los pisos reales de Alberto (tabla `incomes`, neto, últimos 12
// meses). Es la métrica disponible: sus pisos no tienen m² registrados, sí
// dormitorios. Nadie más puede calcular esto porque nadie más tiene su
// histórico. SIEMPRE es una estimación marcada como tal: sus pisos son de
// Sevilla capital y turísticos — aplicarlo a otra zona es extrapolar.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export interface IngresoDormitorio {
  /** Mediana de € netos/año por dormitorio entre los pisos. */
  porDormitorio: number
  pisos: number
}

/**
 * Mediana entre pisos (no media): un piso atípico —el Dúplex rinde el doble
 * por dormitorio que el Luxury— no debe arrastrar la referencia.
 */
export async function ingresoPorDormitorio(): Promise<IngresoDormitorio | null> {
  const filas = await prisma.$queryRaw<Array<{ por_dormitorio: number }>>(Prisma.sql`
    SELECT (SUM(i.amount) / NULLIF(p.bedrooms, 0))::float8 AS por_dormitorio
    FROM incomes i
    JOIN properties p ON p.id = i."propertyId"
    WHERE i."checkOut" >= now() - interval '12 months'
      AND i."checkOut" < now()
    GROUP BY i."propertyId", p.bedrooms
    HAVING SUM(i.amount) > 0 AND p.bedrooms > 0
  `)
  const valores = filas.map((f) => Number(f.por_dormitorio)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (valores.length < 2) return null
  const mitad = Math.floor(valores.length / 2)
  const mediana = valores.length % 2 ? valores[mitad] : (valores[mitad - 1] + valores[mitad]) / 2
  return { porDormitorio: Math.round(mediana), pisos: valores.length }
}
