import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'

function detectarVertical(tipo?: string | null): 'catering' | 'eventos' | 'restaurante' {
  const t = (tipo || '').toLowerCase()
  if (t.includes('cater')) return 'catering'
  if (t.includes('event') || t.includes('hacienda') || t.includes('finca') || t.includes('espacio') || t.includes('banquet') || t.includes('bod')) return 'eventos'
  return 'restaurante'
}

// Email de venta por vertical: asunto, cuerpo y CTA a la landing correcta con tracking.
function construirEmail(
  lead: { id: string; nombre: string; tipo_negocio?: string | null },
  jwtToken: string,
  unsubUrl: string
): { utm: string; subject: string; html: string } {
  const vertical = detectarVertical(lead.tipo_negocio)
  const cfg = {
    catering: { utm: 'crm_catering', path: '/catering', txt: 'iarest.es/catering' },
    eventos: { utm: 'crm_eventos', path: '/espacios', txt: 'iarest.es/espacios' },
    restaurante: { utm: 'crm_lead', path: '', txt: 'www.iarest.es' },
  }[vertical]
  const trackingUrl = `https://www.iarest.es${cfg.path}?utm_source=${cfg.utm}&utm_id=${lead.id}&tk=${jwtToken}`
  const baja = `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/><p style="font-size:12px;color:#999;">Si prefieres no recibir más: <a href="${unsubUrl}" style="color:#999;">desuscribir</a></p>`
  const firma = `<p>Un saludo,<br/><b>Alberto</b><br/>ia.rest | +34 637 34 99 90</p>`
  const cta = `<p><b>¿5 minutos para verlo?</b><br/><a href="${trackingUrl}" style="color:#D9442B;font-weight:bold;">👉 ${cfg.txt}</a></p>`

  if (vertical === 'catering') {
    return {
      utm: cfg.utm,
      subject: `${lead.nombre}, ¿cuánto margen real te queda en cada evento? 🍽️`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>En catering lo difícil no es cocinar: es <b>cuadrar el presupuesto y saber el margen real</b> de cada evento antes de decir que sí.</p>
        <p>Lo automatizamos: escandallos, coste por comensal y presupuesto con margen al instante. Menos horas de oficina, más eventos rentables.</p>
        ${cta}${firma}${baja}</div>`,
    }
  }
  if (vertical === 'eventos') {
    return {
      utm: cfg.utm,
      subject: `${lead.nombre}, ¿llenas el calendario o se te escapan bodas? 💍`,
      html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
        <p>Para una finca de eventos, cada solicitud de bodas.net que se enfría es dinero que se va. Y llevar calendario, presupuestos y contratos a mano cuesta horas.</p>
        <p>Lo juntamos todo: <b>disponibilidad de espacios, embudo de solicitudes, presupuestos con margen y contratos</b>. Una solicitud no se pierde.</p>
        ${cta}${firma}${baja}</div>`,
    }
  }
  return {
    utm: cfg.utm,
    subject: `${lead.nombre}, ¿sabes cuánto ganas de verdad? 🤔`,
    html: `<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;"><p>Hola <b>${lead.nombre}</b>,</p>
      <p>La mayoría factura mucho pero gana poco: caja manual, comandas a mano, papeleo. <b>Facturar más no es ganar más.</b></p>
      <p><b>🎤 Comandas por voz</b> → cocina al instante, sin errores. <b>🤖 IA en procesos</b> → recuperas el margen que se pierde.</p>
      ${cta}${firma}${baja}</div>`,
  }
}

export async function GET(req: NextRequest) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    const { data: leads, error: leadsError } = await supabase.rpc(
      'search_leads_sevilla_nuevos',
      { limit_count: 3 }
    )

    if (leadsError) throw new Error(leadsError.message)
    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, enviados: 0, motivo: 'Sin leads nuevos disponibles' })
    }

    let enviados = 0

    for (const lead of leads) {
      try {
        const jwtToken = jwt.sign(
          { lead_id: lead.id, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
          process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
        )
        const unsubToken = jwt.sign({ lead_id: lead.id }, process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026')
        const unsubUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubToken}`
        const tpl = construirEmail(lead, jwtToken, unsubUrl)

        // INSERT tracking — sin restaurante_id (tabla CRM global)
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({
            lead_id: lead.id,
            mensaje_dia1_at: new Date().toISOString(),
            estado: 'enviado_dia1',
            utm_source: tpl.utm
          })

        if (trackErr) {
          console.error(`Tracking error ${lead.nombre}:`, trackErr.message)
          continue
        }

        const emailResult = await resend.emails.send({
          from: 'Alberto <alberto@iarest.es>',
          to: lead.email,
          subject: tpl.subject,
          html: tpl.html
        })

        if (emailResult.error) {
          console.error(`Email error ${lead.email}:`, emailResult.error)
          continue
        }

        enviados++
        console.log(`✅ Email enviado a ${lead.nombre} (${lead.email})`)
      } catch (err) {
        console.error(`Error lead ${lead.id}:`, err)
        continue
      }
    }

    if (enviados > 0) {
      await tgAlert(
        `<b>📧 CRM Lead Hunter — ${enviados} emails enviados</b>\n\nHora: ${new Date().toLocaleString('es-ES')}`,
        'info'
      )
    }

    return NextResponse.json({ ok: true, enviados, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Error lead-hunter-sevilla:', error)
    await tgAlert(
      `<b>🔴 CRM Lead Hunter ERROR</b>\n\nError: ${error instanceof Error ? error.message : String(error)}\nHora: ${new Date().toLocaleString('es-ES')}`,
      'critico'
    )
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
