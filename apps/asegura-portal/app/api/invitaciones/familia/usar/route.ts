import { NextResponse } from 'next/server'
import { z } from 'zod'

import { registrarEntradaFamiliaDeSesion } from '@/lib/invitar-familia-bd'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const Entrada = z.object({ token: z.string().min(1).max(200) })

/**
 * La persona que entró por el enlace avisa de que ya tiene sesión. Respuesta ÚNICA (`ok`) pase lo que pase:
 * quien llama no aprende si el enlace existía, si era suyo o si ya tenía cuenta.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  try {
    await registrarEntradaFamiliaDeSesion(parsed.data.token)
  } catch (e) {
    console.error('[portal/invitar-familia] no se pudo registrar la entrada:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}
