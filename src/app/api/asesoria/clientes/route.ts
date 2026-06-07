export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { sesionAceptable } from '@/lib/session-sign'
import { createClient } from '@supabase/supabase-js'
import { trimestreActual, fechasPeriodo } from '@/lib/contabilidad'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getAsesoriaSession(req: NextRequest) {
  const raw = req.headers.get('x-asesoria-session')
  if (!raw) return null
  try { const p = JSON.parse(raw); if (!sesionAceptable(p, 'objeto')) return null; return (p) as { contable_id: string; nombre: string; restaurantes: { id: string; nombre: string; permisos: string[] }[] } }
  catch { return null }
}

/**
 * GET /api/asesoria/clientes
 * Devuelve resumen de todos los restaurantes cliente del contable.
 * Cada restaurante incluye: ventas mes, estado 303 trimestre actual, último arqueo.
 */
export async function GET(req: NextRequest) {
  const session = getAsesoriaSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = serviceClient()

  // Verificar que el contable existe y tiene acceso
  const { data: contable } = await supabase
    .from('contables')
    .select('id, activo')
    .eq('id', session.contable_id)
    .single()
  if (!contable?.activo) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })

  const { year, trimestre } = trimestreActual()
  const { desde, hasta, limite } = fechasPeriodo(year, trimestre)
  const mesActual = new Date().toISOString().slice(0, 7)
  const mesDesde  = `${mesActual}-01`
  const mesHasta  = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]

  const rids = session.restaurantes.map(r => r.id)
  if (!rids.length) return NextResponse.json({ clientes: [], totales: { ventas: 0, iva_pendiente: 0, num_restaurantes: 0 } })

  // Ventas del mes por restaurante
  const { data: arqueos } = await supabase
    .from('arqueos_caja')
    .select('local_id, base_10, iva_10, base_21, iva_21, fecha')
    .in('local_id', rids)
    .gte('fecha', mesDesde)
    .lte('fecha', mesHasta)

  // Estado 303 del trimestre por restaurante
  const { data: liqs } = await supabase
    .from('liquidaciones_iva')
    .select('local_id, cuota_diferencial, estado, fecha_limite')
    .in('local_id', rids)
    .eq('año', year)
    .eq('trimestre', trimestre)

  // Último arqueo por restaurante
  const { data: ultimos } = await supabase
    .from('arqueos_caja')
    .select('local_id, fecha, estado')
    .in('local_id', rids)
    .order('fecha', { ascending: false })

  // Facturas de compra pendientes de revisar
  const { data: facturasPendientes } = await supabase
    .from('facturas_compra')
    .select('local_id')
    .in('local_id', rids)
    .in('match_estado', ['diferencia_leve', 'diferencia_grave'])

  // Construir respuesta por restaurante
  const clientes = session.restaurantes.map(r => {
    const arq = (arqueos ?? []).filter(a => a.local_id === r.id)
    const ventas_mes = arq.reduce((s, a) => s + Number(a.base_10 ?? 0) + Number(a.iva_10 ?? 0) + Number(a.base_21 ?? 0) + Number(a.iva_21 ?? 0), 0)
    const base_mes   = arq.reduce((s, a) => s + Number(a.base_10 ?? 0) + Number(a.base_21 ?? 0), 0)
    const iva_rep    = arq.reduce((s, a) => s + Number(a.iva_10 ?? 0) + Number(a.iva_21 ?? 0), 0)

    const liq = (liqs ?? []).find(l => l.local_id === r.id)
    const ultimo = (ultimos ?? []).find(u => u.local_id === r.id)
    const pendientes = (facturasPendientes ?? []).filter(f => f.local_id === r.id).length

    return {
      ...r,
      ventas_mes:     Math.round(ventas_mes  * 100) / 100,
      base_mes:       Math.round(base_mes    * 100) / 100,
      iva_repercutido: Math.round(iva_rep    * 100) / 100,
      dias_con_cierre: arq.length,
      iva_303: liq ? {
        cuota_diferencial: Number(liq.cuota_diferencial),
        estado:            liq.estado,
        fecha_limite:      liq.fecha_limite ?? limite,
      } : null,
      ultimo_arqueo: ultimo?.fecha ?? null,
      facturas_revisar: pendientes,
      alertas: [
        ...(pendientes > 0 ? [`${pendientes} factura${pendientes > 1 ? 's' : ''} con diferencia`] : []),
        ...(!liq ? [`303 T${trimestre} sin calcular`] : []),
        ...(liq?.estado === 'calculado' && Number(liq.cuota_diferencial) > 0 ? [`303 pendiente presentar — ${Number(liq.cuota_diferencial).toFixed(2)} €`] : []),
      ],
    }
  })

  const totales = {
    ventas_mes:       Math.round(clientes.reduce((s, c) => s + c.ventas_mes, 0) * 100) / 100,
    iva_pendiente:    Math.round(clientes.reduce((s, c) => s + (c.iva_303?.cuota_diferencial ?? 0), 0) * 100) / 100,
    num_restaurantes: clientes.length,
    total_alertas:    clientes.reduce((s, c) => s + c.alertas.length, 0),
  }

  return NextResponse.json({ ok: true, clientes, totales, periodo: { mes: mesActual, trimestre, año: year, desde, hasta, limite } })
}
