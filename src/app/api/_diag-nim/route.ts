export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { callAI, cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'diag2026') return NextResponse.json({ error: 'no' }, { status: 401 })
  const prompt = `Devuelve SOLO un JSON array con 12 objetos de prueba:
[{"lead_id":"1","urgencia":"alta","accion":"x","razon":"y","whatsapp":"Hola, confirmas la reunión del 10/6? Un saludo."}]
Repite 12 objetos variando el texto. En una línea por objeto, sin saltos dentro de strings.`
  const t0 = Date.now()
  try {
    const raw = await callAI('Test. SOLO JSON.', prompt, 3500)
    const ms = Date.now() - t0
    let parsedLen = 0, conWa = 0, parseErr = ''
    try {
      const p = JSON.parse(cleanJSON(raw))
      parsedLen = p.length; conWa = p.filter((a: { whatsapp?: string }) => a.whatsapp).length
    } catch (e) { parseErr = (e as Error).message }
    return NextResponse.json({ ms, rawLen: raw.length, rawTail: raw.slice(-120), parsedLen, conWa, parseErr })
  } catch (e) {
    return NextResponse.json({ ms: Date.now() - t0, error: (e as Error).message })
  }
}
