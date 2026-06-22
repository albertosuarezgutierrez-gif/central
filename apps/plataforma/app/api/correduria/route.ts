import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

function detectarCompania(concepto: string, conceptoNorm: string, contraparte: string): string {
  const txt = `${concepto} ${conceptoNorm} ${contraparte}`.toUpperCase()
  if (txt.includes('GENERALI')) return 'Generali'
  if (txt.includes('ALLIANZ')) return 'Allianz'
  if (txt.includes('MAPFRE') || /LIQ\.COMISIONES|LIQ\. COMISIONES/.test(txt)) return 'Mapfre'
  if (txt.includes('CASER') || txt.includes('FRA-COMIS')) return 'Caser'
  if (/\bAXA\b/.test(txt) || /LIQ\.?\s*SALDO CUENTA/.test(txt)) return 'AXA'
  if (txt.includes('ZURICH')) return 'Zürich'
  if (txt.includes('REALE') || /LIQUIDACION DE COMISIONES/.test(txt)) return 'Reale'
  if (txt.includes('MUTUA')) return 'Mutua'
  if (txt.includes('LINEA DIRECTA') || txt.includes('LÍNEA DIRECTA')) return 'Línea Directa'
  if (txt.includes('OCCIDENT') || txt.includes('CATALANA') || txt.includes('M00171') || txt.includes('8/92361')) return 'Occident'
  if (txt.includes('HELVETIA')) return 'Helvetia'
  if (txt.includes('PELAYO') || /^COMISIONES /.test(txt)) return 'Pelayo'
  if (txt.includes('LIBERTY')) return 'Liberty'
  if (txt.includes('PLUS ULTRA')) return 'Plus Ultra'
  if (txt.includes('SANITAS') || txt.includes('ADESLAS') || txt.includes('DKV') || txt.includes('ASISA')) return 'Salud'
  if (txt.includes('REMSALDO')) return 'Aegon'
  if (/PAGO SALDO CTA/.test(txt)) return 'Generali'
  return 'Otras'
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || '') || new Date().getFullYear()

  const rows = await prisma.$queryRaw<Array<{
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    importe: unknown
    mes: string
  }>>`
    SELECT mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.importe,
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
  for (const r of rows) {
    const compania = detectarCompania(r.concepto ?? '', r.concepto_normalizado ?? '', r.contraparte ?? '')
    const mes = r.mes
    const importe = Number(r.importe)
    if (!matrix.has(compania)) matrix.set(compania, new Map())
    const mesMap = matrix.get(compania)!
    mesMap.set(mes, (mesMap.get(mes) ?? 0) + importe)
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

  return NextResponse.json({ año, filas })
}
