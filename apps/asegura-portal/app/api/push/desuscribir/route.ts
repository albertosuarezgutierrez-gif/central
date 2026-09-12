import { NextResponse } from 'next/server'
import { z } from 'zod'

import { desuscribirDeSesion } from '@/lib/push-suscripcion'

export const runtime = 'nodejs'

const Cuerpo = z.object({ endpoint: z.string().url() })

/** POST /api/push/desuscribir — el navegador ya no quiere avisos push en este dispositivo. */
export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  await desuscribirDeSesion(parsed.data.endpoint)
  return NextResponse.json({ ok: true })
}
