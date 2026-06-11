// lib/qr-notify.ts — Avisa al CLIENTE QR cuando su pedido pasa a 'lista'.
// ---------------------------------------------------------------------------
// La "Capa 1" (aviso dentro de la propia página /q/[token]) la resuelve el
// cliente por polling — no pasa por aquí. Este helper dispara los canales que
// SOLO pueden lanzarse desde servidor cuando la cocina marca la comanda lista:
//   · web_push  → notificación push aunque el cliente tenga la pestaña cerrada
//   · whatsapp  → ENCHUFABLE (se envía solo si hay credenciales en env)
//
// Best-effort: NUNCA lanza. No debe romper el flujo de /api/marchar ni de KDS.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsApp, whatsappConfigurado } from './whatsapp'
import { sendWebPush } from '@central/core-push'

// Mismas claves VAPID que /api/push/send (fallback a las reales del proyecto).
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  || 'BKLVkE3Cz7RjzFoSqOdmdXQOaRyoh6lNLPEtMNsA-xATgG-6q6MqbwA2NQkcRk5EWQLbpdaagD_o918fWOwmUbc'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
  || 'g9A32b3wnr_c4Q0ZHtOAllFxwB4ez8TXiH1v1PdXH88'

const VAPID = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@ia.rest' }

/**
 * Notifica al cliente que su comanda QR está lista, por los canales que tenga
 * suscritos (web push / WhatsApp). Si la comanda no es de origen QR, no hace nada.
 */
export async function notificarClienteQrListo(
  supabase: SupabaseClient,
  comandaId: string,
  origin?: string,
): Promise<void> {
  try {
    // 1. ¿Es una comanda hecha desde el QR del cliente? Si no, nadie espera aviso.
    const { data: comanda } = await supabase
      .from('comandas')
      .select('id, origen')
      .eq('id', comandaId)
      .maybeSingle()
    if (!comanda || comanda.origen !== 'qr_cliente') return

    // 2. Suscripciones pendientes de avisar para esta comanda.
    const { data: subs } = await supabase
      .from('qr_avisos_suscripciones')
      .select('id, canal, subscription, destino, token')
      .eq('comanda_id', comandaId)
      .eq('notificado', false)
    if (!subs?.length) return

    const base = (origin || 'https://www.iarest.es').replace(/\/$/, '')
    const procesadas: string[] = []

    for (const sub of subs as Array<{
      id: string; canal: string; subscription: string | null; destino: string | null; token: string | null
    }>) {
      const link = sub.token ? `${base}/q/${sub.token}` : base
      try {
        if (sub.canal === 'web_push' && sub.subscription) {
          const payload = JSON.stringify({
            title: '✅ ¡Tu pedido está listo!',
            body: 'Ya puedes recogerlo. ¡Que aproveche!',
            tag: `qr-listo-${comandaId}`,
            data: { url: link, tipo: 'qr_listo' },
          })
          const res = await sendWebPush(VAPID, JSON.parse(sub.subscription), payload)
          if (res.ok) procesadas.push(sub.id)
          else if (res.gone) await supabase.from('qr_avisos_suscripciones').delete().eq('id', sub.id)
          else console.error('[qr-notify] envío falló:', res.error)
        } else if (sub.canal === 'whatsapp' && sub.destino && whatsappConfigurado()) {
          const r = await sendWhatsApp(
            sub.destino,
            `✅ ¡Tu pedido ya está listo! Puedes recogerlo cuando quieras. ${link}`,
          )
          if (r.ok) procesadas.push(sub.id)
        }
      } catch (e) {
        // Suscripción push caducada → limpiar para no reintentar siempre.
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 410 || code === 404) {
          await supabase.from('qr_avisos_suscripciones').delete().eq('id', sub.id)
        } else {
          console.error('[qr-notify] envío falló:', e)
        }
      }
    }

    if (procesadas.length) {
      // RGPD / minimización: en cuanto se envía el aviso, el dato (push o teléfono)
      // ya no hace falta → se BORRA. Solo vive los minutos entre "pedir aviso" y
      // "pedido listo". Lo que falle queda para reintento y lo barre el TTL del cron.
      await supabase
        .from('qr_avisos_suscripciones')
        .delete()
        .in('id', procesadas)
    }
  } catch (e) {
    console.error('[qr-notify] error general:', e)
  }
}
