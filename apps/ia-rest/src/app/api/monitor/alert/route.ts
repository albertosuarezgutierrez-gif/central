import { NextRequest, NextResponse } from 'next/server'
import { notifyError } from '@/lib/notify'
import { getRestauranteId } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const rid = getRestauranteId(req)
    const { tipo, modulo, mensaje, detalle, nivel = 'aviso' } = await req.json()
    if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })
    notifyError({ tipo: tipo || 'frontend_error', modulo: modulo || 'sistema', mensaje, detalle: detalle || {}, restaurante_id: rid || null, nivel })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 500 }) }
}
