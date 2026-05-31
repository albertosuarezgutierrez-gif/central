export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'diag2026') return NextResponse.json({ error: 'no' }, { status: 401 })

  // Probar NVIDIA NIM directamente (sin fallback) para aislar el fallo
  const key = process.env.NVIDIA_API_KEY
  const t0 = Date.now()
  const bigUser = Array.from({ length: 12 }, (_, i) =>
    `- [id${i}] Lead ${i} (reunion_agendada, score:80) | REUNIÓN SIN CONFIRMAR el 10/6 | 999d sin actividad`
  ).join('\n')
  const prompt = `Eres asistente comercial. Para cada lead devuelve acción y mensaje WhatsApp (máx 40 palabras, una línea).
LEADS:\n${bigUser}
Responde SOLO JSON array: [{"lead_id":"","urgencia":"alta","accion":"","razon":"","whatsapp":""}]`
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.NVIDIA_BRAIN_MODEL ?? 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'system', content: 'SOLO JSON.' }, { role: 'user', content: prompt }],
        max_tokens: 3500, temperature: 0.2, stream: false,
      }),
    })
    const body = await res.text()
    let contentLen = 0, finish = ''
    try { const j = JSON.parse(body); contentLen = (j.choices?.[0]?.message?.content || '').length; finish = j.choices?.[0]?.finish_reason || '' } catch { /* */ }
    return NextResponse.json({ nvidia_http: res.status, nvidia_ms: Date.now() - t0, contentLen, finish, bodyHead: body.slice(0, 200) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ms: Date.now() - t0 })
  }
}
