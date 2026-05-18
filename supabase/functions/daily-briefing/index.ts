// supabase/functions/daily-briefing/index.ts
// v1 — Resumen diario NIM → Telegram
// Cron: 0 7 * * * (9:00h Madrid verano / UTC+2)

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

async function generarNarrativa(apiKey: string, contexto: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'meta/llama-3.3-70b-instruct',
      max_tokens: 600,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: `Eres el asistente de negocio de ia.rest. Redacta un briefing diario conciso para el dueño de un restaurante en español. Tono: cálido, directo, hostelero. Sin asteriscos, sin markdown. Máximo 5 líneas por restaurante.
Formato:
🍽️ [NOMBRE]
Ayer: X comandas · Y€ · ticket medio Z€
Top platos: [lista]
Personal activo: N
[⚠️ Alertas si las hay]`,
        },
        { role: 'user', content: `Genera el briefing:\n${contexto}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? 'Sin resumen disponible.'
}

async function getMetricas(supabase: ReturnType<typeof createClient>, restauranteId: string) {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1); ayer.setHours(0, 0, 0, 0)
  const hoy  = new Date(); hoy.setHours(0, 0, 0, 0)

  const { data: comandas } = await supabase
    .from('comandas').select('id').eq('restaurante_id', restauranteId)
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
    .eq('restaurante_id', restauranteId).gt('stock_minimo', 0)
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
    .select('camarero_id').eq('restaurante_id', restauranteId).is('salida_at', null)

  return { numComandas, totalVentas: totalVentas.toFixed(2), ticketMedio, top5, alertas, personalActivo: (turnos ?? []).length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const NVIDIA_API_KEY    = Deno.env.get('NVIDIA_API_KEY')!
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

    const narrativa = await generarNarrativa(NVIDIA_API_KEY, contexto)
    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
      `📊 <b>Briefing ia.rest — ${fecha}</b>\n\n${narrativa}\n\n<i>🤖 NVIDIA NIM · ia.rest</i>`)

    await supabase.from('sistema_config').upsert(
      { clave: 'daily_briefing_last_run', valor: new Date().toISOString(), descripcion: 'Última ejecución resumen diario NIM' },
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
