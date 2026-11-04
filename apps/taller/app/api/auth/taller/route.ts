import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tallerPorCodigoBd } from '@/lib/db'
import { normalizarCodigoTaller } from '@/lib/codigo-taller'
import { COOKIE_DISPOSITIVO, cookieDispositivoOpts, emitirCookieDispositivo } from '@/lib/dispositivo'

// Paso 1 del login: el código del taller. Si existe, el dispositivo lo recuerda (cookie firmada con el CÓDIGO, no con el id).
// DELETE = «no es mi taller»: el dispositivo lo olvida. Misma respuesta para código mal escrito y código inexistente.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const b = z.object({ codigo: z.string().max(40) }).safeParse(await req.json().catch(() => ({})))
  const codigo = b.success ? normalizarCodigoTaller(b.data.codigo) : null
  const id = codigo ? await tallerPorCodigoBd(codigo).catch(() => null) : null
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
