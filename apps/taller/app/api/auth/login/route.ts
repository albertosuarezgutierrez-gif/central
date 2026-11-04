import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { conTaller } from '@/lib/db'
import { tallerDelDispositivo } from '@/lib/dispositivo-servidor'
import { loginTaller, politicaSesion } from '@/lib/login'
import { COOKIE_NAME, cookieOpts, emitirCookie } from '@/lib/sesion-cookie'

const Body = z.object({ usuarioId: z.string().max(64), pin: z.string() })

// Paso 3 del login: taller (del dispositivo) → usuario elegido → PIN de ESE usuario.
export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const ahora = new Date()
  // El taller sale del código que recuerda el dispositivo; sin él no hay login (falla cerrado, nunca un taller por defecto).
  const tallerId = await tallerDelDispositivo()
  if (!tallerId) return NextResponse.json({ error: 'Este dispositivo no tiene taller. Escribe el código del taller' }, { status: 503 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'

  // Bloqueos (taller, persona, IP) y verificación en UNA transacción con RLS del taller (lib/login.ts).
  const r = await loginTaller(conTaller as never, { tallerId, usuarioId: body.data.usuarioId, ip, pin: body.data.pin, ahora })
  if (!r.ok) {
    if (r.motivo === 'usuario') return NextResponse.json({ error: 'Elige tu nombre de la lista' }, { status: 401 })
    if (r.motivo === 'formato') return NextResponse.json({ error: 'El PIN son 4 dígitos' }, { status: 400 })
    if (r.motivo === 'bloqueado') {
      const quien = r.ambito === 'usuario' ? 'Esta persona está bloqueada' : r.ambito === 'taller' ? 'El taller está bloqueado' : 'Demasiados intentos'
      return NextResponse.json({ error: `${quien}. Prueba en ${r.minutos} min` }, { status: 429 })
    }
    return NextResponse.json({ error: `PIN incorrecto. Te quedan ${r.intentosRestantes}` }, { status: 401 })
  }
  // Duración de la sesión e inactividad: de la configuración del taller (editable por el dueño).
  const pol = await politicaSesion(conTaller as never, tallerId)
  const token = await emitirCookie(
    { tallerId, usuarioId: r.credencial.usuarioId, rol: String(r.credencial.rol), sv: Number(r.credencial.sesionVersion ?? 0) },
    ahora, pol,
  )
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, cookieOpts(pol.sesionMinutos))
  return res
}
