// Núcleo del envío de email frío de venta en Sevilla (3 plantillas por vertical).
// Lo usan el cron `/api/cron/crm-lead-hunter-sevilla` y el panel `/api/super/lead-hunter-sevilla`.

import type { createServerClient } from '@/lib/supabase'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'
import { construirEmail } from '@/lib/crm-sevilla'

type SupabaseSrv = ReturnType<typeof createServerClient>

export async function enviarEmailsSevilla(
  supabase: SupabaseSrv,
  limite = 3
): Promise<{ ok: boolean; enviados: number; motivo?: string; error?: string }> {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const { data: leads, error: leadsError } = await supabase.rpc(
      'search_leads_sevilla_nuevos',
      { limit_count: limite }
    )
    if (leadsError) throw new Error(leadsError.message)
    if (!leads || leads.length === 0) {
      return { ok: true, enviados: 0, motivo: 'Sin leads nuevos disponibles' }
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
            utm_source: tpl.utm,
          })
        if (trackErr) { console.error(`Tracking error ${lead.nombre}:`, trackErr.message); continue }

        const emailResult = await resend.emails.send({
          from: 'Alberto <hola@iarest.es>',
          to: lead.email,
          subject: tpl.subject,
          html: tpl.html,
        })
        if (emailResult.error) { console.error(`Email error ${lead.email}:`, emailResult.error); continue }

        enviados++
        console.log(`✅ Email enviado a ${lead.nombre} (${lead.email})`)

        // Kanban honesto: al contactar de verdad, el lead deja de ser "Nuevo".
        // Solo movemos 'nuevo' → 'contactado' (no pisamos estados más avanzados).
        // En su propio try/catch: si falla, el email ya salió, no abortamos.
        try {
          await supabase
            .from('leads')
            .update({ estado: 'contactado', ultima_actividad_at: new Date().toISOString() })
            .eq('id', lead.id)
            .eq('estado', 'nuevo')
        } catch (e) {
          console.error(`No se pudo marcar contactado ${lead.id}:`, e)
        }
      } catch (err) {
        console.error(`Error lead ${lead.id}:`, err)
        continue
      }
    }

    if (enviados > 0) {
      await tgAlert(`📧 CRM Lead Hunter — ${enviados} emails de venta enviados (Sevilla).`, 'info')
    }
    return { ok: true, enviados }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error lead-hunter-sevilla:', msg)
    await tgAlert(`🔴 CRM Lead Hunter ERROR: ${msg}`, 'critico')
    return { ok: false, enviados: 0, error: msg }
  }
}
