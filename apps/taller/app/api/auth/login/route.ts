import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loginConPin } from '@central/core-identity/pin'
import { pinStore } from '@/lib/pin-store'
import { tallerPilotoId } from '@/lib/marca'
import { COOKIE_NAME, COOKIE_OPTS, emitirCookie } from '@/lib/sesion-cookie'

const Body = z.object({ pin: z.string() })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const ahora = new Date()
  // TODO(F1): el taller saldrá del subdominio/selección; hoy, el piloto por configuración.
  const tallerId = tallerPilotoId()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'

  const r = await loginConPin(pinStore, {
    tenantId: tallerId,
    claveBloqueo: `${tallerId}:${ip}`,
    pin: body.data.pin,
    ahora,
  })
  if (!r.ok) {
    if (r.motivo === 'formato') return NextResponse.json({ error: 'El PIN son 4 dígitos' }, { status: 400 })
    if (r.motivo === 'bloqueado')
      return NextResponse.json({ error: `Demasiados intentos. Prueba en ${r.minutos} min` }, { status: 429 })
    return NextResponse.json({ error: `PIN incorrecto. Te quedan ${r.intentosRestantes}` }, { status: 401 })
  }
  const token = await emitirCookie(
    { tallerId, usuarioId: r.credencial.usuarioId, rol: r.credencial.rol ?? 'mecanico' },
    ahora,
  )
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
