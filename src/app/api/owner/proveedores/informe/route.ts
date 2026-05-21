export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/owner/proveedores/informe?proveedor_id=uuid&dias=90
 * Devuelve informe completo de incidencias + estadísticas de un proveedor.
 * Usado en la ficha del proveedor y para la reunión mensual.
 */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const provId = req.nextUrl.searchParams.get('proveedor_id')
  const dias   = parseInt(req.nextUrl.searchParams.get('dias') ?? '90')
  if (!provId) return NextResponse.json({ error: 'proveedor_id requerido' }, { status: 400 })

  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [rProv, rInc, rPedidos, rRecepciones] = await Promise.all([
    // Datos del proveedor
    supabase.from('proveedores').select('*').eq('id', provId).eq('restaurante_id', rid).single(),

    // Incidencias registradas
    supabase
      .from('incidencias_proveedor')
      .select('*')
      .eq('restaurante_id', rid)
      .eq('proveedor_id', provId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false }),

    // Pedidos enviados
    supabase
      .from('pedidos_proveedor')
      .select('id, created_at, enviado_at, estado, cantidad, unidad_compra, stock_articulos(nombre)')
      .eq('restaurante_id', rid)
      .eq('proveedor_id', provId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false }),

    // Recepciones con items del proveedor
    supabase
      .from('recepciones_mercancia')
      .select(`
        id, fecha_recepcion, estado, albaran_numero,
        recepcion_items(id, nombre_articulo, cantidad_pedida, cantidad_recibida, precio_facturado, estado, fecha_caducidad, numero_lote)
      `)
      .eq('restaurante_id', rid)
      .eq('proveedor_id', provId)
      .eq('estado', 'confirmada')
      .gte('fecha_recepcion', desde)
      .order('fecha_recepcion', { ascending: false }),
  ])

  if (!rProv.data) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  // Calcular estadísticas
  const incidencias = rInc.data ?? []
  const pedidos     = rPedidos.data ?? []
  const recepciones = rRecepciones.data ?? []

  const totalItems = recepciones.flatMap((r: { recepcion_items: unknown[] }) => r.recepcion_items ?? [])
  const itemsConIncidencia = totalItems.filter((i: unknown) => {
    const item = i as { estado: string }
    return item.estado !== 'ok'
  })

  const tasaIncidencias = totalItems.length > 0
    ? Math.round((itemsConIncidencia.length / totalItems.length) * 100)
    : 0

  // Desviación de precios: items con precio_diferente
  const desviaciones = (incidencias.filter((i: { tipo: string }) => i.tipo === 'precio_diferente') as { detalle: { precio_pedido?: number; precio_facturado?: number } }[])
    .map(i => {
      const d = i.detalle ?? {}
      if (!d.precio_pedido || !d.precio_facturado) return null
      return ((d.precio_facturado - d.precio_pedido) / d.precio_pedido) * 100
    })
    .filter((v): v is number => v !== null)

  const desviacionMedia = desviaciones.length > 0
    ? desviaciones.reduce((a, b) => a + b, 0) / desviaciones.length
    : 0

  // Fiabilidad entrega (% pedidos con recepción confirmada sin incidencias graves)
  const pedidosConRecepcion = pedidos.filter((p: { estado: string }) => p.estado === 'recibido').length
  const fiabilidadEntrega = pedidos.length > 0
    ? Math.round((pedidosConRecepcion / pedidos.length) * 100)
    : null

  return NextResponse.json({
    proveedor: rProv.data,
    periodo_dias: dias,
    stats: {
      total_pedidos: pedidos.length,
      total_recepciones: recepciones.length,
      total_incidencias: incidencias.length,
      tasa_incidencias_pct: tasaIncidencias,
      desviacion_precio_media_pct: Math.round(desviacionMedia * 10) / 10,
      fiabilidad_entrega_pct: fiabilidadEntrega,
      items_total: totalItems.length,
      items_con_incidencia: itemsConIncidencia.length,
    },
    incidencias,
    pedidos,
    recepciones,
  })
}
