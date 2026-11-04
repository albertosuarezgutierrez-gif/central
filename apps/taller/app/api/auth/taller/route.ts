import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tallerPorCodigoLimitado } from '@/lib/db'
import { normalizarCodigoTaller } from '@/lib/codigo-taller'
import { COOKIE_DISPOSITIVO, cookieDispositivoOpts, emitirCookieDispositivo } from '@/lib/dispositivo'

// Paso 1 del login: el código del taller. Si existe, el dispositivo lo recuerda (cookie firmada con el CÓDIGO, no con el id).
// Máx. 10 fallos/15 min por IP → bloqueo 1 h (lib/limite-codigo.ts); misma respuesta que un código inexistente.
// DELETE = «no es mi taller»: el dispositivo lo olvida. Misma respuesta para código mal escrito y código inexistente.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'
  const b = z.object({ codigo: z.string().max(40) }).safeParse(await req.json().catch(() => ({})))
  const codigo = b.success ? normalizarCodigoTaller(b.data.codigo) : null
  const id = codigo ? await tallerPorCodigoLimitado(codigo, ip, new Date()).catch(() => null) : null
  if (!codigo || !id) return NextResponse.json({ error: 'Código no válido' }, { status: 404 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_DISPOSITIVO, await emitirCookieDispositivo(codigo), cookieDispositivoOpts())
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_DISPOSITIVO, '', { ...cookieDispositivoOpts(), maxAge: 0 })
  return res
}
