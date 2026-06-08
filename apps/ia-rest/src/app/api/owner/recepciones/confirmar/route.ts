export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { sendWhatsApp } from '@/lib/whatsapp'
import {
  enviarEmailIncidenciasProveedor,
  enviarEmailAlertaCompras,
  enviarEmailRecadvProveedor,
  enviarEmailSolicitarFactura,
} from '@/lib/email'

/**
 * POST /api/owner/recepciones/confirmar
 * → Confirma recepción → actualiza stock → incidencias automáticas
 * → Email/WhatsApp al proveedor (incidencias o RECADV + solicitud factura)
 * → Auto-crea orden de pago si recepción sin incidencias
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { recepcion_id } = await req.json()
  if (!recepcion_id) return NextResponse.json({ error: 'recepcion_id requerido' }, { status: 400 })

  const { data: rec } = await supabase
    .from('recepciones_mercancia')
    .select('id, estado, local_id, proveedor_id, albaran_numero')
    .eq('id', recepcion_id)
    .eq('local_id', rid)
    .single()

  if (!rec) return NextResponse.json({ error: 'Recepción no encontrada' }, { status: 404 })
  if (rec.estado !== 'borrador') return NextResponse.json({ error: 'Solo se pueden confirmar recepciones en borrador' }, { status: 409 })

  const { data: resultado, error } = await supabase.rpc('fn_confirmar_recepcion', {
    p_recepcion_id: recepcion_id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Items con incidencias
  const { data: items } = await supabase
    .from('recepcion_items')
    .select('id, nombre_articulo, cantidad_pedida, cantidad_recibida, precio_facturado, estado, numero_lote')
    .eq('recepcion_id', recepcion_id)
    .neq('estado', 'ok')
  const incidencias = items ?? []

  let waProveedor:   { ok: boolean; error?: string } | null = null
  let waResponsable: { ok: boolean; error?: string } | null = null

  // Datos del restaurante (siempre necesarios para notificaciones)
  const { data: restData } = await supabase
    .from('restaurantes')
    .select('nombre, whatsapp_alertas_compras, responsable_compras_id, personal(nombre, telefono)')
    .eq('id', rid)
    .single()
  const rest = restData as {
    nombre: string
    whatsapp_alertas_compras: string | null
    responsable_compras_id: string | null
    personal: { nombre: string; telefono: string | null } | null
  } | null

  // ── CON INCIDENCIAS ───────────────────────────────────────────────────────
  if (incidencias.length > 0 && rec.proveedor_id) {
    await supabase.from('incidencias_proveedor').insert(
      incidencias.map((it: {
        id: string; nombre_articulo: string; estado: string
        cantidad_pedida: number | null; cantidad_recibida: number; precio_facturado: number | null
      }) => ({
        local_id:  rid,
        proveedor_id:    rec.proveedor_id,
        recepcion_id,
        tipo:            it.estado,
        articulo_nombre: it.nombre_articulo,
        detalle: {
          cantidad_pedida:   it.cantidad_pedida,
          cantidad_recibida: it.cantidad_recibida,
          precio_facturado:  it.precio_facturado,
        },
      }))
    )

    const { data: provData } = await supabase
      .from('proveedores').select('nombre, whatsapp, telefono, email')
      .eq('id', rec.proveedor_id).single()
    const prov = provData as { nombre: string; whatsapp: string | null; telefono: string | null; email: string | null } | null

    const resumen = incidencias.map((it: { nombre_articulo: string; estado: string; cantidad_pedida: number | null; cantidad_recibida: number }) => {
      if (it.estado === 'merma')            return `• ${it.nombre_articulo}: pedido ${it.cantidad_pedida ?? '?'}, recibido ${it.cantidad_recibida}`
      if (it.estado === 'precio_diferente') return `• ${it.nombre_articulo}: precio diferente al acordado`
      if (it.estado === 'no_pedido')        return `• ${it.nombre_articulo}: artículo no pedido`
      return `• ${it.nombre_articulo}: incidencia (${it.estado})`
    }).join('\n')

    const albaran = rec.albaran_numero ? ` (Albarán: ${rec.albaran_numero})` : ''

    if (prov?.email) {
      try {
        await enviarEmailIncidenciasProveedor({
          email:             prov.email,
          nombreProveedor:   prov.nombre,
          nombreRestaurante: rest?.nombre ?? 'el restaurante',
          albaranNumero:     rec.albaran_numero,
          incidencias: (incidencias as { nombre_articulo: string; estado: string; cantidad_pedida: number | null; cantidad_recibida: number; precio_facturado: number | null }[]).map(it => ({
            nombre:           it.nombre_articulo,
            tipo:             it.estado,
            cantidadPedida:   it.cantidad_pedida,
            cantidadRecibida: it.cantidad_recibida,
            precioFacturado:  it.precio_facturado,
          })),
        })
        await supabase.from('incidencias_proveedor')
          .update({ notificado_proveedor: true, notificado_at: new Date().toISOString() })
          .eq('recepcion_id', recepcion_id)
      } catch (e) { console.error('[Email proveedor incidencias]', e) }
    }

    const waNum = prov?.whatsapp || prov?.telefono
    if (waNum) {
      const msg = `Hola ${prov?.nombre}, hemos recibido tu pedido${albaran} con incidencias:\n\n${resumen}\n\nPor favor, contáctanos.`
      waProveedor = await sendWhatsApp(waNum, msg)
    }

    if (rest?.responsable_compras_id) {
      const { data: respData } = await supabase.from('personal').select('email').eq('id', rest.responsable_compras_id).single()
      const emailResp = (respData as { email?: string | null } | null)?.email
      if (emailResp && prov) {
        try {
          await enviarEmailAlertaCompras({
            email:             emailResp,
            nombreResponsable: rest?.personal?.nombre ?? 'Responsable',
            nombreRestaurante: rest?.nombre ?? 'el restaurante',
            nombreProveedor:   prov.nombre,
            albaranNumero:     rec.albaran_numero,
            numIncidencias:    incidencias.length,
            resumen,
          })
        } catch (e) { console.error('[Email responsable compras]', e) }
      }
    }

    const waRestNum = rest?.whatsapp_alertas_compras || rest?.personal?.telefono
    if (waRestNum) {
      const msg = `Incidencia recepción${albaran}: ${incidencias.length} problema${incidencias.length > 1 ? 's' : ''}\n${resumen}`
      waResponsable = await sendWhatsApp(waRestNum, msg)
    }

    if (rec.proveedor_id) {
      const { data: totalInc }   = await supabase.from('incidencias_proveedor').select('id', { count: 'exact' }).eq('proveedor_id', rec.proveedor_id).eq('local_id', rid)
      const { data: totalItems } = await supabase.from('recepcion_items').select('id', { count: 'exact' }).eq('local_id', rid)
      const fiab = totalItems?.length
        ? Math.max(0, Math.round((1 - (totalInc?.length ?? 0) / totalItems.length) * 100))
        : 100
      await supabase.from('proveedores').update({ fiabilidad_pct: fiab, incidencias_total: totalInc?.length ?? 0 }).eq('id', rec.proveedor_id)
    }
  }

  // ── SIN INCIDENCIAS: RECADV + solicitar factura + orden de pago ───────────
  let ordenPagoId: string | null = null

  if (incidencias.length === 0 && rec.proveedor_id) {
    const { data: provOK } = await supabase
      .from('proveedores')
      .select('nombre, email, dias_pago, metodo_pago, iban, pedidos_proveedor(asn_token)')
      .eq('id', rec.proveedor_id)
      .single()

    type ProvOK = {
      nombre: string; email: string | null; dias_pago: number | null
      metodo_pago: string | null; iban: string | null
      pedidos_proveedor: { asn_token: string | null }[] | null
    }
    const prov = provOK as ProvOK | null

    const { data: itemsOK } = await supabase
      .from('recepcion_items').select('cantidad_recibida, precio_facturado')
      .eq('recepcion_id', recepcion_id).not('precio_facturado', 'is', null)
    const importeRec = (itemsOK ?? []).reduce((s, it) =>
      s + Number(it.cantidad_recibida) * Number(it.precio_facturado), 0)

    const { count: numArticulos } = await supabase
      .from('recepcion_items').select('id', { count: 'exact' }).eq('recepcion_id', recepcion_id)

    const diasPago   = prov?.dias_pago ?? 30
    const fechaPagoD = new Date(); fechaPagoD.setDate(fechaPagoD.getDate() + diasPago)
    const fechaPagoStr = fechaPagoD.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })

    // 1. Orden de pago automática
    if (prov && (prov.iban || prov.metodo_pago === 'stripe') && importeRec > 0) {
      const { data: nuevaOrden } = await supabase
        .from('ordenes_pago_proveedor')
        .insert({
          local_id:    rid,
          proveedor_id:      rec.proveedor_id,
          recepcion_id,
          proveedor_nombre:  prov.nombre,
          concepto:          `Recepción ${rec.albaran_numero ?? recepcion_id.slice(0, 8).toUpperCase()}`,
          importe:           Math.round(importeRec * 100) / 100,
          fecha_vencimiento: fechaPagoD.toISOString().split('T')[0],
          metodo:            prov.metodo_pago ?? 'sepa',
          estado:            'pendiente',
        })
        .select('id').single()
      ordenPagoId = nuevaOrden?.id ?? null
    }

    // 2. RECADV al proveedor
    if (prov?.email) {
      try {
        await enviarEmailRecadvProveedor({
          email:             prov.email,
          nombreProveedor:   prov.nombre,
          nombreRestaurante: rest?.nombre ?? 'el restaurante',
          albaranNumero:     rec.albaran_numero,
          fechaPago:         fechaPagoStr,
          importe:           importeRec > 0 ? importeRec : null,
          numArticulos:      numArticulos ?? undefined,
        })
      } catch (e) { console.error('[RECADV]', e) }

      // 3. Solicitar factura con link ASN
      const tokens   = prov.pedidos_proveedor
      const asnToken = Array.isArray(tokens) && tokens.length > 0 ? tokens[0]?.asn_token : null
      if (asnToken && importeRec > 0) {
        try {
          await enviarEmailSolicitarFactura({
            email:             prov.email,
            nombreProveedor:   prov.nombre,
            nombreRestaurante: rest?.nombre ?? 'el restaurante',
            albaranNumero:     rec.albaran_numero,
            importe:           importeRec,
            uploadUrl:         `https://www.iarest.es/asn/${asnToken}`,
          })
        } catch (e) { console.error('[Solicitar factura]', e) }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    ...(resultado as object),
    incidencias_detectadas: incidencias.length,
    orden_pago_creada:      ordenPagoId,
    notificaciones: { proveedor: waProveedor, responsable: waResponsable },
  })
}
