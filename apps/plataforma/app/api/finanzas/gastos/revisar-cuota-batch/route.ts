import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { detectarDeduccionCuotaTipo } from '@/lib/categorizar'
import { claveReferencia, claveComercio } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

// POST /api/finanzas/gastos/revisar-cuota-batch
// Barre todos los movimientos personales del año sin deduccion_cuota_tipo y aplica:
// 1. Reglas aprendidas en banca_destino_reglas.deduccion_cuota_tipo
// 2. Patrones heurísticos de detectarDeduccionCuotaTipo
// Devuelve { tagged: número de movimientos etiquetados }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const year = new Date().getFullYear()
  const inicio = `${year}-01-01`
  const fin = `${year}-12-31`

  // Traer movimientos personales sin tipo asignado
  const movs = await prisma.$queryRaw<Array<{
    id: string; concepto: string | null; concepto_normalizado: string | null; contraparte: string | null
  }>>`
    SELECT mb.id, mb.concepto, mb.concepto_normalizado, mb.contraparte
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND mb.destino = 'personal'
      AND mb.deduccion_cuota_tipo IS NULL
      AND mb.importe < 0
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
  `

  // Traer reglas aprendidas
  const reglas = await prisma.$queryRaw<{ clave: string; deduccion_cuota_tipo: string }[]>`
    SELECT clave, deduccion_cuota_tipo
    FROM banca_destino_reglas
    WHERE cuenta_id = ${session.id}::uuid
      AND deduccion_cuota_tipo IS NOT NULL
  `
  const reglaMap = new Map<string, string>(reglas.map(r => [r.clave, r.deduccion_cuota_tipo]))

  let tagged = 0
  for (const mov of movs) {
    const concepto = mov.concepto_normalizado || mov.concepto || ''

    // 1. Regla aprendida por clave
    const clave = claveReferencia(concepto) ?? claveComercio(concepto)
    let tipo: string | null = clave ? (reglaMap.get(clave) ?? null) : null

    // 2. Heurística si no hay regla
    if (!tipo) {
      tipo = detectarDeduccionCuotaTipo(concepto, mov.contraparte)
    }

    if (tipo) {
      await prisma.$executeRaw`
        UPDATE movimientos_bancarios SET deduccion_cuota_tipo = ${tipo}
        WHERE id = ${mov.id}::uuid AND deduccion_cuota_tipo IS NULL
      `
      tagged++
    }
  }

  // Sincronizar fiscal_perfil si se etiquetó algo
  if (tagged > 0) {
    const totales = await prisma.$queryRaw<{ tipo: string; total: unknown }[]>`
      SELECT mb.deduccion_cuota_tipo AS tipo, SUM(ABS(mb.importe)) AS total
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.deduccion_cuota_tipo IS NOT NULL
        AND mb.importe < 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      GROUP BY mb.deduccion_cuota_tipo
    `
    const t: Record<string, number> = {}
    for (const r of totales) t[r.tipo] = Number(r.total)
    await prisma.$executeRaw`
      INSERT INTO fiscal_perfil (cuenta_id, donativos_anual, gasto_guarderia_anual, gasto_deportivo_anual)
      VALUES (${session.id}::uuid, ${t.mecenazgo ?? 0}, ${t.guarderia ?? 0}, ${t.deportiva_and ?? 0})
      ON CONFLICT (cuenta_id) DO UPDATE SET
        donativos_anual       = EXCLUDED.donativos_anual,
        gasto_guarderia_anual = EXCLUDED.gasto_guarderia_anual,
        gasto_deportivo_anual = EXCLUDED.gasto_deportivo_anual
    `
  }

  return NextResponse.json({ tagged, total: movs.length })
}
