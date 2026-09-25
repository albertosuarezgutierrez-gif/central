import { NextResponse } from 'next/server'
import { z } from 'zod'

import { pedirCodigoCambioCorreoDeSesion } from '@/lib/verificar-correo'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos/codigo-correo — manda un código al correo NUEVO que el cliente quiere poner
 * en su ficha. Sin ese código, `/api/mis-datos` y `/api/mis-datos/contactos` no lo guardan (ver
 * `lib/verificar-correo.ts`). La identidad sale de la cookie.
 */
const Entrada = z.object({ email: z.string().min(3).max(255) })

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'invalido' }, { status: 400 })
  const r = await pedirCodigoCambioCorreoDeSesion(parsed.data.email)
  const status = r === 'codigo_enviado' ? 200 : r === 'sin_sesion' ? 401 : r === 'invalido' ? 422 : r === 'demasiados' ? 429 : 502
  return NextResponse.json({ estado: r }, { status })
}
