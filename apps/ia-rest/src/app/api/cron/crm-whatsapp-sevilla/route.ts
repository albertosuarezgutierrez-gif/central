export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { construirWhatsApp, detectarVertical } from '@/lib/crm-sevilla'

const LOTE = 5 // leads por ejecución (evita saturar el Telegram de Alberto)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const supabase = createServerClient()

  // Leads de Sevilla con teléfono y sin outreach de WhatsApp previo.
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, telefono, tipo_negocio')
    .ilike('ciudad', '%Sevilla%')
    .not('telefono', 'is', null)
    .is('whatsapp_outreach_at', null)
    .neq('estado', 'descartado')
    .limit(LOTE * 3)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, motivo: 'sin leads con teléfono pendientes' })
  }

  // Excluir desuscritos.
  const ids = leads.map((l) => l.id)
  const { data: bajas } = await supabase.from('leads_unsubscribes').select('lead_id').in('lead_id', ids)
  const desuscritos = new Set((bajas || []).map((b) => b.lead_id))

  const tgToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  let enviados = 0
  for (const lead of leads) {
    if (enviados >= LOTE) break
    if (desuscritos.has(lead.id)) continue

    const nombre = (lead.nombre || lead.empresa || 'Lead') as string
    const wa = construirWhatsApp({ id: lead.id, nombre, tipo_negocio: lead.tipo_negocio }, lead.telefono as string)

    // Teléfono no válido → marcar para no reprocesarlo, sin enviar.
    if (!wa) {
      await supabase.from('leads').update({ whatsapp_outreach_at: new Date().toISOString() }).eq('id', lead.id)
      continue
    }

    // Aviso a Alberto con botón de 1 toque que abre WhatsApp con el mensaje listo.
    if (tgToken && chatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          parse_mode: 'HTML',
          text: [
            `📲 <b>WhatsApp listo: ${nombre}</b>`,
            `Vertical: ${detectarVertical(lead.tipo_negocio)} · ☎️ ${lead.telefono}`,
            ``,
            `<i>Toca el botón para abrir WhatsApp con el mensaje escrito.</i>`,
          ].join('\n'),
          reply_markup: { inline_keyboard: [[{ text: '📲 Abrir WhatsApp', url: wa.link }]] },
        }),
      }).catch((e) => console.error('[crm-whatsapp] telegram:', e))
    }

    await supabase.from('leads').update({
      whatsapp_outreach_at: new Date().toISOString(),
    }).eq('id', lead.id)
    enviados++
  }

  if (enviados > 0) {
    await tgAlert(`📲 CRM WhatsApp Sevilla: ${enviados} enlaces wa.me listos para enviar (arriba).`, 'info')
  }
  return NextResponse.json({ ok: true, enviados })
}
