import { NextResponse } from 'next/server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { guardarBorradorPuente } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'

/** Tope del cuerpo: el borrador limpio no pasa de 20.000 caracteres (`MAX_BORRADOR_CARACTERES`); margen para el JSON. */
const MAX_CUERPO = 40_000

/**
 * POST /api/datos/borrador { token, borrador, consentimiento } — guardado automático del enlace de datos (26/10/2026).
 * Público y sin sesión, como el enlace: lo protege el token. El navegador lo manda con pausa (unos segundos sin
 * teclear); el límite por IP es holgado para eso y corta el abuso. Sin cookies: el borrador vive en el servidor, por token.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`datos-borrador:${getIp(req)}`, 120)
  if (!rl.allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const crudo = await req.text().catch(() => '')
  if (crudo.length > MAX_CUERPO) return NextResponse.json({ estado: 'invalido' }, { status: 413 })
  let b: Record<string, unknown> | null = null
  try { b = JSON.parse(crudo) as Record<string, unknown> } catch { b = null }
  const token = typeof b?.token === 'string' ? b.token.trim() : ''
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ estado: 'muerta' }, { status: 410 })
  const r = await guardarBorradorPuente(token, b?.borrador ?? null, b?.consentimiento === true)
  if (!r) return NextResponse.json({ error: 'sin_puente' }, { status: 503 })
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
