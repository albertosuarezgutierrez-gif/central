import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NVIDIA_KEY    = Deno.env.get('NVIDIA_API_KEY') ?? ''
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

async function callAI(system: string, user: string): Promise<string> {
  if (NVIDIA_KEY) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_KEY}` },
        body: JSON.stringify({ model: 'meta/llama-3.1-70b-instruct', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 800, temperature: 0.2 }),
      })
      const d = await res.json()
      if (d.choices?.[0]?.message?.content) return d.choices[0].message.content
    } catch { /* fallback */ }
  }
  if (ANTHROPIC_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': ANTHROPIC_KEY },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: `${system}\n\n${user}` }] }),
    })
    const d = await res.json()
    return d.content?.[0]?.text ?? ''
  }
  return ''
}

serve(async (req) => {
  const { candidato_id, cv_path } = await req.json()
  if (!candidato_id || !cv_path) return new Response(JSON.stringify({ error: 'Parámetros requeridos' }), { status: 400 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'iarest' } })

  const { data: fileData, error: dlErr } = await supabase.storage.from('cvs').download(cv_path)
  if (dlErr || !fileData) return new Response(JSON.stringify({ error: 'No se pudo descargar el CV' }), { status: 500 })

  let cvTexto = ''
  try {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(await fileData.arrayBuffer()))
    cvTexto = raw.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000)
  } catch { cvTexto = 'No se pudo extraer texto' }

  const { data: cand } = await supabase.from('bolsa_personal').select('nombre').eq('id', candidato_id).single()
  const nombre = (cand as {nombre?:string})?.nombre ?? 'Candidato'

  const system = `Eres experto en RRHH para hostelería española. Analiza el CV y responde SOLO en JSON sin markdown:
{"resumen":"2-3 frases sobre el candidato para hostelería","puntuacion":0-100,"fortalezas":["p1","p2","p3"],"alertas":["alerta o vacío"]}
Candidato: ${nombre}. Puntuación 100=perfil ideal hostelería española.`

  const raw = await callAI(system, `CV:\n${cvTexto}`)
  let analisis = { resumen: 'Perfil analizado', puntuacion: 50, fortalezas: [] as string[], alertas: [] as string[] }
  try { analisis = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch { /* defaults */ }

  await supabase.from('bolsa_personal').update({
    cv_texto:      cvTexto.slice(0, 2000),
    ia_resumen:    analisis.resumen,
    ia_puntuacion: Math.min(100, Math.max(0, Number(analisis.puntuacion) || 50)),
    ia_fortalezas: analisis.fortalezas,
    ia_alertas:    analisis.alertas,
    estado:        'revisado',
    updated_at:    new Date().toISOString(),
  }).eq('id', candidato_id)

  return new Response(JSON.stringify({ ok: true, puntuacion: analisis.puntuacion }), { headers: { 'Content-Type': 'application/json' } })
})
