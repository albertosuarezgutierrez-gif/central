// /api/cron/crm-envio-auto — Envío automático de emails en frío a leads aprobados.
//
// Clona el patrón probado del agente de mailing de ialimp, pero reutiliza los campos
// que la tabla `leads` de ia.rest ya tiene: `envio_aprobado`, `envio_programado_at`,
// `email_draft`, `email_asunto`, `propuesta_enviada_at`.
//
// SEGURO POR DEFECTO (doble cerrojo, no envía nada salvo activación explícita):
//   1) Interruptor maestro: solo actúa si `ENVIO_AUTO_ACTIVO === '1'`.
//   2) Aprobación por lead: solo envía a leads con `envio_aprobado = true`.
// Además: solo en horario laboral (L-V 9-19 Madrid), con tope diario y respetando bajas.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import jwt from 'jsonwebtoken'
import { tgAlert } from '@/lib/telegram'

const LOTE = 8                 // máximo de envíos por ejecución del cron
const MAX_DIA_DEFAULT = 30     // tope de envíos por día (override con ENVIO_AUTO_MAX_DIA)
const DIAS_SEGUIMIENTO = 3     // programa el siguiente contacto a N días

// Horario laboral España: L-V 9:00-19:00 (evita enviar en frío de noche o en finde).
function enHorarioLaboralMadrid(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(d)
  const wd = parts.find(p => p.type === 'weekday')?.value
  const h = Number(parts.find(p => p.type === 'hour')?.value)
  const finde = wd === 'Sat' || wd === 'Sun'
  return !finde && h >= 9 && h < 19
}

// Texto plano del borrador → HTML con la identidad de ia.rest + enlace de baja (RGPD).
function emailToHtml(texto: string, unsubUrl: string): string {
  const cuerpo = texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split('\n')
    .map(l => `<p style="margin:0 0 10px;font-family:sans-serif;font-size:15px;color:#1a1714;line-height:1.6">${l || '&nbsp;'}</p>`)
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 20px;background:#f6f1e7;font-family:sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="margin-bottom:24px"><span style="font-family:serif;font-size:22px;font-weight:600;color:#14110e">ia.rest</span></div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #d8cdb6">${cuerpo}</div>
    <div style="margin-top:20px;font-family:sans-serif;font-size:12px;color:#9c8e7e;text-align:center">
      ia.rest · <a href="https://www.iarest.es" style="color:#d9442b;text-decoration:none">www.iarest.es</a> · hola@iarest.es<br>
      <a href="${unsubUrl}" style="color:#9c8e7e;text-decoration:underline">Darte de baja</a>
    </div>
  </div>
</body></html>`
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Cerrojo 1 — interruptor maestro. Sin esta env el cron es inerte (no envía nada).
  if (process.env.ENVIO_AUTO_ACTIVO !== '1') {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'ENVIO_AUTO_ACTIVO != 1 (desactivado)' })
  }
  if (!enHorarioLaboralMadrid()) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'fuera de horario laboral (L-V 9-19 Madrid)' })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, enviados: 0, motivo: 'falta RESEND_API_KEY' })
  }

  const supabase = createServerClient()
  const maxDia = Number(process.env.ENVIO_AUTO_MAX_DIA || MAX_DIA_DEFAULT)

  // Tope diario: cuántos se han enviado hoy (zona Madrid).
  const hoyMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) // YYYY-MM-DD
  const { count: enviadosHoy } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('propuesta_enviada_at', `${hoyMadrid}T00:00:00`)
  const restantes = Math.max(0, maxDia - (enviadosHoy || 0))
  if (restantes <= 0) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'tope diario alcanzado' })
  }
  const aEnviar = Math.min(LOTE, restantes)

  // Cerrojo 2 — solo leads aprobados, con email y borrador, no enviados ni descartados,
  // cuya hora programada (si la hay) ya pasó.
  const ahoraIso = new Date().toISOString()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante, email, email_draft, email_asunto, eventos')
    .eq('envio_aprobado', true)
    .not('email', 'is', null)
    .not('email_draft', 'is', null)
    .not('estado_pipeline', 'in', '(enviado,cliente,descartado)')
    .or(`envio_programado_at.is.null,envio_programado_at.lte.${ahoraIso}`)
    .order('puntuacion', { ascending: false })
    .limit(aEnviar * 3)

  if (!leads?.length) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'sin leads aprobados pendientes' })
  }

  // Excluir bajas (RGPD).
  const ids = leads.map(l => l.id)
  const { data: bajas } = await supabase.from('leads_unsubscribes').select('lead_id').in('lead_id', ids)
  const desuscritos = new Set((bajas || []).map(b => b.lead_id))

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const secret = process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'

  let enviados = 0
  const errores: string[] = []
  for (const lead of leads) {
    if (enviados >= aEnviar) break
    if (!lead.email || !lead.email_draft || desuscritos.has(lead.id)) continue

    const empresa = lead.empresa || lead.restaurante || lead.nombre
    const asunto = lead.email_asunto || `ia.rest para ${empresa}`
    const unsubToken = jwt.sign({ lead_id: lead.id }, secret)
    const unsubUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubToken}`

    try {
      const r = await resend.emails.send({
        from: 'ia.rest <hola@iarest.es>',
        to: lead.email,
        subject: asunto,
        html: emailToHtml(lead.email_draft, unsubUrl),
        text: lead.email_draft,
        replyTo: 'hola@iarest.es',
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })
      if (r.error) { errores.push(`${lead.email}: ${r.error.message || r.error}`); continue }

      const eventos = Array.isArray(lead.eventos) ? lead.eventos : []
      await supabase.from('leads').update({
        estado_pipeline: 'enviado',
        estado: 'contactado',
        propuesta_enviada_at: new Date().toISOString(),
        ultimo_contacto_at: new Date().toISOString(),
        siguiente_contacto_at: new Date(Date.now() + DIAS_SEGUIMIENTO * 86400000).toISOString(),
        ultima_actividad_at: new Date().toISOString(),
        eventos: [...eventos, { tipo: '📨', texto: `Email enviado (auto) a ${lead.email}`, fecha: new Date().toISOString().split('T')[0] }],
      }).eq('id', lead.id)
      enviados++
    } catch (e: unknown) {
      errores.push(`${lead.email}: ${e instanceof Error ? e.message : 'error'}`)
      continue
    }
  }

  if (enviados > 0 || errores.length) {
    await tgAlert(
      `📨 Envío automático ia.rest: ${enviados} enviado${enviados !== 1 ? 's' : ''}` +
      `${errores.length ? ` · ${errores.length} con error` : ''} (quedan ${restantes - enviados} hoy).`,
      errores.length ? 'aviso' : 'info'
    )
  }
  return NextResponse.json({ ok: true, enviados, errores: errores.slice(0, 5), restantesHoy: restantes - enviados })
}
