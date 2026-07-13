// supabase/functions/daily-briefing/index.ts
// v2 — Resumen diario con cadena de fallback IA → Telegram
// Cron: 0 7 * * * (9:00h Madrid verano / UTC+2)
//
// Cadena de proveedores (todos OpenAI-compatible): NVIDIA NIM (gratis) → OpenRouter
// (agregador, fallback nativo entre modelos) → Groq (gratis, otra infra). Cada eslabón
// queda inactivo si no está su API key. Motivo: NIM devuelve 503/timeout con cierta
// frecuencia y hasta ahora el briefing no tenía red — un único fallo dejaba el resumen
// sin generar (incidente NVIDIA 503/timeout del 13/07/2026).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendTelegram(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
}

const SYSTEM_BRIEFING = `Eres el asistente de negocio de ia.rest. Redacta un briefing diario conciso para el dueño de un restaurante en español. Tono: cálido, directo, hostelero. Sin asteriscos, sin markdown. Máximo 5 líneas por restaurante.
Formato:
🍽️ [NOMBRE]
Ayer: X comandas · Y€ · ticket medio Z€
Top platos: [lista]
Personal activo: N
[⚠️ Alertas si las hay]`

interface ProveedorIA {
  nombre: string
  url: string
  apiKey?: string
  model: string
  atribucion?: boolean // OpenRouter recomienda cabeceras HTTP-Referer/X-Title
}

// Cadena de proveedores OpenAI-compatible, en orden de preferencia. Cada uno solo entra en
// juego si tiene su API key (así el rollout es poner la env, sin tocar código). Los ids/envs
// espejan la política de `packages/core-ai/src/client.ts` (OpenRouter → NIM → Groq).
function proveedoresIA(): ProveedorIA[] {
  return [
    {
      nombre: 'NVIDIA NIM',
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey: Deno.env.get('NVIDIA_API_KEY'),
      model: 'meta/llama-3.3-70b-instruct',
    },
    {
      nombre: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: Deno.env.get('OPENROUTER_API_KEY'),
      model: Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-chat',
      atribucion: true,
    },
    {
      nombre: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: Deno.env.get('GROQ_API_KEY'),
      model: Deno.env.get('GROQ_BRAIN_MODEL') || 'openai/gpt-oss-120b',
    },
  ].filter((p) => !!p.apiKey)
}

