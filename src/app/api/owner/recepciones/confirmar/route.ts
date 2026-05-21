export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { sendWhatsApp } from '@/lib/whatsapp'
import { enviarEmailIncidenciasProveedor, enviarEmailAlertaCompras } from '@/lib/email'

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
      responsable_compras_id: string | null
      personal: { nombre: string; telefono: string | null } | null
    } | null

    const resumen = incidencias.map((it: { nombre_articulo: string; estado: string; cantidad_pedida: number | null; cantidad_recibida: number }) => {
      if (it.estado === 'merma') return `• ${it.nombre_articulo}: pedido ${it.cantidad_pedida ?? '?'}, recibido ${it.cantidad_recibida}`
      if (it.estado === 'precio_diferente') return `• ${it.nombre_articulo}: precio diferente al acordado`
      if (it.estado === 'no_pedido') return `• ${it.nombre_articulo}: artículo no pedido`
      return `• ${it.nombre_articulo}: incidencia (${it.estado})`
    }).join('\n')

    const albaran = rec.albaran_numero ? ` (Albarán: ${rec.albaran_numero})` : ''

    // ── Notificar al PROVEEDOR (email primero, WhatsApp si hay número) ──
    if (prov) {
      let notificadoProv = false

      // 1. Email (canal principal — siempre si tiene email)
      if (prov.email) {
        try {
          await enviarEmailIncidenciasProveedor({
            email: prov.email,
            nombreProveedor: prov.nombre,
            nombreRestaurante: rest?.nombre ?? 'el restaurante',
            albaranNumero: rec.albaran_numero,
            incidencias: (incidencias as { nombre_articulo: string; estado: string; cantidad_pedida: number | null; cantidad_recibida: number; precio_facturado: number | null }[]).map(it => ({
              nombre: it.nombre_articulo,
              tipo: it.estado,
              cantidadPedida: it.cantidad_pedida,
              cantidadRecibida: it.cantidad_recibida,
              precioFacturado: it.precio_facturado,
            })),
          })
          notificadoProv = true
        } catch (e) { console.error('[Email proveedor]', e) }
      }

      // 2. WhatsApp (canal secundario — si hay número y no hay email o como refuerzo)
      const waNum = prov.whatsapp || prov.telefono
      if (waNum) {
        const msgProv = `Hola ${prov.nombre}, hemos recibido tu pedido${albaran} con las siguientes incidencias:\n\n${resumen}\n\nPor favor, contáctanos para resolverlo. Gracias.`
        waProveedor = await sendWhatsApp(waNum, msgProv)
        if (waProveedor.ok) notificadoProv = true
      }

      if (notificadoProv) {
        await supabase.from('incidencias_proveedor')
          .update({ notificado_proveedor: true, notificado_at: new Date().toISOString() })
          .eq('recepcion_id', recepcion_id)
      }
    }

    // ── Notificar al RESPONSABLE DE COMPRAS (email primero, WhatsApp secundario) ──
    // Cargar email del responsable si tiene (puede ser owner, jefe, contable, etc.)
    let emailResponsable: string | null = null
    if (rest?.responsable_compras_id) {
      const { data: resp } = await supabase
        .from('personal')
        .select('email, nombre')
        .eq('id', rest.responsable_compras_id)
        .single()
      emailResponsable = (resp as { email?: string | null } | null)?.email ?? null
    }

    if (emailResponsable && prov) {
      try {
        await enviarEmailAlertaCompras({
          email: emailResponsable,
          nombreResponsable: (rest?.personal as { nombre: string } | null)?.nombre ?? 'Responsable',
          nombreRestaurante: rest?.nombre ?? 'el restaurante',
          nombreProveedor: prov.nombre,
          albaranNumero: rec.albaran_numero,
          numIncidencias: incidencias.length,
          resumen,
        })
      } catch (e) { console.error('[Email responsable compras]', e) }
    }

    const waRestNum = rest?.whatsapp_alertas_compras || (rest?.personal as { telefono?: string | null } | null)?.telefono
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

  // ── Auto-crear orden de pago si NO hay incidencias y el proveedor tiene días_pago ──
  let ordenPagoId: string | null = null
  if (incidencias.length === 0 && rec.proveedor_id) {
    const { data: provPago } = await supabase
      .from('proveedores')
      .select('nombre, dias_pago, metodo_pago, iban')
      .eq('id', rec.proveedor_id)
      .single()

    if (provPago?.iban || provPago?.metodo_pago === 'stripe') {
      // Calcular importe total de la recepción
      const { data: itemsPago } = await supabase
        .from('recepcion_items')
        .select('cantidad_recibida, precio_facturado')
        .eq('recepcion_id', recepcion_id)
        .not('precio_facturado', 'is', null)

      const importeTotal = (itemsPago ?? []).reduce((s: number, it: { cantidad_recibida: number; precio_facturado: number }) =>
        s + (Number(it.cantidad_recibida) * Number(it.precio_facturado)), 0)

      if (importeTotal > 0) {
        const diasPago = provPago.dias_pago ?? 30
        const vencimiento = new Date()
        vencimiento.setDate(vencimiento.getDate() + diasPago)
        const fechaVenc = vencimiento.toISOString().split('T')[0]

        const { data: nuevaOrden } = await supabase
          .from('ordenes_pago_proveedor')
          .insert({
            restaurante_id:   rid,
            proveedor_id:     rec.proveedor_id,
            recepcion_id,
            proveedor_nombre: provPago.nombre,
            concepto:         `Recepción ${rec.albaran_numero ?? recepcion_id.slice(0, 8).toUpperCase()}`,
            importe:          Math.round(importeTotal * 100) / 100,
            fecha_vencimiento: fechaVenc,
            metodo:           provPago.metodo_pago ?? 'sepa',
            estado:           'pendiente',
          })
          .select('id')
          .single()

        ordenPagoId = nuevaOrden?.id ?? null
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ...(resultado as object),
    incidencias_detectadas: incidencias.length,
    orden_pago_creada: ordenPagoId,
    notificaciones: {
      proveedor: waProveedor,
      responsable: waResponsable,
    },
  })
}
