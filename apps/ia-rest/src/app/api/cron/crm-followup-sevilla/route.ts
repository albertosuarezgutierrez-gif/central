export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'
import { construirSeguimiento } from '@/lib/crm-sevilla'

const LOTE = 3
const DIAS_ESPERA = 3

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const supabase = createServerClient()

  const limite = new Date(Date.now() - DIAS_ESPERA * 24 * 60 * 60 * 1000).toISOString()

  // Trackings con día 1 enviado, sin día 2, sin haber rellenado formulario, y ya "fríos".
  const { data: tracks } = await supabase
    .from('leads_web_tracking')
    .select('id, lead_id, mensaje_dia1_at')
    .not('mensaje_dia1_at', 'is', null)
    .is('mensaje_dia2_at', null)
    .is('formulario_rellenado_at', null)
    .lt('mensaje_dia1_at', limite)
    .limit(LOTE * 3)

  if (!tracks || tracks.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'sin seguimientos pendientes' })
  }

  const leadIds = tracks.map((t) => t.lead_id)
  const { data: leadsData } = await supabase
    .from('leads')
    .select('id, nombre, email, tipo_negocio')
    .in('id', leadIds)
  const leadsById = new Map((leadsData || []).map((l) => [l.id, l]))

  const { data: bajas } = await supabase.from('leads_unsubscribes').select('lead_id').in('lead_id', leadIds)
  const desuscritos = new Set((bajas || []).map((b) => b.lead_id))

  let enviados = 0
  for (const track of tracks) {
    if (enviados >= LOTE) break
    const lead = leadsById.get(track.lead_id)
    if (!lead || !lead.email || desuscritos.has(track.lead_id)) continue

    try {
      const jwtToken = jwt.sign(
        { lead_id: lead.id, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
        process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
      )
      const unsubToken = jwt.sign({ lead_id: lead.id }, process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026')
      const unsubUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubToken}`
      const tpl = construirSeguimiento({ id: lead.id, nombre: lead.nombre, tipo_negocio: lead.tipo_negocio }, jwtToken, unsubUrl)

      const emailResult = await resend.emails.send({
        from: 'Alberto <hola@iarest.es>',
        to: lead.email,
        subject: tpl.subject,
        html: tpl.html,
      })
      if (emailResult.error) { console.error('[followup] email', lead.email, emailResult.error); continue }

      await supabase.from('leads_web_tracking')
        .update({ mensaje_dia2_at: new Date().toISOString(), estado: 'enviado_dia2' })
        .eq('id', track.id)
      enviados++
    } catch (e) {
      console.error('[followup] lead', track.lead_id, e)
      continue
    }
  }

  if (enviados > 0) {
    await tgAlert(`📧 CRM seguimiento (día ${DIAS_ESPERA}+) Sevilla: ${enviados} emails de recordatorio enviados.`, 'info')
  }
  return NextResponse.json({ ok: true, enviados })
}