// Genera la narrativa recorriendo la cadena de proveedores: el primero que responda gana.
// Timeout por proveedor (20s) para que un NIM colgado no bloquee el cron — pasa al siguiente.
// Devuelve también qué proveedor lo generó (para el pie del mensaje de Telegram).
async function generarNarrativa(contexto: string): Promise<{ texto: string; proveedor: string }> {
  const messages = [
    { role: 'system', content: SYSTEM_BRIEFING },
    { role: 'user', content: `Genera el briefing:\n${contexto}` },
  ]
  const proveedores = proveedoresIA()
  if (!proveedores.length) {
    throw new Error('Sin proveedores IA configurados (NVIDIA_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY)')
  }

  const errores: string[] = []
  for (const p of proveedores) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      }
      if (p.atribucion) {
        headers['HTTP-Referer'] = 'https://iarest.es'
        headers['X-Title'] = 'ia.rest daily-briefing'
      }
      const res = await fetch(p.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: p.model, max_tokens: 600, temperature: 0.4, messages }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const texto = data.choices?.[0]?.message?.content
      if (!texto) throw new Error('respuesta vacía')
      return { texto, proveedor: p.nombre }
    } catch (e) {
      errores.push(`${p.nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`Todos los proveedores IA fallaron — ${errores.join(' · ')}`)
}

async function getMetricas(supabase: ReturnType<typeof createClient>, restauranteId: string) {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1); ayer.setHours(0, 0, 0, 0)
  const hoy  = new Date(); hoy.setHours(0, 0, 0, 0)

  const { data: comandas } = await supabase
    .from('comandas').select('id').eq('local_id', restauranteId)
    .gte('created_at', ayer.toISOString()).lt('created_at', hoy.toISOString())

  const ids = (comandas ?? []).map((c: { id: string }) => c.id)
  let totalVentas = 0
  const conteo: Record<string, number> = {}

  if (ids.length > 0) {
    const { data: items } = await supabase
      .from('comanda_items').select('nombre, cantidad, precio_unitario').in('comanda_id', ids)
    for (const item of items ?? []) {
      totalVentas += (item.cantidad ?? 1) * (item.precio_unitario ?? 0)
      conteo[item.nombre] = (conteo[item.nombre] ?? 0) + (item.cantidad ?? 1)
    }
  }

  const top5 = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, u]) => `${n}(${u}u)`)
  const numComandas = ids.length
  const ticketMedio = numComandas > 0 ? (totalVentas / numComandas).toFixed(2) : '0.00'

  const { data: stockAlertas } = await supabase
    .from('almacen').select('producto_id, stock_actual, stock_minimo')
    .eq('local_id', restauranteId).gt('stock_minimo', 0)
    .filter('stock_actual', 'lte', 'stock_minimo').limit(5)

  let alertas: string[] = []
  if ((stockAlertas ?? []).length > 0) {
    const pIds = (stockAlertas ?? []).map((a: { producto_id: string }) => a.producto_id)
    const { data: prods } = await supabase.from('productos').select('id, nombre').in('id', pIds)
    const mapa: Record<string, string> = {}
    for (const p of prods ?? []) mapa[p.id] = p.nombre
    alertas = (stockAlertas ?? []).map((a: { producto_id: string; stock_actual: number }) => `${mapa[a.producto_id] ?? 'Producto'} (${a.stock_actual}u)`)
  }

  const { data: turnos } = await supabase.from('turnos')
    .select('camarero_id').eq('local_id', restauranteId).is('salida_at', null)

  return { numComandas, totalVentas: totalVentas.toFixed(2), ticketMedio, top5, alertas, personalActivo: (turnos ?? []).length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID')!

    const { data: restaurantes } = await supabase.from('restaurantes').select('id, nombre').eq('activo', true)
    if (!restaurantes?.length) {
      await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, '📊 <b>Daily Briefing ia.rest</b>\nNo hay restaurantes activos.')
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
    let contexto = `Fecha: ${fecha}\n\n`

    for (const rest of restaurantes) {
      const m = await getMetricas(supabase, rest.id)
      contexto += `RESTAURANTE: ${rest.nombre}\n`
      contexto += `- Comandas ayer: ${m.numComandas}\n`
      contexto += `- Ventas: ${m.totalVentas}€ · ticket medio: ${m.ticketMedio}€\n`
      contexto += `- Top: ${m.top5.join(', ') || 'Sin datos'}\n`
      contexto += `- Personal activo ahora: ${m.personalActivo}\n`
      if (m.alertas.length) contexto += `- ALERTAS STOCK: ${m.alertas.join(', ')}\n`
      contexto += '\n'
    }

    const { texto: narrativa, proveedor } = await generarNarrativa(contexto)
    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
      `📊 <b>Briefing ia.rest — ${fecha}</b>\n\n${narrativa}\n\n<i>🤖 ${proveedor} · ia.rest</i>`)

    await supabase.from('sistema_config').upsert(
      { clave: 'daily_briefing_last_run', valor: new Date().toISOString(), descripcion: 'Última ejecución resumen diario (NIM → OpenRouter → Groq)' },
      { onConflict: 'clave' }
    )

    return new Response(JSON.stringify({ ok: true, restaurantes: restaurantes.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    try {
      const t = Deno.env.get('TELEGRAM_BOT_TOKEN')!; const c = Deno.env.get('TELEGRAM_CHAT_ID')!
      await sendTelegram(t, c, `⚠️ <b>daily-briefing error</b>\n${error instanceof Error ? error.message : String(error)}`)
    } catch { /* silencioso */ }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
