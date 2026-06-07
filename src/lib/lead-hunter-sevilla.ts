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
    // Sobre-pedimos al RPC: ~la mitad del pool tiene móvil (van por WhatsApp), así que
    // pedimos de más para llegar a `limite` emails NO-móvil reales.
    const pedir = Math.min(Math.max(limite * 3, limite + 12), 80)
    const { data: leads, error: leadsError } = await supabase.rpc(
      'search_leads_sevilla_nuevos',
      { limit_count: pedir }
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
        if (propuestos >= limite) break // ya alcanzamos la tanda objetivo
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

// ── FRANQUICIAS (nacional) ────────────────────────────────────────────────
// Propone el email de PRESENTACIÓN a franquicias/cadenas de hostelería (vertical
// 'franquicia'), nacional, con email. Mismo flujo de aprobación: Telegram con botón
// "✅ Enviar" → callback enviar_sevilla (que reconstruye el email según tipo_negocio).
export async function proponerEmailsFranquicia(
  supabase: SupabaseSrv,
  limite = 20
): Promise<{ ok: boolean; enviados: number; propuestos?: number; motivo?: string; error?: string }> {
  try {
    const { data: cand, error } = await supabase
      .from('leads')
      .select('id, nombre, email, tipo_negocio')
      .eq('tipo_negocio', 'franquicia')
      .not('email', 'is', null)
      .neq('email', '')
      .neq('estado', 'descartado')
      .limit(limite * 4)
    if (error) throw new Error(error.message)
    if (!cand || cand.length === 0) {
      return { ok: true, enviados: 0, motivo: 'Sin franquicias con email pendientes' }
    }

    const ids = cand.map((l: { id: string }) => l.id)
    const [{ data: tr }, { data: baja }] = await Promise.all([
      supabase.from('leads_web_tracking').select('lead_id').in('lead_id', ids),
      supabase.from('leads_unsubscribes').select('lead_id').in('lead_id', ids),
    ])
    const yaPropuesto = new Set((tr || []).map((t: { lead_id: string }) => t.lead_id))
    const desuscrito = new Set((baja || []).map((b: { lead_id: string }) => b.lead_id))

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    let propuestos = 0
    for (const lead of cand) {
      try {
        if (propuestos >= limite) break
        if (yaPropuesto.has(lead.id) || desuscrito.has(lead.id)) continue

        const tpl = construirEmail(lead, '', '')
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({ lead_id: lead.id, estado: 'propuesto', utm_source: tpl.utm })
        if (trackErr) { console.error(`Tracking franquicia ${lead.nombre}:`, trackErr.message); continue }

        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              parse_mode: 'HTML',
              text: [
                `🏢 <b>Franquicia: ${esc(lead.nombre)}</b>`,
                `✉️ ${esc(lead.email)}`,
                ``,
                `<b>Asunto:</b> ${esc(tpl.subject)}`,
                ``,
                `<i>Toca Enviar para mandar la presentación desde hola@iarest.es</i>`,
              ].join('\n'),
              reply_markup: { inline_keyboard: [[
                { text: '✅ Enviar email', callback_data: `enviar_sevilla:${lead.id}` },
                { text: '❌ Descartar', callback_data: `descartar_sevilla:${lead.id}` },
              ]] },
            }),
          }).catch((e) => console.error('[franquicia] telegram:', e))
        }
        propuestos++
      } catch (err) {
        console.error(`Error franquicia ${lead.id}:`, err)
        continue
      }
    }

    if (propuestos > 0) {
      await tgAlert(`🏢 ${propuestos} franquicia(s) listas para aprobar (botón "Enviar" arriba).`, 'info')
    }
    return { ok: true, enviados: propuestos, propuestos }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error franquicias:', msg)
    await tgAlert(`🔴 CRM Franquicias ERROR: ${msg}`, 'critico')
    return { ok: false, enviados: 0, error: msg }
  }
}
