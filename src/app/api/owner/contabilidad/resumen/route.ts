export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/contabilidad/resumen?mes=2026-05
 * Devuelve el P&L del mes: ingresos, gastos, resultado, IVA pendiente, evolución.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const mes = req.nextUrl.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
  const [year, month] = mes.split('-').map(Number)
  const desde = `${mes}-01`
  const hasta = `${mes}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`

  const [rArqueos, rCompras, rOrdenes, rLiqIva] = await Promise.all([
    supabase.from('arqueos_caja')
      .select('fecha, total_ventas, base_10, iva_10, base_21, iva_21, efectivo, tarjeta, bizum, num_tickets, ticket_medio')
      .eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('facturas_compra')
      .select('importe_total, importe_base, importe_iva, proveedor_nombre, fecha_factura')
      .eq('restaurante_id', rid).gte('fecha_factura', desde).lte('fecha_factura', hasta),
    supabase.from('ordenes_pago_proveedor')
      .select('importe, estado')
      .eq('restaurante_id', rid).gte('created_at', `${desde}T00:00:00`).lte('created_at', `${hasta}T23:59:59`),
    supabase.from('liquidaciones_iva')
      .select('cuota_diferencial, estado, fecha_limite')
      .eq('restaurante_id', rid).eq('año', year).lte('trimestre', Math.ceil(month / 3)),
  ])

  const arqueos = rArqueos.data ?? []
  const compras = rCompras.data ?? []
  const ordenes = rOrdenes.data ?? []

  const ingresos_brutos = arqueos.reduce((s, a) => s + Number(a.total_ventas ?? 0), 0)
  const base_ventas     = arqueos.reduce((s, a) => s + Number(a.base_10 ?? 0) + Number(a.base_21 ?? 0), 0)
  const iva_repercutido = arqueos.reduce((s, a) => s + Number(a.iva_10 ?? 0) + Number(a.iva_21 ?? 0), 0)
  const gastos_compras  = compras.reduce((s, c) => s + Number(c.importe_base ?? 0), 0)
  const iva_soportado   = compras.reduce((s, c) => s + Number(c.importe_iva ?? 0), 0)
  const resultado_bruto = base_ventas - gastos_compras

  const food_cost_pct = base_ventas > 0 ? Math.round(gastos_compras / base_ventas * 1000) / 10 : 0
  const ticket_medio  = arqueos.reduce((s, a) => s + Number(a.ticket_medio ?? 0), 0) / (arqueos.length || 1)
  const num_tickets   = arqueos.reduce((s, a) => s + (a.num_tickets ?? 0), 0)

  // Evolución diaria de ventas del mes
  const evolucion_diaria = arqueos.map(a => ({
    fecha: a.fecha,
    ventas: Number(a.total_ventas ?? 0),
    tickets: a.num_tickets ?? 0,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))

  // IVA pendiente de pagar (último trimestre calculado)
  const liqs = rLiqIva.data ?? []
  const ultima_liq = liqs.at(-1)
  const iva_pendiente = (ultima_liq?.cuota_diferencial ?? 0) > 0 ? ultima_liq!.cuota_diferencial : 0

  // Cobros por canal
  const cobros = {
    efectivo: arqueos.reduce((s, a) => s + Number(a.efectivo ?? 0), 0),
    tarjeta:  arqueos.reduce((s, a) => s + Number(a.tarjeta  ?? 0), 0),
    bizum:    arqueos.reduce((s, a) => s + Number(a.bizum    ?? 0), 0),
  }

  return NextResponse.json({
    ok: true,
    periodo: { mes, desde, hasta },
    kpis: {
      ingresos_brutos:  Math.round(ingresos_brutos  * 100) / 100,
      base_ventas:      Math.round(base_ventas       * 100) / 100,
      iva_repercutido:  Math.round(iva_repercutido   * 100) / 100,
      gastos_compras:   Math.round(gastos_compras    * 100) / 100,
      iva_soportado:    Math.round(iva_soportado     * 100) / 100,
      resultado_bruto:  Math.round(resultado_bruto   * 100) / 100,
      iva_pendiente:    Math.round(Number(iva_pendiente) * 100) / 100,
      food_cost_pct,
      ticket_medio:     Math.round(ticket_medio      * 100) / 100,
      num_tickets,
    },
    cobros,
    evolucion_diaria,
    dias_con_cierre: arqueos.length,
    ultima_liquidacion_iva: ultima_liq ?? null,
  })
}
