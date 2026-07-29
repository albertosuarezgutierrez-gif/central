// ────────────────────────────────────────────────────────────────────────────
// Calibración con resultados REALES: lee las subastas concluidas con resultado
// capturado (`capturarResultados`) y delega el cálculo en el módulo puro.
// Con el corpus recién nacido devuelve [] — la UI simplemente no pinta nada.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { calibracionAdjudicaciones, type CalibracionZona } from '@central/module-subastas'

export async function calibracionResultados(): Promise<CalibracionZona[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT provincia, valor_subasta, importe_adjudicacion, resultado
    FROM subastas
    WHERE es_inmueble = true AND resultado IS NOT NULL
  `)
  return calibracionAdjudicaciones(
    filas.map((f) => ({
      provincia: f.provincia,
      valorSubasta: f.valor_subasta == null ? null : Number(f.valor_subasta),
      importeAdjudicacion: f.importe_adjudicacion == null ? null : Number(f.importe_adjudicacion),
      resultado: f.resultado,
    })),
  )
}
