import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { sendWebPush } from '@central/core-push'

export const dynamic = 'force-dynamic'

// VAPID keys — set via Vercel env vars en producción
// Fallback = VAPID keys reales generadas para este proyecto (BKLVkE3...)
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  || 'BKLVkE3Cz7RjzFoSqOdmdXQOaRyoh6lNLPEtMNsA-xATgG-6q6MqbwA2NQkcRk5EWQLbpdaagD_o918fWOwmUbc'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
  || 'g9A32b3wnr_c4Q0ZHtOAllFxwB4ez8TXiH1v1PdXH88'

const VAPID = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:hola@ia.rest' }

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed — usa POST' }, { status: 405 })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { title, body, mesa, camarero_ids, camarero_id, roles, restaurante_id: ridOverride, data } = await req.json()

  // Resolver local_id: header tiene prioridad, pero crons pueden pasarlo en el body
  const restauranteId = rid !== '00000000-0000-0000-0000-000000000001' ? rid : (ridOverride ?? rid)

  // Aceptar tanto camarero_id (singular, desde KDS) como camarero_ids (plural)
  const ids: string[] = camarero_ids?.length ? camarero_ids : camarero_id ? [camarero_id] : []

  // Si se pasan roles, obtener los IDs de camareros con esos roles
  let rolesIds: string[] = []
  if (roles?.length && !ids.length) {
    const { data: cams } = await supabase
      .from('personal')
      .select('id')
      .eq('local_id', restauranteId)
      .in('rol', roles)
      .eq('activo', true)
    rolesIds = (cams ?? []).map((c: { id: string }) => c.id)
  }

  const finalIds = ids.length > 0 ? ids : rolesIds

  // Filtrar suscripciones por restaurante (multi-tenant) + ids si se pasan
  let query = supabase.from('push_subscriptions').select('*').eq('local_id', restauranteId)
  if (finalIds.length) query = query.in('camarero_id', finalIds)
  const { data: subs, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title: title || 'ia.rest', body, mesa, data: data || {} })
  let sent = 0

  await Promise.all(
    subs.map(async (row) => {
      try {
        const sub = JSON.parse(row.subscription)
        const res = await sendWebPush(VAPID, sub, payload)
        if (res.ok) {
          sent++
        } else if (res.gone) {
          // Suscripción expirada (404/410) — limpiar
          await supabase.from('push_subscriptions').delete().eq('id', row.id)
        } else {
          console.error('[PUSH] sendNotification error:', res.error)
        }
      } catch (err: unknown) {
        // p.ej. subscription mal formada en BD
        console.error('[PUSH] sendNotification error:', err)
      }
    })
  )

  return NextResponse.json({ ok: true, sent })
}
