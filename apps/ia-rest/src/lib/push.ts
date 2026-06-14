// lib/push.ts — envío de Web Push server-side reutilizable (mismo canal que /api/push/send).
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWebPush } from '@central/core-push'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  || 'BKLVkE3Cz7RjzFoSqOdmdXQOaRyoh6lNLPEtMNsA-xATgG-6q6MqbwA2NQkcRk5EWQLbpdaagD_o918fWOwmUbc'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
  || 'g9A32b3wnr_c4Q0ZHtOAllFxwB4ez8TXiH1v1PdXH88'
const VAPID = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@ia.rest' }

/**
 * Envía un Web Push a todo el personal de un local con alguno de los `roles` dados.
 * Fire-and-forget seguro: nunca lanza (errores se registran). Devuelve nº enviados.
 */
export async function enviarPushARoles(opts: {
  supabase: SupabaseClient
  localId: string
  roles: string[]
  title: string
  body: string
  data?: Record<string, unknown>
}): Promise<number> {
  const { supabase, localId, roles, title, body, data } = opts
  try {
    const { data: cams } = await supabase
      .from('personal').select('id').eq('local_id', localId).in('rol', roles).eq('activo', true)
    const ids = (cams ?? []).map((c: { id: string }) => c.id)
    if (!ids.length) return 0

    const { data: subs } = await supabase
      .from('push_subscriptions').select('*').eq('local_id', localId).in('camarero_id', ids)
    if (!subs?.length) return 0

    const payload = JSON.stringify({ title, body, data: data || {} })
    let sent = 0
    await Promise.all((subs).map(async (row: { id: string; subscription: string }) => {
      try {
        const sub = JSON.parse(row.subscription)
        const res = await sendWebPush(VAPID, sub, payload)
        if (res.ok) sent++
        else if (res.gone) await supabase.from('push_subscriptions').delete().eq('id', row.id)
      } catch (e) { console.error('[push] envío fallido:', e) }
    }))
    return sent
  } catch (e) {
    console.error('[push] enviarPushARoles error:', e)
    return 0
  }
}
