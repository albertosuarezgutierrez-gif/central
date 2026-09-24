import { NextResponse } from 'next/server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { llamarPuenteSolicitud } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/datos — el cliente manda los datos del enlace de presupuesto (24/09/2026).
 * Público y sin sesión (decisión de Alberto). Reenvía al puente de asegura, que valida
 * contra los campos que se pidieron y guarda cifrado. Límite por IP contra el abuso.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`datos:${getIp(req)}`, 10)
  if (!rl.allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const token = typeof b?.token === 'string' ? b.token.trim() : ''
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ estado: 'muerta' }, { status: 410 })
  const r = await llamarPuenteSolicitud({ metodo: 'POST', token, respuestas: b?.respuestas ?? {} })
  if (!r) return NextResponse.json({ error: 'sin_puente' }, { status: 503 })
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
