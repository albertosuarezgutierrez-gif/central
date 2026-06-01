export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { sesionAceptable } from '@/lib/session-sign'
import { createServerClient } from '@/lib/supabase'
import {
  calcularLiquidacionIVA, fechasPeriodo, trimestreActual,
  exportarA3, exportarSage, exportarHolded, exportarCSV,
} from '@/lib/contabilidad'

function serviceClient() {
  return createServerClient()
}

function getSession(req: NextRequest) {
  const raw = req.headers.get('x-asesoria-session')
  if (!raw) return null
  try { const p = JSON.parse(raw); if (!sesionAceptable(p, 'objeto')) return null; return (p) as { contable_id: string; restaurantes: { id: string; permisos: string[] }[] } }
  catch { return null }
}

function checkAcceso(session: ReturnType<typeof getSession>, rid: string, permiso: string): boolean {
  if (!session) return false
  const r = session.restaurantes.find(x => x.id === rid)
  return r ? r.permisos.includes(permiso) : false
}

/**
 * GET /api/asesoria/cliente/[id]?accion=resumen|iva|asientos&año=2026&trimestre=2&mes=2026-05
 * POST /api/asesoria/cliente/[id] body: { accion: 'exportar', formato, desde, hasta }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rid } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const accion = req.nextUrl.searchParams.get('accion') ?? 'resumen'

  if (accion === 'iva' && !checkAcceso(session, rid, 'ver_303'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  if (accion === 'resumen' && !checkAcceso(session, rid, 'ver_resumen'))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = serviceClient()

  // ── RESUMEN MES ────────────────────────────────────────────────────────────
  if (accion === 'resumen') {
    const mes = req.nextUrl.searchParams.get('mes') ?? new Date().toISOString().slice(0, 7)
    const [year, month] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const hasta = `${mes}-${new Date(year, month, 0).getDate().toString().padStart(2, '0')}`

    const [rArq, rComp] = await Promise.all([
      supabase.from('arqueos_caja').select('fecha, base_10, iva_10, base_21, iva_21, efectivo, tarjeta, bizum, num_tickets, ticket_medio').eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('facturas_compra').select('importe_total, importe_base, importe_iva').eq('restaurante_id', rid).gte('fecha_factura', desde).lte('fecha_factura', hasta),
    ])

    const arqueos = rArq.data ?? []
    const compras = rComp.data ?? []
    const base_ventas    = arqueos.reduce((s, a) => s + Number(a.base_10 ?? 0) + Number(a.base_21 ?? 0), 0)
    const iva_rep        = arqueos.reduce((s, a) => s + Number(a.iva_10 ?? 0) + Number(a.iva_21 ?? 0), 0)
    const gastos_compras = compras.reduce((s, c) => s + Number(c.importe_base ?? 0), 0)
    const iva_soportado  = compras.reduce((s, c) => s + Number(c.importe_iva ?? 0), 0)
    const r2 = (n: number) => Math.round(n * 100) / 100

    return NextResponse.json({
      ok: true, periodo: mes,
      kpis: {
        ingresos_brutos:  r2(base_ventas + iva_rep),
        base_ventas:      r2(base_ventas),
        iva_repercutido:  r2(iva_rep),
        gastos_compras:   r2(gastos_compras),
        iva_soportado:    r2(iva_soportado),
        resultado_bruto:  r2(base_ventas - gastos_compras),
        food_cost_pct:    base_ventas > 0 ? Math.round(gastos_compras / base_ventas * 1000) / 10 : 0,
        num_tickets:      arqueos.reduce((s, a) => s + (a.num_tickets ?? 0), 0),
      },
      evolucion: arqueos.map(a => ({ fecha: a.fecha, ventas: r2(Number(a.base_10 ?? 0) + Number(a.iva_10 ?? 0) + Number(a.base_21 ?? 0) + Number(a.iva_21 ?? 0)) })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    })
  }

  // ── IVA 303 ────────────────────────────────────────────────────────────────
  if (accion === 'iva') {
    const { year: yNow, trimestre: tNow } = trimestreActual()
    const año       = Number(req.nextUrl.searchParams.get('año')       ?? yNow)
    const trimestre = Number(req.nextUrl.searchParams.get('trimestre') ?? tNow) as 1 | 2 | 3 | 4
    const { desde, hasta, limite } = fechasPeriodo(año, trimestre)

    const [rArq, rComp] = await Promise.all([
      supabase.from('arqueos_caja').select('base_10, iva_10, base_21, iva_21, base_4, iva_4').eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('facturas_compra').select('importe_base, importe_iva, tipo_iva').eq('restaurante_id', rid).gte('fecha_factura', desde).lte('fecha_factura', hasta).not('importe_iva', 'is', null),
    ])

    const liq = calcularLiquidacionIVA({
      arqueos: (rArq.data ?? []) as Parameters<typeof calcularLiquidacionIVA>[0]['arqueos'],
      facturas_compra: (rComp.data ?? []).map(c => ({ importe_base: Number(c.importe_base ?? 0), importe_iva: Number(c.importe_iva ?? 0), tipo_iva: Number(c.tipo_iva ?? 21) })),
    })

    return NextResponse.json({
      ok: true,
      periodo: { año, trimestre, desde, hasta, limite },
      liquidacion: liq,
      resumen_texto: liq.cuota_diferencial > 0 ? `A INGRESAR: ${liq.cuota_diferencial.toFixed(2)} € — antes del ${limite}` : liq.cuota_diferencial < 0 ? `A COMPENSAR: ${Math.abs(liq.cuota_diferencial).toFixed(2)} €` : 'RESULTADO CERO',
    })
  }

  return NextResponse.json({ error: 'accion desconocida' }, { status: 400 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rid } = await params
  const session = getSession(req)
  if (!session || !checkAcceso(session, rid, 'exportar'))
    return NextResponse.json({ error: 'Sin permiso para exportar' }, { status: 403 })

  const { formato = 'csv', desde, hasta } = await req.json()
  if (!desde || !hasta) return NextResponse.json({ error: 'desde y hasta requeridos' }, { status: 400 })

  const supabase = serviceClient()
  const { data: asientos } = await supabase
    .from('asientos_contables')
    .select('num_asiento, fecha, concepto, tipo, lineas')
    .eq('restaurante_id', rid)
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: true }).order('num_asiento', { ascending: true })

  if (!asientos?.length) return NextResponse.json({ error: 'Sin asientos en ese período' }, { status: 404 })

  const exp = asientos.map(a => ({
    num_asiento: a.num_asiento, fecha: a.fecha, concepto: a.concepto, tipo: a.tipo,
    lineas: a.lineas as { cuenta: string; nombre_cuenta?: string; debe: number; haber: number; concepto?: string }[],
  }))

  const fechaHoy = new Date().toISOString().split('T')[0].replace(/-/g, '')
  let contenido: string, contentType: string, filename: string

  if (formato === 'a3') {
    contenido = exportarA3(exp); contentType = 'text/plain; charset=windows-1252'; filename = `SUENLACE_${fechaHoy}.DAT`
  } else if (formato === 'sage') {
    contenido = exportarSage(exp); contentType = 'text/csv; charset=utf-8'; filename = `sage_${fechaHoy}.csv`
  } else if (formato === 'holded') {
    contenido = exportarHolded(exp); contentType = 'text/csv; charset=utf-8'; filename = `holded_${fechaHoy}.csv`
  } else {
    contenido = exportarCSV(exp); contentType = 'text/csv; charset=utf-8'; filename = `asientos_${fechaHoy}.csv`
  }

  return new NextResponse(contenido, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Asientos': String(exp.length),
    },
  })
}
