import { NextResponse } from 'next/server'
import { z } from 'zod'

import { suscribirDeSesion } from '@/lib/push-suscripcion'

export const runtime = 'nodejs'

const Cuerpo = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

/**
 * POST /api/push/suscribir — el navegador manda su `PushSubscription` tras pedir permiso.
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` la lee el cliente directamente (env pública); esta ruta solo
 * guarda lo que llega, con la identidad de la COOKIE.
 */
export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })

  const r = await suscribirDeSesion(parsed.data)
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 401 })
  return NextResponse.json({ ok: true })
}
