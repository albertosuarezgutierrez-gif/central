// supabase/functions/nim-diagnostico/index.ts
// v1 — Diagnostica system_errors con NIM y enriquece Telegram
// Cron: */10 * * * *

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function diagnosticar(apiKey: string, funcion: string, mensaje: string, stack?: string): Promise<{ diagnostico: string; accion: string }> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      max_tokens: 200,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `Eres el asistente técnico de ia.rest (Next.js+Supabase SaaS hostelería).
Solo JSON: {"diagnostico":"causa probable 1 frase","accion":"qué hacer 1 frase concreta"}`,
        },
        { role: 'user', content: `Función: ${funcion}\nError: ${mensaje}\n${stack ? 'Stack: ' + stack.slice(0, 300) : ''}` },
      ],
    }),
  })
  const data = await res.json()
  try { return JSON.parse((data.choices?.[0]?.message?.content ?? '{}').replace(/```json|```/g, '').trim()) }
  catch { return { diagnostico: 'No disponible', accion: 'Revisar logs manualmente' } }
}

async function sendTelegram(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const NVIDIA_API_KEY     = Deno.env.get('NVIDIA_API_KEY')!
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID')!

    const { data: errores } = await supabase
      .from('system_errors').select('id, funcion_origen, mensaje, contexto')
      .is('nim_diagnostico_at', null).eq('resuelto', false)
      .order('created_at', { ascending: false }).limit(10)

    if (!errores?.length)
      return new Response(JSON.stringify({ ok: true, procesados: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    for (const err of errores) {
      const r = await diagnosticar(NVIDIA_API_KEY, err.funcion_origen ?? 'desconocida', err.mensaje ?? '', err.contexto ? JSON.stringify(err.contexto) : undefined)
      await supabase.from('system_errors').update({
        nim_diagnostico: r.diagnostico, nim_accion: r.accion,
        nim_diagnostico_at: new Date().toISOString(),
      }).eq('id', err.id)

      await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
        `🔴 <b>Error ia.rest</b>\n` +
        `📍 <code>${err.funcion_origen ?? 'desconocida'}</code>\n` +
        `💬 ${(err.mensaje ?? '').slice(0, 200)}\n\n` +
        `🧠 <b>NIM:</b> ${r.diagnostico}\n` +
        `✅ <b>Acción:</b> ${r.accion}`)
    }

    return new Response(JSON.stringify({ ok: true, procesados: errores.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
