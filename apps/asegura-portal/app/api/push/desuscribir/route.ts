import { NextResponse } from 'next/server'
import { z } from 'zod'

import { desuscribirDeSesion } from '@/lib/push-suscripcion'

export const runtime = 'nodejs'

const Cuerpo = z.object({ endpoint: z.string().url() })

/** POST /api/push/desuscribir — el navegador ya no quiere avisos push en este dispositivo. */
export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  await desuscribirDeSesion(parsed.data.endpoint, {
    forwardedFor: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })
  return NextResponse.json({ ok: true })
}
