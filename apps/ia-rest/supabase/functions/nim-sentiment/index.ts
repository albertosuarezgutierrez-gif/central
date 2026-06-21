// supabase/functions/nim-sentiment/index.ts
// v1 — Análisis sentiment de qr_valoraciones nocturno
// Cron: 0 2 * * *

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function clasificar(apiKey: string, texto: string): Promise<{ label: string; tags: string[]; resumen: string }> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      max_tokens: 120,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `Analiza una reseña de restaurante. Solo JSON válido, sin texto extra:
{"label":"positivo|negativo|neutro","tags":["servicio","comida","espera","precio","ambiente"],"resumen":"máx 10 palabras"}
tags: solo los mencionados en la reseña (puede ser []).`,
        },
        { role: 'user', content: `Reseña: "${texto}"` },
      ],
    }),
  })
  const data = await res.json()
  try { return JSON.parse((data.choices?.[0]?.message?.content ?? '{}').replace(/```json|```/g, '').trim()) }
  catch { return { label: 'neutro', tags: [], resumen: '' } }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const NVIDIA_API_KEY = Deno.env.get('NVIDIA_API_KEY')!

    const { data: valoraciones } = await supabase
      .from('qr_valoraciones').select('id, comentario')
      .is('sentiment_at', null).not('comentario', 'is', null).neq('comentario', '').limit(50)

    if (!valoraciones?.length)
      return new Response(JSON.stringify({ ok: true, procesadas: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    let procesadas = 0
    for (const val of valoraciones) {
      try {
        const r = await clasificar(NVIDIA_API_KEY, val.comentario)
        await supabase.from('qr_valoraciones').update({
          sentiment_label: r.label, sentiment_tags: r.tags,
          sentiment_resumen: r.resumen, sentiment_at: new Date().toISOString(),
        }).eq('id', val.id)
        procesadas++
      } catch { /* continuar */ }
    }

    return new Response(JSON.stringify({ ok: true, procesadas }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
