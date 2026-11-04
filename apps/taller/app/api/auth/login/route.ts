import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { conTaller } from '@/lib/db'
import { loginTaller, tallerDelDespliegue } from '@/lib/login'
import { COOKIE_NAME, COOKIE_OPTS, emitirCookie } from '@/lib/sesion-cookie'

const Body = z.object({ pin: z.string() })

export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const ahora = new Date()
  // F1: un taller por despliegue (TALLER_PILOTO_ID, uuid). Sin él no hay login (falla cerrado, nunca un taller por defecto).
  const tallerId = tallerDelDespliegue()
  if (!tallerId) return NextResponse.json({ error: 'Taller no configurado' }, { status: 503 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'

  // Bloqueo persistente (taller:ip) y verificación en UNA transacción con RLS del taller (lib/login.ts).
  const r = await loginTaller(conTaller, { tallerId, ip, pin: body.data.pin, ahora })
  if (!r.ok) {
    if (r.motivo === 'formato') return NextResponse.json({ error: 'El PIN son 4 dígitos' }, { status: 400 })
    if (r.motivo === 'bloqueado')
      return NextResponse.json({ error: `Demasiados intentos. Prueba en ${r.minutos} min` }, { status: 429 })
    return NextResponse.json({ error: `PIN incorrecto. Te quedan ${r.intentosRestantes}` }, { status: 401 })
  }
  const token = await emitirCookie(
    { tallerId, usuarioId: r.credencial.usuarioId, rol: String(r.credencial.rol) },
    ahora,
  )
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
