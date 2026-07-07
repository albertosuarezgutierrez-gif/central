// Router de contacto de Sevilla (email).
// Desde el 03/07/2026 (decisión de Alberto) el email frío de presentación se ENVÍA
// AUTOMÁTICAMENTE con la plantilla tipo por vertical (construirEmail): el botón de
// aprobación en Telegram estuvo semanas muerto (plataforma no reenviaba el callback)
// y se acumulaban propuestas sin enviar. Se avisa por Telegram de cada tanda enviada.
// CRM_ENVIO_AUTO='0' devuelve el modo antiguo: proponer con botón "✅ Enviar"
// (envío real en /api/telegram/webhook → enviar_sevilla).
// Los leads CON móvil se excluyen aquí: esos van por WhatsApp (crm-whatsapp-sevilla).
// Lo usan el cron `/api/cron/crm-lead-hunter-sevilla` y el panel `/api/super/lead-hunter-sevilla`.

import type { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { construirEmail, esMovilEs, detectarVertical, construirInstagram } from '@/lib/crm-sevilla'
import { crmSecret } from '@/lib/crm-secret'

type SupabaseSrv = ReturnType<typeof createServerClient>

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Normaliza un email para comparar por DIRECCIÓN (minúsculas, sin espacios).
export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()

// Dedup POR DIRECCIÓN DE EMAIL (no por lead.id): dado un conjunto de emails
// candidatos, devuelve las direcciones que YA recibieron el email frío en
// ALGUNA fila de lead que las comparta. Cierra el hueco de un mismo local
// duplicado en dos leads distintos (el guard por lead.id no lo veía). Mira los
// dos caminos de envío vivos: `leads_web_tracking` (estado enviado_*) y el
// pipeline del cron `crm-envio-auto` (`estado_pipeline='enviado'` /
// `propuesta_enviada_at`). 'propuesto' y 'descartado' NO cuentan como enviado.
export async function emailsYaContactados(
  supabase: SupabaseSrv,
  emails: unknown[]
): Promise<Set<string>> {
  const uniq = [...new Set(emails.map(normEmail).filter(Boolean))]
  if (uniq.length === 0) return new Set()
  const { data: rows } = await supabase
    .from('leads')
    .select('id, email, propuesta_enviada_at, estado_pipeline')
    .in('email', uniq)
  const emailPorLead = new Map<string, string>()
  const contactados = new Set<string>()
  for (const r of (rows || []) as Array<{ id: string; email: string | null; propuesta_enviada_at: string | null; estado_pipeline: string | null }>) {
    const em = normEmail(r.email)
    if (!em) continue
    emailPorLead.set(r.id, em)
    if (r.propuesta_enviada_at || r.estado_pipeline === 'enviado') contactados.add(em) // camino cron auto
  }
  const ids = [...emailPorLead.keys()]
  if (ids.length > 0) {
    const { data: tr } = await supabase
      .from('leads_web_tracking')
      .select('lead_id, estado')
      .in('lead_id', ids)
    for (const t of (tr || []) as Array<{ lead_id: string; estado: string | null }>) {
      if (t.estado && t.estado !== 'propuesto' && t.estado !== 'descartado') {
        const em = emailPorLead.get(t.lead_id)
        if (em) contactados.add(em)
      }
    }
  }
  return contactados
}

// Envío automático activo por defecto; CRM_ENVIO_AUTO='0' vuelve al modo propuesta.
const envioAutomatico = () => process.env.CRM_ENVIO_AUTO !== '0'

// Versión texto plano del email (para previsualizarlo en Telegram).
export function emailATexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type LeadEmail = { id: string; nombre: string; email: string | null; tipo_negocio?: string | null }

// Envía el email frío de presentación (plantilla tipo por vertical) y actualiza
// tracking (propuesto → enviado_dia1) y lead (nuevo → contactado). Lanza si falla
// el envío: el tracking queda en 'propuesto' y se reintenta en la siguiente tanda.
async function enviarEmailFrio(supabase: SupabaseSrv, lead: LeadEmail): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('falta RESEND_API_KEY')
  const jwt = (await import('jsonwebtoken')).default
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const secret = crmSecret()
  const jwtToken = jwt.sign({ lead_id: lead.id, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, secret)
  const unsubToken = jwt.sign({ lead_id: lead.id }, secret)
  const unsubUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubToken}`
  const tpl = construirEmail(lead, jwtToken, unsubUrl)
  const r = await resend.emails.send({
    from: 'Alberto <hola@iarest.es>', to: lead.email!, subject: tpl.subject, html: tpl.html,
  }) as { error?: unknown }
  if (r.error) throw new Error(typeof r.error === 'string' ? r.error : JSON.stringify(r.error))

  await supabase.from('leads_web_tracking')
    .update({ estado: 'enviado_dia1', mensaje_dia1_at: new Date().toISOString() })
    .eq('lead_id', lead.id).eq('estado', 'propuesto')
  await supabase.from('leads')
    .update({ estado: 'contactado', ultima_actividad_at: new Date().toISOString() })
    .eq('id', lead.id).eq('estado', 'nuevo')
}

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

    // Dedup por dirección de email: no repetir a un correo ya contactado ni dos
    // veces al mismo correo dentro de esta tanda (aunque sean leads distintos).
    const yaContactados = await emailsYaContactados(supabase, leads.map((l: { email?: string | null }) => l.email))
    const enviadosEmails = new Set<string>()

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    const auto = envioAutomatico()
    let propuestos = 0
    let enviadosAuto = 0
    const nombresEnviados: string[] = []
    for (const lead of leads) {
      try {
        if ((auto ? enviadosAuto : propuestos) >= limite) break // tanda objetivo alcanzada
        if (tieneMovil.get(lead.id)) continue // tiene móvil → WhatsApp
        const em = normEmail(lead.email)
        if (em && (yaContactados.has(em) || enviadosEmails.has(em))) continue // esa dirección ya recibió el email
        if (em) enviadosEmails.add(em)

        const tpl = construirEmail(lead, '', '') // solo para asunto/utm en la propuesta
        // Marca como "propuesto" para que el RPC no lo vuelva a proponer (excluye leads con tracking).
        const { error: trackErr } = await supabase
          .from('leads_web_tracking')
          .insert({ lead_id: lead.id, estado: 'propuesto', utm_source: tpl.utm })
        if (trackErr) { console.error(`Tracking propuesto ${lead.nombre}:`, trackErr.message); continue }

        if (auto) {
          await enviarEmailFrio(supabase, lead) // si falla, queda 'propuesto' y se reintenta
          enviadosAuto++
          nombresEnviados.push(`${lead.nombre} (${lead.email})`)
          continue
        }

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
                `${esc(emailATexto(construirEmail(lead, '', '').html).slice(0, 400))}`,
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

    if (enviadosAuto > 0) {
      await tgAlert(
        `📨 Presentación enviada automáticamente a ${enviadosAuto} lead(s) de Sevilla desde hola@iarest.es:\n` +
        nombresEnviados.map((n) => `• ${n}`).join('\n'),
        'info'
      )
    }
    if (propuestos > 0) {
      await tgAlert(`📧 ${propuestos} email(s) de venta listos para aprobar (botón "Enviar" arriba).`, 'info')
    }
    // `enviados` se mantiene por compatibilidad con cron/panel.
    return { ok: true, enviados: auto ? enviadosAuto : propuestos, propuestos }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error lead-hunter-sevilla:', msg)
    await tgAlert(`🔴 CRM Lead Hunter ERROR: ${msg}`, 'critico')
    return { ok: false, enviados: 0, error: msg }
  }
}

// ── EMAILS POR VERTICAL (nacional) ─────────────────────────────────────────
// Email de PRESENTACIÓN/VENTA a leads de un vertical (franquicia, catering,
// eventos), a nivel NACIONAL, con email. En modo auto (por defecto) se ENVÍA
// directamente con la plantilla tipo y se resume por Telegram; con
// CRM_ENVIO_AUTO='0' se propone con botón "✅ Enviar" → callback enviar_sevilla.
const LABEL_VERTICAL: Record<string, { icono: string; sing: string; plur: string }> = {
  franquicia: { icono: '🏢', sing: 'Franquicia', plur: 'franquicia(s)' },
  catering: { icono: '🍽️', sing: 'Catering', plur: 'catering' },
  eventos: { icono: '💍', sing: 'Eventos', plur: 'espacio(s) de eventos' },
  restaurante: { icono: '🍴', sing: 'Restaurante/Bar', plur: 'restaurante(s)/bar(es)' },
}
export async function proponerEmailsVertical(
  supabase: SupabaseSrv,
  vertical: 'franquicia' | 'catering' | 'eventos' | 'restaurante',
  limite = 20
): Promise<{ ok: boolean; enviados: number; propuestos?: number; motivo?: string; error?: string }> {
  const lbl = LABEL_VERTICAL[vertical] || { icono: '📧', sing: 'Lead', plur: 'leads' }
  try {
    const { data: cand, error } = await supabase
      .from('leads')
      .select('id, nombre, email, tipo_negocio')
      .eq('tipo_negocio', vertical)
      .not('email', 'is', null)
      .neq('email', '')
      .neq('estado', 'descartado')
      .limit(limite * 4)
    if (error) throw new Error(error.message)
    if (!cand || cand.length === 0) {
      return { ok: true, enviados: 0, motivo: `Sin ${lbl.plur} con email pendientes` }
    }

    const ids = cand.map((l: { id: string }) => l.id)
    const [{ data: tr }, { data: baja }] = await Promise.all([
      supabase.from('leads_web_tracking').select('lead_id, estado').in('lead_id', ids),
      supabase.from('leads_unsubscribes').select('lead_id').in('lead_id', ids),
    ])
    const trackingEstado = new Map((tr || []).map((t: { lead_id: string; estado: string }) => [t.lead_id, t.estado]))
    const desuscrito = new Set((baja || []).map((b: { lead_id: string }) => b.lead_id))

    // Dedup por dirección de email: no repetir a un correo ya contactado ni dos
    // veces al mismo correo dentro de esta tanda (aunque sean leads distintos).
    const yaContactados = await emailsYaContactados(supabase, cand.map((l: { email?: string | null }) => l.email))
    const enviadosEmails = new Set<string>()

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    const auto = envioAutomatico()
    let propuestos = 0
    let enviadosAuto = 0
    const nombresEnviados: string[] = []
    for (const lead of cand) {
      try {
        if ((auto ? enviadosAuto : propuestos) >= limite) break
        if (desuscrito.has(lead.id)) continue
        const em = normEmail(lead.email)
        if (em && (yaContactados.has(em) || enviadosEmails.has(em))) continue // esa dirección ya recibió el email
        const trEstado = trackingEstado.get(lead.id)
        // Ya gestionado (enviado/descartado/…). En auto, un 'propuesto' pendiente
        // de la etapa de aprobación manual SÍ se envía (drena el backlog).
        if (trEstado && !(auto && trEstado === 'propuesto')) continue
        if (em) enviadosEmails.add(em) // marca la dirección para no repetirla en esta tanda

        const tpl = construirEmail(lead, '', '')
        if (!trEstado) {
          const { error: trackErr } = await supabase
            .from('leads_web_tracking')
            .insert({ lead_id: lead.id, estado: 'propuesto', utm_source: tpl.utm })
          if (trackErr) { console.error(`Tracking ${vertical} ${lead.nombre}:`, trackErr.message); continue }
        }

        if (auto) {
          await enviarEmailFrio(supabase, lead) // si falla, queda 'propuesto' y se reintenta
          enviadosAuto++
          nombresEnviados.push(`${lead.nombre} (${lead.email})`)
          continue
        }

        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              parse_mode: 'HTML',
              text: [
                `${lbl.icono} <b>${lbl.sing}: ${esc(lead.nombre)}</b>`,
                `✉️ ${esc(lead.email)}`,
                ``,
                `<b>Asunto:</b> ${esc(tpl.subject)}`,
                ``,
                `${esc(emailATexto(construirEmail(lead, '', '').html).slice(0, 400))}`,
                ``,
                `<i>Toca Enviar para mandar la presentación desde hola@iarest.es</i>`,
              ].join('\n'),
              reply_markup: { inline_keyboard: [[
                { text: '✅ Enviar email', callback_data: `enviar_sevilla:${lead.id}` },
                { text: '❌ Descartar', callback_data: `descartar_sevilla:${lead.id}` },
              ]] },
            }),
          }).catch((e) => console.error(`[${vertical}] telegram:`, e))
        }
        propuestos++
      } catch (err) {
        console.error(`Error ${vertical} ${lead.id}:`, err)
        continue
      }
    }

    if (enviadosAuto > 0) {
      await tgAlert(
        `${lbl.icono} Presentación enviada automáticamente a ${enviadosAuto} ${lbl.plur} desde hola@iarest.es:\n` +
        nombresEnviados.map((n) => `• ${n}`).join('\n'),
        'info'
      )
    }
    if (propuestos > 0) {
      await tgAlert(`${lbl.icono} ${propuestos} ${lbl.plur} listos para aprobar (botón "Enviar" arriba).`, 'info')
    }
    return { ok: true, enviados: auto ? enviadosAuto : propuestos, propuestos }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error(`Error emails ${vertical}:`, msg)
    await tgAlert(`🔴 CRM ${lbl.sing} ERROR: ${msg}`, 'critico')
    return { ok: false, enviados: 0, error: msg }
  }
}

// Wrapper de compatibilidad: franquicias (lo usa /api/super/lead-hunter-franquicia).
export async function proponerEmailsFranquicia(supabase: SupabaseSrv, limite = 20) {
  return proponerEmailsVertical(supabase, 'franquicia', limite)
}

// ── INSTAGRAM (Sevilla) ────────────────────────────────────────────────────
// Propone DMs de Instagram (envío MANUAL) a leads de Sevilla de un vertical
// (catering / eventos): por cada uno, mensaje a Telegram con botón "Abrir
// Instagram" + el DM para copiar. Marca instagram_outreach_at al proponer
// (como WhatsApp) para no repetir.
export async function proponerInstagramSevilla(
  supabase: SupabaseSrv,
  vertical: 'catering' | 'eventos' = 'catering',
  limite = 15
): Promise<{ ok: boolean; enviados: number; motivo?: string; error?: string }> {
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, nombre, empresa, tipo_negocio, web')
      .ilike('ciudad', '%Sevilla%')
      .eq('tipo_negocio', vertical)
      .is('instagram_outreach_at', null)
      .neq('estado', 'descartado')
      .limit(limite)
    if (error) throw new Error(error.message)
    if (!leads || leads.length === 0) {
      return { ok: true, enviados: 0, motivo: `Sin ${vertical} de Sevilla pendientes por Instagram` }
    }

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID

    let enviados = 0
    for (const lead of leads) {
      try {
        const nombre = (lead.nombre || lead.empresa || 'Catering') as string
        const ig = construirInstagram({ id: lead.id, nombre, tipo_negocio: lead.tipo_negocio, web: lead.web })
        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              parse_mode: 'HTML',
              text: [
                `📸 <b>Instagram: ${esc(nombre)}</b>`,
                ``,
                `<i>Toca el mensaje para copiarlo y pégalo en su DM:</i>`,
                `<code>${esc(ig.texto)}</code>`,
              ].join('\n'),
              reply_markup: { inline_keyboard: [[{ text: '📸 Abrir Instagram', url: ig.link }]] },
            }),
          }).catch((e) => console.error('[instagram] telegram:', e))
        }
        await supabase.from('leads').update({ instagram_outreach_at: new Date().toISOString() }).eq('id', lead.id)
        enviados++
      } catch (e) {
        console.error('instagram lead', lead.id, e); continue
      }
    }
    if (enviados > 0) await tgAlert(`📸 ${enviados} ${vertical} listos para DM de Instagram (arriba).`, 'info')
    return { ok: true, enviados }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error instagram sevilla:', msg)
    return { ok: false, enviados: 0, error: msg }
  }
}

// ── REENVIAR PENDIENTES ────────────────────────────────────────────────────
// Re-emite mensajes de Telegram (con botón Enviar) para las propuestas que siguen
// en 'propuesto' (p.ej. quedaron sin enviar). NO crea filas nuevas: reutiliza las
// existentes, así que no duplica nada.
export async function reenviarPropuestasPendientes(
  supabase: SupabaseSrv,
  limite = 30
): Promise<{ ok: boolean; reenviados: number; motivo?: string; error?: string }> {
  try {
    const { data: rows, error } = await supabase
      .from('leads_web_tracking')
      .select('lead_id')
      .eq('estado', 'propuesto')
      .limit(limite)
    if (error) throw new Error(error.message)
    if (!rows || rows.length === 0) return { ok: true, reenviados: 0, motivo: 'No hay propuestas pendientes' }

    const ids = rows.map((r: { lead_id: string }) => r.lead_id)
    const { data: leads } = await supabase
      .from('leads').select('id, nombre, email, tipo_negocio').in('id', ids)

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat = process.env.TELEGRAM_CHAT_ID
    let reenviados = 0
    for (const lead of leads || []) {
      try {
        if (!lead.email) continue
        const tpl = construirEmail(lead, '', '')
        const esFranq = detectarVertical(lead.tipo_negocio) === 'franquicia'
        if (token && chat) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              parse_mode: 'HTML',
              text: [
                `${esFranq ? '🏢' : '📧'} <b>${esFranq ? 'Franquicia' : 'Email'}: ${esc(lead.nombre)}</b>`,
                `✉️ ${esc(lead.email)}`,
                ``,
                `<b>Asunto:</b> ${esc(tpl.subject)}`,
                ``,
                `<i>(Reenvío) Toca Enviar para mandarlo desde hola@iarest.es</i>`,
              ].join('\n'),
              reply_markup: { inline_keyboard: [[
                { text: '✅ Enviar email', callback_data: `enviar_sevilla:${lead.id}` },
                { text: '❌ Descartar', callback_data: `descartar_sevilla:${lead.id}` },
              ]] },
            }),
          }).catch((e) => console.error('[reenvio] telegram:', e))
        }
        reenviados++
      } catch (e) {
        console.error('reenvio lead', lead.id, e); continue
      }
    }
    if (reenviados > 0) await tgAlert(`🔁 ${reenviados} propuesta(s) reenviadas para aprobar (arriba).`, 'info')
    return { ok: true, reenviados }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    console.error('Error reenviar pendientes:', msg)
    return { ok: false, reenviados: 0, error: msg }
  }
}
