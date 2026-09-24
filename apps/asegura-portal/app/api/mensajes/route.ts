import { NextResponse } from 'next/server'

import { enviarMensajeDeSesion } from '@/lib/mensajes'

export const runtime = 'nodejs'

/**
 * POST /api/mensajes — el cliente escribe a su corredor ({ polizaId?, cuerpo }). La ficha sale de la
 * sesión (`lib/mensajes.ts`), nunca del cuerpo. El tope diario lo cuenta la BD, no la memoria.
 */
const STATUS: Record<string, number> = {
  enviado: 201, invalido: 400, poliza_no_valida: 422, limite_diario: 429, sin_ficha: 409,
  varias_fichas: 409, sin_sesion: 401, modo_corredor: 403,
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { polizaId?: unknown; cuerpo?: unknown } | null
  try {
    const r = await enviarMensajeDeSesion(b?.polizaId ?? null, b?.cuerpo)
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
  } catch (e) {
    console.error('[api/mensajes] fallo al guardar:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
