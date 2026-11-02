export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// Botón «📱 Telegram» del Lead Hunter (/super). Antes el NAVEGADOR llamaba a la Edge Function
// tg-send con un secreto literal escrito en el bundle → cualquiera podía escribir al chat de
// Alberto. Ahora: sesión firmada super_admin aquí, y el secreto `TG_SEND_SECRET` solo viaja
// servidor→Supabase. Sin la variable → 503 (fail-closed), nunca un literal de reserva.
// A diferencia de /api/super/tg-notify (tgAlert → resumen diario por email), esto es Telegram
// inmediato con HTML: el mensaje lleva botón de decisión para Alberto.

const MAX_MENSAJE = 4000

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const secreto = process.env.TG_SEND_SECRET?.trim()
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  if (!secreto || !base) {
    return NextResponse.json({ error: 'Telegram no configurado (TG_SEND_SECRET)' }, { status: 503 })
  }

  let mensaje: unknown
  try { ({ mensaje } = await req.json()) } catch { mensaje = null }
  if (typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > MAX_MENSAJE) {
    return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
  }

  try {
    const r = await fetch(`${base}/functions/v1/tg-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secreto },
      body: JSON.stringify({ mensaje }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data?.ok === false) {
      return NextResponse.json({ ok: false, error: 'tg-send rechazó el envío', status: r.status }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'tg-send no responde' }, { status: 502 })
  }
}
