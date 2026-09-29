import { NextResponse } from 'next/server'
import { z } from 'zod'

import { pedirCodigoCambioCuentaDeSesion } from '@/lib/verificar-cuenta'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos/cuenta/codigo — manda el código para confirmar la cuenta nueva al correo de
 * acceso que escribe el cliente (tiene que ser uno con el que YA entra). La identidad sale de la cookie.
 */
const Entrada = z.object({ iban: z.string().min(10).max(60), email: z.string().min(3).max(255) })

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'iban_invalido' }, { status: 400 })
  const r = await pedirCodigoCambioCuentaDeSesion(parsed.data.email, parsed.data.iban)
  const status = r === 'codigo_enviado' ? 200 : r === 'sin_sesion' ? 401 : r === 'demasiados' ? 429 : r === 'envio_fallido' ? 502 : 422
  return NextResponse.json({ estado: r }, { status })
}
