/**
 * GET /api/cron/feedback-visita
 * Vercel Cron: cada 10 minutos ("star/10 * * * *")
 *
 * Lógica:
 * 1. Busca comandas cerradas hace entre 25-35 min con teléfono de cliente registrado
 *    y sin feedback_enviado_at
 * 2. Envía email al cliente con valoración 1-5 estrellas (link /feedback/[token])
 * 3. Si el restaurante no tiene email_feedback activo → skip
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { Resend } from 'resend'
import { tgAlert } from '@/lib/telegram'

export const dynamic     = 'force-dynamic'
export const maxDuration = 45
export const runtime     = 'nodejs'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function emailHtml(d: {
  restauranteNombre: string
  colorPrimario: string
  feedbackToken: string
  dominio: string
}) {
  const url = `https://${d.dominio}/feedback/${d.feedbackToken}`
  const estrellas = [1,2,3,4,5]
  const colores = ['#ef4444','#f97316','#eab308','#84cc16','#22c55e']
  const emojis  = ['😞','😐','🙂','😊','🤩']

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F1E7;font-family:Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e0d8cc">
    <div style="background:#14110E;padding:24px 32px;text-align:center">
      <span style="color:#F6F1E7;font-size:22px;font-weight:700">${d.restauranteNombre}</span>
    </div>
    <div style="padding:36px 32px;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">🍽️</div>
      <h2 style="margin:0 0 10px;color:#14110E;font-size:22px;font-weight:700">¿Cómo fue tu visita?</h2>
      <p style="margin:0 0 32px;color:#6B5F52;font-size:15px;line-height:1.5">
        Tu opinión nos ayuda a mejorar. Solo te llevará 10 segundos.
      </p>
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
        ${estrellas.map(n => `
        <a href="${url}?nota=${n}" style="text-decoration:none;display:inline-block;width:70px">
          <div style="background:${colores[n-1]}18;border:2px solid ${colores[n-1]};border-radius:14px;padding:12px 6px;text-align:center">
            <div style="font-size:24px">${emojis[n-1]}</div>
            <div style="font-size:11px;color:${colores[n-1]};font-weight:700;margin-top:4px">${n} ★</div>
          </div>
        </a>`).join('')}
      </div>
      <p style="margin:28px 0 0;color:#9C8E7E;font-size:12px">
        Al valorar aceptas que tu opinión puede usarse para mejorar el servicio.
      </p>
    </div>
    <div style="padding:14px 32px;background:#F6F1E7;text-align:center;font-size:11px;color:#9C8E7E">
      ia.rest · gestión de restaurantes · <a href="https://${d.dominio}" style="color:#9C8E7E">${d.dominio}</a>
    </div>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const resend   = new Resend(process.env.RESEND_API_KEY!)

  const ahora    = new Date()
  const hace25m  = new Date(ahora.getTime() - 25 * 60 * 1000).toISOString()
  const hace35m  = new Date(ahora.getTime() - 35 * 60 * 1000).toISOString()

  // Comandas cerradas hace ~30 min con email cliente y sin feedback enviado
  const { data: comandas, error } = await supabase
    .from('comandas')
    .select(`
      id, restaurante_id, cerrada_at,
      cliente_email, cliente_nombre,
      restaurantes(nombre, email_contacto, feedback_activo, dominio_custom)
    `)
    .eq('estado', 'cerrada')
    .not('cliente_email', 'is', null)
    .is('feedback_enviado_at', null)
    .gte('cerrada_at', hace35m)
    .lte('cerrada_at', hace25m)

  if (error) {
    // Columnas aún no existen → silencioso
    if (error.message.includes('does not exist') || error.message.includes('column')) {
      return NextResponse.json({ ok: true, nota: 'migración pendiente', enviados: 0 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let enviados = 0
  const errores: string[] = []

  await Promise.allSettled((comandas ?? []).map(async (c) => {
    const rest = c.restaurantes as unknown as { nombre: string; email_contacto: string; feedback_activo: boolean; dominio_custom: string | null } | null
    if (!rest?.feedback_activo) return
    if (!c.cliente_email) return

    // Generar token único para este feedback
    const token = `${c.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    const dominio = rest.dominio_custom ?? 'www.iarest.es'

    // Guardar token en BD
    await supabase.from('feedback_visita').insert({
      comanda_id:      c.id,
      restaurante_id:  c.restaurante_id,
      cliente_email:   c.cliente_email,
      cliente_nombre:  c.cliente_nombre ?? null,
      token,
      // qa-ignore: 'pendiente' es estado de la tabla feedback_visita, no de comandas
      estado:          'pendiente',
    }).select().maybeSingle()

    // Enviar email
    const { error: errEmail } = await resend.emails.send({
      from:    `${rest.nombre} <noreply@iarest.es>`,
      to:      c.cliente_email,
      subject: `¿Cómo fue tu visita a ${rest.nombre}?`,
      html:    emailHtml({ restauranteNombre: rest.nombre, colorPrimario: '#D9442B', feedbackToken: token, dominio }),
    })

    if (errEmail) { errores.push(`${c.id}: ${errEmail.message}`); return }

    // Marcar como enviado
    await supabase.from('comandas').update({ feedback_enviado_at: new Date().toISOString() }).eq('id', c.id)
    enviados++
  }))

  if (enviados > 0) {
    await tgAlert(`⭐ Feedback: ${enviados} email${enviados > 1 ? 's' : ''} enviado${enviados > 1 ? 's' : ''}`, 'info')
  }

  return NextResponse.json({ ok: true, enviados, errores })
}
