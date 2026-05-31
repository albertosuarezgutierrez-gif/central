export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('k') !== 'diag2026') return NextResponse.json({ error: 'no' }, { status: 401 })

  // Probar NVIDIA NIM directamente (sin fallback) para aislar el fallo
  const key = process.env.NVIDIA_API_KEY
  const t0 = Date.now()
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.NVIDIA_BRAIN_MODEL ?? 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: 'Responde solo: OK' }],
        max_tokens: 10, temperature: 0.2, stream: false,
      }),
    })
    const body = await res.text()
    return NextResponse.json({
      nvidia_key_presente: !!key,
      nvidia_http: res.status,
      nvidia_ms: Date.now() - t0,
      nvidia_body: body.slice(0, 300),
    })
  } catch (e) {
    return NextResponse.json({ nvidia_key_presente: !!key, error: (e as Error).message, ms: Date.now() - t0 })
  }
}
