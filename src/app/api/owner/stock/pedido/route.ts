export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET  → historial de pedidos del restaurante
// POST → generar y enviar pedido a proveedor

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)
  const articuloId = url.searchParams.get('articulo_id')

  let q = supabase
    .from('pedidos_proveedor')
    .select('*, stock_articulos(nombre, unidad_compra)')
    .eq('local_id', rid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (articuloId) q = q.eq('stock_articulo_id', articuloId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pedidos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  const { articulo_id, cantidad, notas, origen = 'manual' } = await req.json()
  if (!articulo_id || !cantidad) return NextResponse.json({ error: 'articulo_id y cantidad requeridos' }, { status: 400 })

  // Cargar datos del artículo
  const { data: art } = await supabase
    .from('stock_articulos')
    .select('nombre, unidad_compra, proveedor_nombre, proveedor_email, proveedor_telefono, stock_actual, stock_minimo')
    .eq('id', articulo_id).eq('local_id', rid).single()
  if (!art) return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 })

  // Cargar datos del restaurante para el email
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre, telefono')
    .eq('id', rid).single()

  // Crear registro del pedido
  const { data: pedido, error: errPed } = await supabase
    .from('pedidos_proveedor')
    .insert({
      local_id:    rid,
      stock_articulo_id: articulo_id,
      proveedor_nombre:  art.proveedor_nombre,
      proveedor_email:   art.proveedor_email,
      cantidad,
      unidad_compra:     art.unidad_compra,
      notas:             notas ?? null,
      origen,
      estado:            'pendiente',
    })
    .select().single()
  if (errPed) return NextResponse.json({ error: errPed.message }, { status: 500 })

  // Enviar email si hay dirección del proveedor
  let emailEnviado = false
  let emailError: string | null = null

  if (art.proveedor_email) {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <!-- Cabecera -->
  <tr><td style="background:#14110E;padding:24px 32px;">
    <span style="color:#D9442B;font-size:22px;font-weight:700;letter-spacing:-0.5px;">ia.rest</span>
    <span style="color:#8a7a6a;font-size:13px;margin-left:12px;">Pedido automático</span>
  </td></tr>
  <!-- Cuerpo -->
  <tr><td style="padding:32px;">
    <h2 style="margin:0 0 8px;font-size:20px;color:#1a1714;">Solicitud de pedido</h2>
    <p style="margin:0 0 24px;color:#6b5f52;font-size:14px;">${fecha}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ee;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f0e8d8;">
        <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b5f52;text-transform:uppercase;letter-spacing:.1em;">Artículo</td>
        <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b5f52;text-transform:uppercase;letter-spacing:.1em;">Cantidad</td>
        <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#6b5f52;text-transform:uppercase;letter-spacing:.1em;">Stock actual</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;font-size:16px;font-weight:600;color:#1a1714;">${art.nombre}</td>
        <td style="padding:14px 16px;font-size:20px;font-style:italic;font-weight:700;color:#D9442B;">${cantidad} ${art.unidad_compra}</td>
        <td style="padding:14px 16px;font-size:14px;color:#6b5f52;">${Number(art.stock_actual).toFixed(1)} ${art.unidad_compra}</td>
      </tr>
    </table>
    ${notas ? `<p style="background:#fff8ec;border-left:3px solid #E8A33B;padding:10px 14px;border-radius:4px;font-size:13px;color:#3a332c;margin-bottom:24px;"><strong>Nota:</strong> ${notas}</p>` : ''}
    <p style="font-size:14px;color:#3a332c;margin:0 0 4px;">Pedido generado por <strong>${rest?.nombre ?? 'el restaurante'}</strong>${rest?.telefono ? ` · ${rest.telefono}` : ''}.</p>
    <p style="font-size:13px;color:#9a8d7c;margin:0;">Por favor, confirme la recepción de este pedido respondiendo a este email.</p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f0e8d8;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9a8d7c;">Pedido gestionado automáticamente por <a href="https://www.iarest.es" style="color:#D9442B;text-decoration:none;">ia.rest</a> · Software de gestión para hostelería</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'ia.rest <hola@iarest.es>',
            to:      [art.proveedor_email],
            subject: `Pedido: ${cantidad} ${art.unidad_compra} de ${art.nombre} — ${rest?.nombre ?? 'Restaurante'}`,
            html,
          }),
        })
        if (res.ok) {
          emailEnviado = true
          await supabase.from('pedidos_proveedor').update({ estado: 'enviado', enviado_at: new Date().toISOString() }).eq('id', pedido.id)
        } else {
          const errData = await res.json()
          emailError = errData.message ?? 'Error al enviar email'
        }
      } catch (e) {
        emailError = 'Error de conexión con Resend'
      }
    } else {
      emailError = 'RESEND_API_KEY no configurada'
    }
  }

  return NextResponse.json({
    ok: true,
    pedido_id: pedido.id,
    email_enviado: emailEnviado,
    email_error:   emailError,
    proveedor_email: art.proveedor_email ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, estado } = await req.json()
  if (!id || !estado) return NextResponse.json({ error: 'id y estado requeridos' }, { status: 400 })
  await supabase.from('pedidos_proveedor').update({
    estado,
    ...(estado === 'recibido' ? { recibido_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('local_id', rid)
  return NextResponse.json({ ok: true })
}
