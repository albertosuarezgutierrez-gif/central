import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'
import { construirEmail } from '@/lib/crm-sevilla'

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
