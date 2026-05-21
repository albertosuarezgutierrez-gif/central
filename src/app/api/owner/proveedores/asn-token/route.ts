export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { sendWhatsApp } from '@/lib/whatsapp'
import { enviarEmailAsnProveedor } from '@/lib/email'

/**
 * POST /api/owner/proveedores/asn-token
 * Body: { pedido_id: string }
 * Genera token ASN válido 72h para que el proveedor pre-notifique el envío.
 * Envía WhatsApp/email al proveedor con el link.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { pedido_id } = await req.json()
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id requerido' }, { status: 400 })

  // Verificar pedido + cargar datos del proveedor
  const { data: pedido } = await supabase
    .from('pedidos_proveedor')
    .select(`
      id, cantidad, unidad_compra, proveedor_id, proveedor_nombre, proveedor_email, proveedor_telefono,
      stock_articulos(nombre),
      proveedores(nombre, email, whatsapp, telefono)
    `)
    .eq('id', pedido_id)
    .eq('restaurante_id', rid)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // Generar token único
  const token = crypto.randomUUID().replace(/-/g, '')
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72h

  const { error: tokErr } = await supabase
    .from('pedidos_proveedor')
    .update({
      asn_token: token,
      asn_token_expires_at: expires.toISOString(),
    })
    .eq('id', pedido_id)

  if (tokErr) return NextResponse.json({ error: tokErr.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.iarest.es'
  const asnUrl  = `${baseUrl}/asn/${token}`

  // Obtener datos del restaurante para el mensaje
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre')
    .eq('id', rid)
    .single()

  const prov = (pedido.proveedores as unknown as { nombre: string; email: string | null; whatsapp: string | null; telefono: string | null } | null) ?? {
    nombre: pedido.proveedor_nombre ?? 'Proveedor',
    email: pedido.proveedor_email,
    whatsapp: null,
    telefono: pedido.proveedor_telefono,
  }

  const articulo = (pedido.stock_articulos as unknown as { nombre: string } | null)?.nombre ?? 'artículo'
  const nombreRest = rest?.nombre ?? 'el restaurante'

  const mensaje = `Hola ${prov.nombre}, ${nombreRest} ha realizado un pedido de ${pedido.cantidad} ${pedido.unidad_compra} de ${articulo}.\n\nPuedes notificarnos el envío y subir tu albarán aquí (válido 72h):\n${asnUrl}\n\nGracias 🙏`

  // 1. Email (canal principal)
  let emailResult: { ok: boolean; error?: string } = { ok: false, error: 'Sin email configurado en proveedor' }
  if (prov.email) {
    try {
      await enviarEmailAsnProveedor({
        email: prov.email,
        nombreProveedor: prov.nombre,
        nombreRestaurante: nombreRest,
        articulo,
        cantidad: pedido.cantidad,
        unidad: pedido.unidad_compra,
        asnUrl,
      })
      emailResult = { ok: true }
    } catch (e) {
      emailResult = { ok: false, error: String(e) }
    }
  }

  // 2. WhatsApp (canal secundario)
  let waResult: { ok: boolean; error?: string } = { ok: false, error: 'Sin WhatsApp configurado en proveedor' }
  const waNumber = prov.whatsapp || prov.telefono
  if (waNumber) {
    waResult = await sendWhatsApp(waNumber, mensaje)
  }

  return NextResponse.json({
    ok: true,
    asn_url: asnUrl,
    token,
    expires_at: expires.toISOString(),
    notificacion: {
      email: emailResult,
      whatsapp: waResult,
      canales_enviados: [emailResult.ok && 'email', waResult.ok && 'whatsapp'].filter(Boolean),
    },
  })
}
