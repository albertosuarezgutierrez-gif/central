export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { sesionAceptable } from '@/lib/session-sign'
import { createServerClient } from '@/lib/supabase'

function sc() {
  return createServerClient()
}
function getSession(req: NextRequest) {
  const raw = req.headers.get('x-almacen-session')
  if (!raw) return null
  try { const p = JSON.parse(raw); if (!sesionAceptable(p, 'objeto')) return null; return (p) as { contable_id: string; restaurantes: { id: string; nombre: string; ciudad?: string; permisos: string[] }[] } }
  catch { return null }
}

/**
 * GET /api/almacen-central/grupo
 * Devuelve KPIs de almacén para todos los restaurantes del gestor:
 * artículos críticos, valor stock, pedidos pendientes, última recepción.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = sc()
  const rids = session.restaurantes.map(r => r.id)
  if (!rids.length) return NextResponse.json({ grupo: [], totales: { criticos: 0, valor_total: 0, pedidos_pendientes: 0 } })

  const [rCritico, rPedidos, rRecepciones, rStock] = await Promise.all([
    // Artículos bajo mínimo por restaurante
    supabase.from('v_stock_critico_grupo').select('*').in('local_id', rids),

    // Pedidos pendientes
    supabase.from('v_pedidos_pendientes_grupo').select('*').in('local_id', rids),

    // Última recepción por restaurante
    supabase.from('recepciones_mercancia')
      .select('local_id, fecha_recepcion, estado')
      .in('local_id', rids)
      .order('fecha_recepcion', { ascending: false }),

    // Top artículos más críticos del grupo (para el panel central)
    supabase.from('stock_articulos')
      .select('local_id, nombre, stock_actual, stock_minimo, unidad_compra, proveedor_nombre, proveedor_id')
      .in('local_id', rids)
      .eq('activo', true)
      .lte('stock_actual', supabase.rpc as unknown as number) // workaround — usar filter
      .order('stock_actual', { ascending: true })
      .limit(50),
  ])

  // Artículos bajo mínimo del grupo (directo sin vista)
  const { data: articulosCriticos } = await supabase
    .from('stock_articulos')
    .select('local_id, nombre, stock_actual, stock_minimo, unidad_compra, proveedor_nombre, proveedor_id, precio_ultimo_compra, coste_unitario')
    .in('local_id', rids)
    .eq('activo', true)
    .filter('stock_actual', 'lte', supabase.from as unknown as string)

  // Query limpia para artículos críticos
  const { data: criticos } = await supabase.rpc
    ? await supabase
        .from('stock_articulos')
        .select('id, local_id, nombre, stock_actual, stock_minimo, unidad_compra, proveedor_nombre, proveedor_id, precio_ultimo_compra, coste_unitario')
        .in('local_id', rids)
        .eq('activo', true)
    : { data: [] }

  // Filtrar en JS (stock_actual <= stock_minimo)
  const articulos_criticos_lista = (criticos ?? [])
    .filter(a => Number(a.stock_actual) <= Number(a.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual))

  // Última recepción por restaurante
  const ultimasRecepciones: Record<string, string | null> = {}
  for (const rid of rids) {
    const rec = (rRecepciones.data ?? []).find(r => r.local_id === rid)
    ultimasRecepciones[rid] = rec?.fecha_recepcion ?? null
  }

  // Construir respuesta por restaurante
  const grupo = session.restaurantes.map(r => {
    const critico  = (rCritico.data  ?? []).find(x => x.local_id === r.id)
    const pedidos  = (rPedidos.data  ?? []).find(x => x.local_id === r.id)
    const artCrit  = articulos_criticos_lista.filter(a => a.local_id === r.id)

    return {
      ...r,
      articulos_criticos:  Number(critico?.articulos_criticos  ?? 0),
      articulos_agotados:  Number(critico?.articulos_agotados  ?? 0),
      valor_stock_eur:     Math.round(Number(critico?.valor_stock_eur ?? 0) * 100) / 100,
      pedidos_pendientes:  Number(pedidos?.pedidos_pendientes  ?? 0),
      pedidos_enviados:    Number(pedidos?.pedidos_enviados    ?? 0),
      esperando_asn:       Number(pedidos?.esperando_asn       ?? 0),
      ultima_recepcion:    ultimasRecepciones[r.id] ?? null,
      top_criticos:        artCrit.slice(0, 5).map(a => ({
        nombre:       a.nombre,
        stock_actual: Number(a.stock_actual),
        stock_minimo: Number(a.stock_minimo),
        unidad:       a.unidad_compra,
        proveedor:    a.proveedor_nombre ?? null,
        proveedor_id: a.proveedor_id ?? null,
      })),
      alertas: [
        ...(Number(critico?.articulos_agotados ?? 0) > 0 ? [`${critico!.articulos_agotados} artículo${Number(critico!.articulos_agotados) > 1 ? 's' : ''} agotado${Number(critico!.articulos_agotados) > 1 ? 's' : ''}`] : []),
        ...(Number(critico?.articulos_criticos ?? 0) > 0 ? [`${critico!.articulos_criticos} bajo mínimo`] : []),
        ...(Number(pedidos?.esperando_asn ?? 0) > 0 ? [`${pedidos!.esperando_asn} pedido${Number(pedidos!.esperando_asn) > 1 ? 's' : ''} sin ASN`] : []),
      ],
    }
  })

  // Artículos comunes críticos en varios locales (para pedido grupal)
  const artPorNombre: Record<string, { nombre: string; locales: string[]; total_necesario: number; proveedor_nombre?: string | null; proveedor_id?: string | null }> = {}
  for (const a of articulos_criticos_lista) {
    const key = a.nombre.toLowerCase().trim()
    if (!artPorNombre[key]) {
      artPorNombre[key] = { nombre: a.nombre, locales: [], total_necesario: 0, proveedor_nombre: a.proveedor_nombre, proveedor_id: a.proveedor_id }
    }
    artPorNombre[key].locales.push(a.local_id)
    artPorNombre[key].total_necesario += Math.max(0, Number(a.stock_minimo) - Number(a.stock_actual))
  }
  const oportunidades_grupal = Object.values(artPorNombre)
    .filter(x => x.locales.length > 1)
    .sort((a, b) => b.locales.length - a.locales.length)
    .slice(0, 10)

  const totales = {
    criticos:          grupo.reduce((s, r) => s + r.articulos_criticos, 0),
    agotados:          grupo.reduce((s, r) => s + r.articulos_agotados, 0),
    valor_total:       Math.round(grupo.reduce((s, r) => s + r.valor_stock_eur, 0) * 100) / 100,
    pedidos_pendientes:grupo.reduce((s, r) => s + r.pedidos_pendientes, 0),
    num_restaurantes:  grupo.length,
  }

  return NextResponse.json({ ok: true, grupo, totales, oportunidades_grupal })
}
