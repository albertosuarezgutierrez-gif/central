import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getGastosControl, type GastoMov } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

function esc(s: string) { return `"${(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"` }
function num(n: number) { return n.toFixed(2).replace('.', ',') }

// GET /api/finanzas/gastos/export?year=&quarter= — CSV "para la asesoría": gastos del periodo
// separados por bucket (actividad / renta / no deducible / amortizables), con columna de
// justificante (conciliado con factura archivada o FALTA).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const quarter = parseInt(searchParams.get('quarter') || '0') || 0

  const data = await getGastosControl(session.id, year, quarter)

  const lines: string[] = []
  const periodo = quarter === 0 ? String(year) : `Q${quarter} ${year}`
  lines.push(`CONTROL DE GASTOS — ${periodo}`)
  lines.push(`Generado el,${new Date().toLocaleDateString('es-ES')}`)
  lines.push('')

  const justif = (m: GastoMov) => m.conciliado || m.facturaRef ? `Sí${m.facturaRef ? ` (${m.facturaRef})` : ''}` : 'FALTA'
  const seccion = (titulo: string, movs: GastoMov[]) => {
    if (!movs.length) return
    lines.push(`=== ${titulo} ===`)
    lines.push('Fecha,Concepto,Banco,Importe,Justificante')
    let total = 0
    for (const m of movs) {
      total += m.importe
      lines.push(`${m.fecha ?? ''},${esc(m.concepto)},${esc(m.banco)},${num(m.importe)},${esc(justif(m))}`)
    }
    lines.push(`TOTAL,,,${num(total)},`)
    lines.push('')
  }

  const negocio = data.buckets.find(b => b.bucket === 'negocio')?.movs ?? []
  const renta = data.buckets.find(b => b.bucket === 'renta')?.movs ?? []
  const noDed = data.buckets.find(b => b.bucket === 'no_deducible')?.movs ?? []

  seccion('ACTIVIDAD ECONÓMICA — deducible (correduría)', negocio.filter(m => !m.amortizable))
  seccion('RENTA / PISOS — deducible', renta.filter(m => !m.amortizable))
  seccion('INVERSIONES A AMORTIZAR (mobiliario/obra/equipo — NO al 100% este año)', [...negocio, ...renta].filter(m => m.amortizable))
  seccion('GASTOS NO DEDUCIBLES (personal/familiar)', noDed)

  lines.push('=== RESUMEN ===')
  lines.push(`Gasto deducible del año,${num(data.resumen.deducibleTotal)}`)
  lines.push(`Inversiones a amortizar,${num(data.resumen.amortizablesTotal)}`)
  lines.push(`No deducible,${num(data.resumen.noDeducibleTotal)}`)
  lines.push(`Deducibles sin justificante (nº),${data.resumen.sinJustificante}`)

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gastos-${periodo.replace(/\s/g, '')}.csv"`,
    },
  })
}
