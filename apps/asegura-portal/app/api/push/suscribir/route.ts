import { NextResponse } from 'next/server'
import { z } from 'zod'

import { VERSION_TEXTO_AVISOS } from '@central/module-seguros-portal'

import { suscribirDeSesion } from '@/lib/push-suscripcion'

export const runtime = 'nodejs'

const Cuerpo = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  // 🚨 La versión del texto de consentimiento que la pantalla enseñó junto al botón (13/10/2026).
  // Sin ella (o con otra) no se suscribe: así no nace una fila `avisos` sobre un texto que nadie vio.
  consentimiento: z.literal(VERSION_TEXTO_AVISOS),
})

/**
 * POST /api/push/suscribir — el navegador manda su `PushSubscription` tras pedir permiso.
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` la lee el cliente directamente (env pública); esta ruta solo
 * guarda lo que llega, con la identidad de la COOKIE, y sella el consentimiento `avisos`.
 */
export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })

  const r = await suscribirDeSesion({ endpoint: parsed.data.endpoint, keys: parsed.data.keys }, {
    forwardedFor: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 401 })
  return NextResponse.json({ ok: true })
}
