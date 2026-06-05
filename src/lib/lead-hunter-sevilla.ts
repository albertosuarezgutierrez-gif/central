// Router de contacto de Sevilla (email).
// El email frío YA NO se auto-envía: se PROPONE por Telegram con botón "✅ Enviar"
// (lo aprueba Alberto; el envío real ocurre en /api/telegram/webhook → enviar_sevilla).
// Además, los leads CON móvil se excluyen aquí: esos van por WhatsApp (crm-whatsapp-sevilla).
// Lo usan el cron `/api/cron/crm-lead-hunter-sevilla` y el panel `/api/super/lead-hunter-sevilla`.

import type { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { construirEmail, esMovilEs, detectarVertical } from '@/lib/crm-sevilla'

type SupabaseSrv = ReturnType<typeof createServerClient>

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function enviarEmailsSevilla(
  supabase: SupabaseSrv,
  limite = 3
): Promise<{ ok: boolean; enviados: number; propuestos?: number; motivo?: string; error?: string }> {
  try {
    const { data: leads, error: leadsError } = await supabase.rpc(
      'search_leads_sevilla_nuevos',
      { limit_count: limite }
    )
    if (leadsError) throw new Error(leadsError.message)
    if (!leads || leads.length === 0) {
      return { ok: true, enviados: 0, motivo: 'Sin leads nuevos disponibles' }
    }

    // Excluir los que tienen MÓVIL (esos se contactan por WhatsApp, no por email).
    const ids = leads.map((l: { id: string }) => l.id)
    const { data: tels } = await supabase.from('leads').select('id, telefono').in('id', ids)
    const tieneMovil = new Map((tels || []).map((t: { id: string; telefono: string | null }) => [t.id, esMovilEs(t.telefono)]))

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    let propuestos = 0
    for (const lead of leads) {
      try {
        if (tieneMovil.get(lead.id)) continue // tiene móvil → WhatsApp

        const tpl = construirEmail(lead, '', '') // solo para asunto/utm en la propuesta
        // Marca como "propuesto" para que el RPC no lo vuelva a proponer (excluye leads con tracking).
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({ lead_id: lead.id, estado: 'propuesto', utm_source: tpl.utm })
        if (trackErr) { console.error(`Tracking propuesto ${lead.nombre}:`, trackErr.message); continue }

        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              parse_mode: 'HTML',
              text: [
                `📧 <b>Email listo: ${esc(lead.nombre)}</b>`,
                `${detectarVertical(lead.tipo_negocio)} · ✉️ ${esc(lead.email)}`,
                ``,
                `<b>Asunto:</b> ${esc(tpl.subject)}`,
                ``,
                `<i>Toca Enviar para mandarlo desde hola@iarest.es</i>`,
              ].join('\n'),
              reply_markup: { inline_keyboard: [[
                { text: '✅ Enviar email', callback_data: `enviar_sevilla:${lead.id}` },
                { text: '❌ Descartar', callback_data: `descartar_sevilla:${lead.id}` },
              ]] },
            }),
          }).catch((e) => console.error('[lead-hunter] telegram:', e))
        }
        propuestos++
      } catch (err) {
        console.error(`Error lead ${lead.id}:`, err)
        continue
      }
    }

    if (propuestos > 0) {
      await tgAlert(`📧 ${propuestos} email(s) de venta listos para aprobar (botón "Enviar" arriba).`, 'info')
    }
    // `enviados` se mantiene por compatibilidad con cron/panel: aquí = nº propuestos.
    return { ok: true, enviados: propuestos, propuestos }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error lead-hunter-sevilla:', msg)
    await tgAlert(`🔴 CRM Lead Hunter ERROR: ${msg}`, 'critico')
    return { ok: false, enviados: 0, error: msg }
  }
}
