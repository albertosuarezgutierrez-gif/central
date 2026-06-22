import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenFinanciero } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

const RETENCION = 0.15

function esc(s: string) { return `"${s.replace(/"/g, '""')}"` }
function num(n: number) { return n.toFixed(2).replace('.', ',') }
function date(d: Date | null) { return d?.toISOString().slice(0, 10) ?? '' }

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  const rows = await prisma.$queryRaw<Array<{
    fecha_operacion: Date | null
    concepto: string | null
    concepto_normalizado: string | null
    contraparte: string | null
    categoria: string | null
    destino: string | null
    importe: unknown
    banco: string | null
    sociedad: string
  }>>`
    SELECT mb.fecha_operacion, mb.concepto, mb.concepto_normalizado, mb.contraparte,
           mb.categoria, mb.destino, mb.importe, cb.banco,
           s.nombre AS sociedad
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
    ORDER BY mb.destino, mb.fecha_operacion ASC NULLS LAST
  `

  const lines: string[] = []
  lines.push(`INFORME PARA GESTORÍA — AÑO ${year}`)
  lines.push(`Generado el,${new Date().toLocaleDateString('es-ES')}`)
  lines.push('')

  // ── Sección 1: Correduría ────────────────────────────────────────────────────
  const corrRows = rows.filter(r => r.destino === 'seguros' && Number(r.importe) > 0)
  const corrGastos = rows.filter(r => r.destino === 'seguros' && Number(r.importe) < 0)

  lines.push('=== CORREDURÍA DE SEGUROS (Actividad económica — Retención 15%) ===')
  lines.push('Fecha,Concepto,Importe neto cobrado,Retención (15%),Bruto declarar')
  let corrNetTotal = 0, corrBrutoTotal = 0, corrRetTotal = 0
  for (const r of corrRows) {
    const neto = Number(r.importe)
    const bruto = neto / (1 - RETENCION)
    const ret = bruto * RETENCION
    corrNetTotal += neto; corrBrutoTotal += bruto; corrRetTotal += ret
    const concepto = esc((r.concepto_normalizado || r.concepto || r.contraparte || '').replace(/\n/g, ' '))
    lines.push(`${date(r.fecha_operacion)},${concepto},${num(neto)},${num(ret)},${num(bruto)}`)
  }
  lines.push(`TOTAL INGRESOS,,${num(corrNetTotal)},${num(corrRetTotal)},${num(corrBrutoTotal)}`)
  lines.push('')

  if (corrGastos.length) {
    lines.push('Gastos actividad correduría:')
    lines.push('Fecha,Concepto,Importe,Categoría,Deducible')
    let corrGasTotal = 0
    for (const r of corrGastos) {
      const imp = Math.abs(Number(r.importe))
      corrGasTotal += imp
      const concepto = esc((r.concepto_normalizado || r.concepto || r.contraparte || '').replace(/\n/g, ' '))
      lines.push(`${date(r.fecha_operacion)},${concepto},${num(imp)},${esc(r.categoria ?? '')},Sí`)
    }
    lines.push(`TOTAL GASTOS,,,${num(corrGasTotal)},`)
    lines.push('')
  }

  // ── Sección 2: Pisos turísticos ──────────────────────────────────────────────
  const pisosRows = rows.filter(r => r.destino === 'turistico_pisos' || r.destino === 'turistico_duplex')
  if (pisosRows.length) {
    lines.push('=== PISOS TURÍSTICOS (Capital inmobiliario) ===')
    lines.push('Fecha,Concepto,Banco / Propiedad,Importe,Tipo')
    let pisosIngTotal = 0, pisosGasTotal = 0
    for (const r of pisosRows) {
      const imp = Number(r.importe)
      const tipo = imp >= 0 ? 'Ingreso' : 'Gasto'
      if (imp >= 0) pisosIngTotal += imp; else pisosGasTotal += Math.abs(imp)
      const concepto = esc((r.concepto_normalizado || r.concepto || r.contraparte || '').replace(/\n/g, ' '))
      const banco = r.destino === 'turistico_duplex' ? 'BBVA — Duplex' : 'Kutxa — 3 pisos'
      lines.push(`${date(r.fecha_operacion)},${concepto},${esc(banco)},${num(Math.abs(imp))},${tipo}`)
    }
    lines.push(`TOTAL INGRESOS,,,${num(pisosIngTotal)},Ingreso`)
    lines.push(`TOTAL GASTOS,,,${num(pisosGasTotal)},Gasto`)
    lines.push(`RESULTADO NETO,,,${num(pisosIngTotal - pisosGasTotal)},`)
    lines.push('')
  }

  // ── Sección 3: Gastos personales ─────────────────────────────────────────────
  const persRows = rows.filter(r => (r.destino ?? 'personal') === 'personal' && Number(r.importe) < 0)
  if (persRows.length) {
    lines.push('=== GASTOS PERSONALES ===')
    lines.push('Fecha,Concepto,Banco,Categoría,Importe')
    let persTotal = 0
    for (const r of persRows) {
      const imp = Math.abs(Number(r.importe))
      persTotal += imp
      const concepto = esc((r.concepto_normalizado || r.concepto || r.contraparte || '').replace(/\n/g, ' '))
      lines.push(`${date(r.fecha_operacion)},${concepto},${esc(r.banco ?? '')},${esc(r.categoria ?? 'otros')},${num(imp)}`)
    }
    lines.push(`TOTAL,,,, ${num(persTotal)}`)
    lines.push('')
  }

  // ── Sección 4: Resumen fiscal ─────────────────────────────────────────────────
  try {
    const resumen = await getResumenFinanciero(session.id, year, 0)
    const r = resumen.deducciones.resultado
    lines.push('=== RESUMEN FISCAL ESTIMADO ===')
    lines.push('Concepto,Importe,Nota')
    lines.push(`Ingresos brutos correduría,${num(resumen.correduria.ingresosBrutos)},Neto cobrado / (1-0.15)`)
    lines.push(`Gastos deducibles correduría,${num(resumen.correduria.gastosDeducibles)},`)
    lines.push(`Ingresos pisos,${num(resumen.pisos.total.ingresos)},`)
    lines.push(`Gastos pisos,${num(resumen.pisos.total.gastos)},`)
    lines.push(`Reducción declaración conjunta,${num(resumen.fiscal.reduccionConjunta)},`)
    lines.push(`Base imponible estimada,${num(resumen.fiscal.baseImponibleEstimada)},Orientativo`)
    lines.push('')
    lines.push(`Mínimo personal y familiar,${num(r.minimoPersonalYFamiliar)},`)
    lines.push(`Cuota íntegra (tras mínimos),${num(r.cuotaIntegra)},`)
    for (const dd of r.deducciones) {
      lines.push(`${esc(dd.concepto)},${num(dd.importe)},${dd.ambito}`)
    }
    lines.push(`Retenciones ya pagadas,${num(r.retenciones)},`)
    lines.push(`Resultado (${r.resultado <= 0 ? 'a devolver' : 'a pagar'}),${num(Math.abs(r.resultado))},`)
  } catch (e) {
    console.error('[finanzas/export] deducciones', e)
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gestoria-${year}.csv"`,
    },
  })
}
