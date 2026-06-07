export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { calcularLiquidacionIVA, fechasPeriodo, trimestreActual } from '@/lib/contabilidad'

/**
 * GET /api/owner/contabilidad/iva?año=2026&trimestre=2
 * Calcula la liquidación IVA del trimestre desde arqueos + facturas_compra.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { year: yearNow, trimestre: trimNow } = trimestreActual()
  const año       = Number(req.nextUrl.searchParams.get('año')       ?? yearNow)
  const trimestre = Number(req.nextUrl.searchParams.get('trimestre') ?? trimNow) as 1 | 2 | 3 | 4

  const { desde, hasta, limite } = fechasPeriodo(año, trimestre)

  // 1. Arqueos del período
  const { data: arqueos } = await supabase
    .from('arqueos_caja')
    .select('base_10, iva_10, base_21, iva_21, base_4, iva_4')
    .eq('local_id', rid)
    .gte('fecha', desde)
    .lte('fecha', hasta)

  // 2. Facturas de compra del período (IVA soportado)
  const { data: compras } = await supabase
    .from('facturas_compra')
    .select('importe_base, importe_iva, tipo_iva')
    .eq('local_id', rid)
    .gte('fecha_factura', desde)
    .lte('fecha_factura', hasta)
    .not('importe_iva', 'is', null)

  // 3. Compensación del trimestre anterior (si existe)
  const trimAnterior = trimestre === 1 ? 4 : trimestre - 1
  const añoAnterior  = trimestre === 1 ? año - 1 : año
  const { data: liqAnterior } = await supabase
    .from('liquidaciones_iva')
    .select('cuota_diferencial')
    .eq('local_id', rid)
    .eq('año', añoAnterior)
    .eq('trimestre', trimAnterior)
    .maybeSingle()

  const compensacion = (liqAnterior?.cuota_diferencial ?? 0) < 0
    ? Math.abs(liqAnterior!.cuota_diferencial)
    : 0

  const liq = calcularLiquidacionIVA({
    arqueos:        (arqueos ?? []) as Parameters<typeof calcularLiquidacionIVA>[0]['arqueos'],
    facturas_compra:(compras ?? []).map(c => ({
      importe_base: Number(c.importe_base ?? 0),
      importe_iva:  Number(c.importe_iva  ?? 0),
      tipo_iva:     Number(c.tipo_iva     ?? 21),
    })),
    compensacion_anterior: compensacion,
  })

  // 4. Upsert liquidación en BD
  await supabase.from('liquidaciones_iva').upsert({
    restaurante_id: rid,
    año, trimestre,
    ...liq,
    fecha_limite: limite,
    estado: 'calculado',
    datos_303: { arqueos: arqueos?.length ?? 0, facturas_compra: compras?.length ?? 0, periodo: `${desde} → ${hasta}` },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurante_id,año,trimestre' })

  return NextResponse.json({
    ok: true,
    periodo: { año, trimestre, desde, hasta, limite },
    liquidacion: liq,
    casillas_303: {
      '01': liq.base_rep_4,  '02': liq.cuota_rep_4,
      '04': liq.base_rep_10, '05': liq.cuota_rep_10,
      '07': liq.base_rep_21, '08': liq.cuota_rep_21,
      '27': liq.total_rep,
      '28': liq.base_sop_10, '29': liq.cuota_sop_10,
      '30': liq.base_sop_21, '31': liq.cuota_sop_21,
      '45': liq.total_sop,
      '46': liq.resultado,
      '69': liq.compensacion_anterior,
      '71': liq.cuota_diferencial,
    },
    resumen_texto: liq.cuota_diferencial > 0
      ? `A INGRESAR: ${liq.cuota_diferencial.toFixed(2)} € — antes del ${limite}`
      : liq.cuota_diferencial < 0
      ? `A COMPENSAR: ${Math.abs(liq.cuota_diferencial).toFixed(2)} €`
      : 'RESULTADO CERO',
  })
}

/** PATCH — marcar como presentado */
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { año, trimestre, estado, fecha_presentacion, importe_ingresado } = await req.json()

  const { error } = await supabase.from('liquidaciones_iva')
    .update({ estado, fecha_presentacion, importe_ingresado, updated_at: new Date().toISOString() })
    .eq('local_id', rid).eq('año', año).eq('trimestre', trimestre)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
