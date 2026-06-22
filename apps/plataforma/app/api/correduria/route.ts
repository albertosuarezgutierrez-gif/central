import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { detectarCompania, motivoSeguros } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || '') || new Date().getFullYear()

  const rows = await prisma.$queryRaw<Array<{
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    banco: string | null
    destino_confirmado: boolean | null
    importe: unknown
    mes: string
  }>>`
    SELECT mb.concepto, mb.concepto_normalizado, mb.contraparte, cb.banco,
           mb.destino_confirmado, mb.importe,
           to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND mb.destino = 'seguros'
      AND mb.importe > 0
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${año}
    ORDER BY mb.fecha_operacion
  `

  const matrix = new Map<string, Map<string, number>>()
  // "Pendiente de confirmar": movimientos que entraron a seguros POR DESCARTE (no por nombre de
  // aseguradora) y que el dueño aún no ha confirmado a mano. Es lo dudoso que conviene revisar.
  let pendiente = 0
  for (const r of rows) {
    const compania = detectarCompania(r.concepto ?? '', r.concepto_normalizado ?? '', r.contraparte ?? '')
    const mes = r.mes
    const importe = Number(r.importe)
    if (!matrix.has(compania)) matrix.set(compania, new Map())
    const mesMap = matrix.get(compania)!
    mesMap.set(mes, (mesMap.get(mes) ?? 0) + importe)

    const motivo = motivoSeguros(r.banco, r.concepto, r.contraparte)
    if (motivo === 'descarte' && !r.destino_confirmado) pendiente += importe
  }

  const filas: { compania: string; meses: Record<string, number>; total: number }[] = []
  for (const [compania, mesMap] of matrix.entries()) {
    const meses: Record<string, number> = {}
    let total = 0
    for (const [mes, importe] of mesMap.entries()) {
      meses[mes] = Math.round(importe * 100) / 100
      total += importe
    }
    filas.push({ compania, meses, total: Math.round(total * 100) / 100 })
  }
  filas.sort((a, b) => b.total - a.total)

  return NextResponse.json({ año, filas, pendiente: Math.round(pendiente * 100) / 100 })
}
