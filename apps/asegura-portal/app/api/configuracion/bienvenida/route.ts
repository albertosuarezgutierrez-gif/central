import { NextResponse } from 'next/server'
import { z } from 'zod'

import { posponerBienvenidaDeSesion } from '@/lib/avisos-preferencias'

export const runtime = 'nodejs'

const Cuerpo = z.object({ vista: z.enum(['inactivas', 'instalar_ios']) })

/**
 * POST /api/configuracion/bienvenida (13/10/2026) — «Ahora no» en la bienvenida de avisos. Se guarda
 * en la BD por identidad: no se vuelve a preguntar en 14 días en NINGÚN dispositivo
 * (`decidirBienvenidaAvisos`), salvo que se dijera a la guía de instalar en iPhone y ya esté instalada.
 */
export async function POST(req: Request) {
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  const ok = await posponerBienvenidaDeSesion(parsed.data.vista)
  if (!ok) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
