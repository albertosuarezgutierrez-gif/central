/**
 * GET /api/cron/reservas-noshow
 * Vercel Cron: cada 5 minutos (schedule: "star/5 * * * *" en vercel.json)
 *
 * 1. Llama a la función SQL `liberar_reservas_vencidas()`
 *    que marca como no_show las reservas pasada la hora + tiempo_gracia
 * 2. Envía push notification al owner/jefe de cada restaurante afectado
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  // ── Liberar reservas vencidas ──────────────────────────────────
  const { data: liberadas, error } = await supabase
    .rpc('liberar_reservas_vencidas')

  if (error) {
    console.error('[reservas-noshow] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!liberadas || liberadas.length === 0) {
    return NextResponse.json({ ok: true, liberadas: 0 })
  }

  console.log(`[reservas-noshow] ${liberadas.length} reservas marcadas como no_show`)

  // ── Notificar a owner/jefe de sala de cada restaurante ─────────
  type Liberada = { reserva_id: string; restaurante_id: string; mesa_id: string | null; nombre_cliente: string }
  const byRest: Record<string, Liberada[]> = {}
  for (const r of liberadas as Liberada[]) {
    if (!byRest[r.restaurante_id]) byRest[r.restaurante_id] = []
    byRest[r.restaurante_id].push(r)
  }

  const pushUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.iarest.es'}/api/push/send`

  for (const [restaurante_id, reservasRest] of Object.entries(byRest)) {
    const nombres = reservasRest.map(r => r.nombre_cliente).join(', ')
    const msg = reservasRest.length === 1
      ? `No-show: ${nombres} no ha llegado. Mesa liberada.`
      : `No-show: ${reservasRest.length} reservas vencidas (${nombres}). Mesas liberadas.`

    try {
      await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ia-restaurante-id': restaurante_id,
        },
        body: JSON.stringify({
          restaurante_id,
          roles:  ['owner', 'jefe_sala'],
          title:  'Reserva no presentada',
          body:   msg,
          data:   { tipo: 'noshow' },
        }),
      })
    } catch (e) {
      console.error(`[reservas-noshow] Push error rest ${restaurante_id}:`, e)
    }
  }

  return NextResponse.json({ ok: true, liberadas: liberadas.length })
}
