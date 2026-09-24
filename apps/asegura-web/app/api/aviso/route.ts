import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/aviso?accion=solicitar|confirmar|baja — reenvío a plataforma, como `/api/lead`.
// Mismo defecto que ahí (el origen REAL de plataforma) y por la misma razón: una env que falta no
// puede dejar el canal mudo. Se propaga la IP del visitante: sin ella el límite por IP de
// plataforma sería uno global y el séptimo visitante de la hora se quedaría fuera.
const PLATAFORMA_URL = (process.env.PLATAFORMA_URL || 'https://plataforma-ten-flame.vercel.app').replace(/\/+$/, '')
const ACCIONES = new Set(['solicitar', 'confirmar', 'baja'])

export async function POST(req: NextRequest) {
  const accion = req.nextUrl.searchParams.get('accion') ?? ''
  if (!ACCIONES.has(accion)) return NextResponse.json({ ok: false, motivo: 'Acción no válida.' }, { status: 400 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  try {
    const res = await fetch(`${PLATAFORMA_URL}/api/publico/correduria/aviso?accion=${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: await req.text(),
      signal: AbortSignal.timeout(15_000),
    })
    const json = await res.json().catch(() => ({ ok: false, motivo: 'Respuesta no válida del servidor.' }))
    return NextResponse.json(json, { status: res.status })
  } catch {
    console.error('[aviso] el reenvío a plataforma no llegó a completarse')
    return NextResponse.json({ ok: false, motivo: 'No hemos podido completarlo. Inténtalo de nuevo en un momento.' }, { status: 502 })
  }
}
