import { NextResponse } from 'next/server'
import { z } from 'zod'
import { TIPOS_AVISO_CIMA } from '@central/module-seguros-portal'

import { cambiarPreferenciaDeSesion, preferenciasDeSesion } from '@/lib/avisos-preferencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET/POST /api/push/preferencias — qué avisos de CIMA (recibos, siniestros) quiere el cliente. */
export async function GET() {
  const p = await preferenciasDeSesion()
  if (!p) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ preferencias: p })
}

const Cuerpo = z.object({ tipo: z.enum(TIPOS_AVISO_CIMA), activo: z.boolean() })

export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  const ok = await cambiarPreferenciaDeSesion(parsed.data.tipo, parsed.data.activo)
  if (!ok) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
