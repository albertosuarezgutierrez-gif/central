import { NextResponse } from 'next/server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { subirDocPuente } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Asegura guarda el fichero y lo lee con IA (hasta ~40 s).
export const maxDuration = 60

/** Por debajo del tope de cuerpo de Vercel (4,5 MB). Las fotos llegan ya encogidas del navegador. */
const MAX_BYTES = 4_200_000

/**
 * POST /api/datos/documento (multipart: token, documento) — el cliente sube un documento
 * desde el enlace de datos del presupuesto (24/09/2026). Público y sin sesión, como el
 * propio enlace: lo protege el token (de un solo uso) y el límite por IP.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`datos-doc:${getIp(req)}`, 20)
  if (!rl.allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const form = await req.formData().catch(() => null)
  const token = typeof form?.get('token') === 'string' ? String(form?.get('token')).trim() : ''
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ estado: 'muerta' }, { status: 410 })
  const fichero = form?.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ motivo: 'No llegó ningún fichero.' }, { status: 400 })
  if (fichero.size > MAX_BYTES) {
    return NextResponse.json({ motivo: `«${fichero.name}» pesa demasiado (${(fichero.size / 1024 / 1024).toFixed(1)} MB). Sube una foto o un PDF de menos de 4 MB.` }, { status: 413 })
  }
  const r = await subirDocPuente(token, fichero)
  if (!r) return NextResponse.json({ error: 'sin_puente' }, { status: 503 })
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
