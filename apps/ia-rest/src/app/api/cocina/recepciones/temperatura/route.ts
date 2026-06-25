export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 60

const PROMPT = `Eres un asistente de cocina. En la imagen hay el DISPLAY de un termómetro/sonda de temperatura.
Devuelve ÚNICAMENTE JSON válido sin markdown: {"temperatura": número en °C o null}.
Interpreta el signo (el frío puede ser negativo). Si no ves un número claro, devuelve null.`

/** POST /api/cocina/recepciones/temperatura — lee la Tª del display de una sonda. */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  const rid = getRestauranteId(req)
  if (!session || !rid) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const { imagen, mediaType = 'image/jpeg' } = await req.json()
  if (!imagen || typeof imagen !== 'string') return NextResponse.json({ error: 'imagen requerida (base64)' }, { status: 400 })
  if (imagen.length > 5_000_000) return NextResponse.json({ error: 'Imagen demasiado grande. Máx 4MB.' }, { status: 400 })

  const mt = mediaType === 'image/jpg' ? 'image/jpeg'
    : ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg'

  try {
    const raw = await callAIVision(PROMPT, [{ data: imagen, mediaType: mt }], 'Lee la temperatura del display.', 200)
    const parsed = JSON.parse(cleanJSON(raw))
    const t = parsed.temperatura
    return NextResponse.json({ ok: true, temperatura: t != null && t !== '' && !isNaN(Number(t)) ? Number(t) : null })
  } catch (e) {
    console.error('[cocina/recepciones/temperatura]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'No se pudo leer la temperatura.' }, { status: 500 })
  }
}
