import { NextResponse } from 'next/server'
import { z } from 'zod'
import { TIPOS_AVISO_INTERRUPTOR } from '@central/module-seguros-portal'

import { cambiarPreferenciaDeSesion, preferenciasDeSesion } from '@/lib/avisos-preferencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET/POST /api/push/preferencias — qué avisos (CIMA: recibos, siniestros…; y la caducidad del carné) quiere el cliente. */
export async function GET() {
  const p = await preferenciasDeSesion()
  if (!p) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ preferencias: p })
}

const Cuerpo = z.object({ tipo: z.enum(TIPOS_AVISO_INTERRUPTOR), activo: z.boolean() })

export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  let ok: boolean
  try {
    ok = await cambiarPreferenciaDeSesion(parsed.data.tipo, parsed.data.activo)
  } catch (e) {
    // P. ej. el CHECK de `portal_aviso_silenciado` sin ampliar (23514): se dice, no se finge que se guardó.
    console.error('[push/preferencias] no se pudo guardar:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'no_guardado' }, { status: 503 })
  }
  if (!ok) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
