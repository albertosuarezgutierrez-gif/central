export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { sendWhatsApp } from '@/lib/whatsapp'

/**
 * POST /api/owner/recepciones/confirmar
 * Body: { recepcion_id: string }
 * → Confirma recepción → actualiza stock → genera incidencias automáticas
 * → Notifica por WhatsApp/email al proveedor si hay discrepancias
 * → Notifica al responsable_compras del restaurante
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { recepcion_id } = await req.json()
  if (!recepcion_id) return NextResponse.json({ error: 'recepcion_id requerido' }, { status: 400 })

  const { data: rec } = await supabase
    .from('recepciones_mercancia')
    .select('id, estado, restaurante_id, proveedor_id, albaran_numero')
    .eq('id', recepcion_id)
    .eq('restaurante_id', rid)
    .single()

  if (!rec) return NextResponse.json({ error: 'Recepción no encontrada' }, { status: 404 })
  if (rec.estado !== 'borrador') return NextResponse.json({ error: 'Solo se pueden confirmar recepciones en borrador' }, { status: 409 })

  // Confirmar y actualizar stock
  const { data: resultado, error } = await supabase.rpc('fn_confirmar_recepcion', {
    p_recepcion_id: recepcion_id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cargar items con incidencias
  const { data: items } = await supabase
    .from('recepcion_items')
    .select('id, nombre_articulo, cantidad_pedida, cantidad_recibida, precio_facturado, estado, numero_lote')
    .eq('recepcion_id', recepcion_id)
    .neq('estado', 'ok')

  const incidencias = items ?? []
  let waProveedor: { ok: boolean; error?: string } | null = null
  let waResponsable: { ok: boolean; error?: string } | null = null

  if (incidencias.length > 0 && rec.proveedor_id) {
    // Guardar incidencias en BD
    await supabase.from('incidencias_proveedor').insert(
      incidencias.map((it: {
        id: string; nombre_articulo: string; estado: string
        cantidad_pedida: number | null; cantidad_recibida: number; precio_facturado: number | null
      }) => ({
        restaurante_id: rid,
        proveedor_id: rec.proveedor_id,
        recepcion_id,
        tipo: it.estado,
        articulo_nombre: it.nombre_articulo,
        detalle: {
          cantidad_pedida: it.cantidad_pedida,
          cantidad_recibida: it.cantidad_recibida,
          precio_facturado: it.precio_facturado,
        },
      }))
    )

    // Cargar datos del proveedor y responsable_compras
    const [rProv, rRest] = await Promise.all([
      supabase.from('proveedores').select('nombre, whatsapp, telefono, email').eq('id', rec.proveedor_id).single(),
      supabase
        .from('restaurantes')
        .select('nombre, whatsapp_alertas_compras, responsable_compras_id, personal(nombre, telefono)')
        .eq('id', rid)
        .single(),
    ])

    const prov = rProv.data
    const rest = rRest.data as {
      nombre: string
      whatsapp_alertas_compras: string | null
      personal: { nombre: string; telefono: string | null } | null
    } | null

    const resumen = incidencias.map((it: { nombre_articulo: string; estado: string; cantidad_pedida: number | null; cantidad_recibida: number }) => {
      if (it.estado === 'merma') return `• ${it.nombre_articulo}: pedido ${it.cantidad_pedida ?? '?'}, recibido ${it.cantidad_recibida}`
      if (it.estado === 'precio_diferente') return `• ${it.nombre_articulo}: precio diferente al acordado`
      if (it.estado === 'no_pedido') return `• ${it.nombre_articulo}: artículo no pedido`
      return `• ${it.nombre_articulo}: incidencia (${it.estado})`
    }).join('\n')

    const albaran = rec.albaran_numero ? ` (Albarán: ${rec.albaran_numero})` : ''

    // Notificar al proveedor
    if (prov) {
      const waNum = prov.whatsapp || prov.telefono
      if (waNum) {
        const msgProv = `Hola ${prov.nombre}, hemos recibido tu pedido${albaran} con las siguientes incidencias:\n\n${resumen}\n\nPor favor, contáctanos para resolverlo. Gracias.`
        waProveedor = await sendWhatsApp(waNum, msgProv)
        if (waProveedor.ok) {
          await supabase.from('incidencias_proveedor')
            .update({ notificado_proveedor: true, notificado_at: new Date().toISOString() })
            .eq('recepcion_id', recepcion_id)
        }
      }
    }

    // Notificar al responsable de compras del restaurante
    const waRestNum = rest?.whatsapp_alertas_compras || rest?.personal?.telefono
    if (waRestNum) {
      const msgRest = `⚠️ Recepción con ${incidencias.length} incidencia${incidencias.length > 1 ? 's' : ''}${albaran}:\n\n${resumen}\n\n${prov?.nombre ? `Proveedor: ${prov.nombre}` : ''}`
      waResponsable = await sendWhatsApp(waRestNum, msgRest)
    }

    // Actualizar fiabilidad del proveedor
    if (rec.proveedor_id) {
      const { data: totalInc } = await supabase
        .from('incidencias_proveedor')
        .select('id', { count: 'exact' })
        .eq('proveedor_id', rec.proveedor_id)
        .eq('restaurante_id', rid)
      const { data: totalItems } = await supabase
        .from('recepcion_items')
        .select('id', { count: 'exact' })
        .eq('restaurante_id', rid)
      const fiab = totalItems?.length
        ? Math.max(0, Math.round((1 - (totalInc?.length ?? 0) / totalItems.length) * 100))
        : 100
      await supabase.from('proveedores').update({
        fiabilidad_pct: fiab,
        incidencias_total: totalInc?.length ?? 0
      }).eq('id', rec.proveedor_id)
    }
  }

  return NextResponse.json({
    ok: true,
    ...(resultado as object),
    incidencias_detectadas: incidencias.length,
    notificaciones: {
      proveedor: waProveedor,
      responsable: waResponsable,
    },
  })
}
