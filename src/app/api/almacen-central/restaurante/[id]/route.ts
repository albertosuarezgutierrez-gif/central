export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { sesionAceptable } from '@/lib/session-sign'
import { createClient } from '@supabase/supabase-js'

function sc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getSession(req: NextRequest) {
  const raw = req.headers.get('x-almacen-session')
  if (!raw) return null
  try { const p = JSON.parse(raw); if (!sesionAceptable(p, 'objeto')) return null; return (p) as { contable_id: string; restaurantes: { id: string; permisos: string[] }[] } }
  catch { return null }
}
function tieneAcceso(session: ReturnType<typeof getSession>, rid: string): boolean {
  return session?.restaurantes.some(r => r.id === rid) ?? false
}

/**
 * GET /api/almacen-central/restaurante/[id]
 * Detalle de almacén de un restaurante: stock completo, pedidos, recepciones.
 *
 * POST /api/almacen-central/restaurante/[id]
 * Body: { accion: 'pedido_grupal', articulos: [{ nombre, cantidad, unidad, proveedor_id, restaurante_ids }] }
 * Crea N pedidos enlazados (uno por restaurante de la lista) con el mismo pedido_grupo_id.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rid } = await params
  const session = getSession(req)
  if (!session || !tieneAcceso(session, rid)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = sc()

  const [rStock, rPedidos, rRecepciones] = await Promise.all([
    supabase.from('stock_articulos')
      .select('id, nombre, stock_actual, stock_minimo, unidad_compra, coste_unitario, precio_ultimo_compra, proveedor_nombre, proveedor_id, alerta_activa')
      .eq('restaurante_id', rid).eq('activo', true)
      .order('nombre'),
    supabase.from('pedidos_proveedor')
      .select('id, proveedor_nombre, cantidad, unidad_compra, estado, created_at, asn_token, asn_subido_at, stock_articulos(nombre)')
      .eq('restaurante_id', rid)
      .in('estado', ['pendiente', 'enviado', 'recibido_parcial'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('recepciones_mercancia')
      .select('id, fecha_recepcion, estado, proveedor_id, albaran_numero')
      .eq('restaurante_id', rid)
      .order('fecha_recepcion', { ascending: false })
      .limit(10),
  ])

  const stock = (rStock.data ?? [])
  const criticos  = stock.filter(a => Number(a.stock_actual) <= Number(a.stock_minimo))
  const agotados  = stock.filter(a => Number(a.stock_actual) === 0)
  const ok        = stock.filter(a => Number(a.stock_actual) > Number(a.stock_minimo))
  const valorTotal= stock.reduce((s, a) => s + Number(a.stock_actual) * Number(a.precio_ultimo_compra ?? a.coste_unitario ?? 0), 0)

  return NextResponse.json({
    ok: true,
    restaurante_id: rid,
    resumen: { total_articulos: stock.length, criticos: criticos.length, agotados: agotados.length, ok: ok.length, valor_stock_eur: Math.round(valorTotal * 100) / 100 },
    stock_critico: criticos.map(a => ({ id: a.id, nombre: a.nombre, stock_actual: Number(a.stock_actual), stock_minimo: Number(a.stock_minimo), unidad: a.unidad_compra, proveedor: a.proveedor_nombre, proveedor_id: a.proveedor_id, necesario: Math.max(0, Number(a.stock_minimo) - Number(a.stock_actual)) })),
    stock_completo: stock,
    pedidos_activos: rPedidos.data ?? [],
    recepciones_recientes: rRecepciones.data ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rid } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { accion } = body

  if (accion === 'pedido_grupal') {
    const { articulos } = body as {
      articulos: { nombre: string; cantidad: number; unidad: string; proveedor_id?: string | null; proveedor_nombre?: string | null; restaurante_ids: string[] }[]
    }

    if (!articulos?.length) return NextResponse.json({ error: 'articulos requeridos' }, { status: 400 })

    // Verificar que todos los restaurante_ids son accesibles
    const ridsValidos = new Set(session.restaurantes.map(r => r.id))
    for (const art of articulos) {
      for (const rId of art.restaurante_ids) {
        if (!ridsValidos.has(rId)) return NextResponse.json({ error: `Sin acceso al restaurante ${rId}` }, { status: 403 })
      }
    }

    const supabase = sc()
    const pedido_grupo_id = crypto.randomUUID()
    const pedidosCreados: string[] = []

    for (const art of articulos) {
      for (const restauranteId of art.restaurante_ids) {
        // Buscar stock_articulo_id si existe
        const { data: sa } = await supabase
          .from('stock_articulos')
          .select('id, proveedor_nombre, proveedor_email, proveedor_id')
          .eq('restaurante_id', restauranteId)
          .ilike('nombre', art.nombre)
          .maybeSingle()

        const provNombre = art.proveedor_nombre ?? sa?.proveedor_nombre ?? null
        const provId     = art.proveedor_id     ?? sa?.proveedor_id    ?? null

        const { data: pedido } = await supabase
          .from('pedidos_proveedor')
          .insert({
            restaurante_id:    restauranteId,
            stock_articulo_id: sa?.id ?? null,
            proveedor_nombre:  provNombre ?? 'Pendiente',
            proveedor_id:      provId,
            cantidad:          art.cantidad,
            unidad_compra:     art.unidad,
            estado:            'pendiente',
            origen:            'central',
            pedido_grupo_id,
          })
          .select('id').single()

        if (pedido?.id) pedidosCreados.push(pedido.id)
      }
    }

    return NextResponse.json({
      ok: true,
      pedido_grupo_id,
      pedidos_creados: pedidosCreados.length,
      mensaje: `${pedidosCreados.length} pedido${pedidosCreados.length > 1 ? 's' : ''} creado${pedidosCreados.length > 1 ? 's' : ''} en ${[...new Set(articulos.flatMap(a => a.restaurante_ids))].length} restaurantes.`,
    })
  }

  return NextResponse.json({ error: 'accion desconocida' }, { status: 400 })
}
