// supabase/functions/daily-briefing/index.ts
// v3 — Resumen diario IA → Telegram (pasarela Director de plataforma; NVIDIA NIM de fallback)
// Cron: 0 7 * * * (9:00h Madrid verano / UTC+2)
//
// 🚨 v3 (28/08/2026) — por qué se reescribió el camino de fallo. El 27 y el 28/08 el briefing
// llegó a Telegram como «⚠️ daily-briefing error / NVIDIA 410» y NADA más: ni las comandas, ni
// las ventas, ni el personal. Tres fallos encadenados, los tres de la misma familia (algo falla
// callando y aguas abajo se afirma otra cosa):
//   1) La NARRATIVA tumbaba el briefing ENTERO. Las métricas ya estaban calculadas cuando se
//      llamaba al LLM: el modelo solo las envuelve en prosa. Que el LLM muriera no es razón para
//      tirar los datos — ahora se manda el briefing EN CRUDO diciendo por qué no hay prosa.
//   2) El fallo de la PASARELA se tragaba entero (`catch {}` + cuerpo del no-ok descartado), así
//      que era imposible saber por qué se caía al fallback. Confirmado en BD: `ai_usos` NO tiene
//      NI UNA fila con app `ia-rest-briefing` — este briefing NUNCA ha pasado por la pasarela (y
//      por tanto nunca ha visto OpenRouter); siempre iba por NVIDIA directo. Ahora cada eslabón
//      deja su motivo y el motivo VIAJA en el mensaje.
//   3) El modelo NIM iba CABLEADO. `meta/llama-3.1-70b-instruct` murió por EOL el 2026-08-26T09:00
//      (410 Gone; último OK de la sonda: 26/08 07:03 UTC) — es la TERCERA muerte en 11 días
//      (llama-4-maverick 17/08 · z-ai/glm-5.2 21/08 · esta). Un id cableado convierte cada muerte
//      en un PR + redespliegue: ahora sale de `NVIDIA_BRAIN_MODEL` y, sin esa env, el eslabón se
//      declara inactivo en vez de gastar una llamada a un modelo que sabemos muerto.
// Y dos consultas que llevaban tiempo mintiendo por omisión (misma regla de CLAUDE.md):
//   4) Las alertas de stock leían `almacen`, tabla que NO EXISTE en el schema `iarest` → la
//      consulta fallaba, `?? []` la convertía en «no hay alertas» y el briefing lo daba por bueno
//      cada día. Ahora lee `v_stock_actual` y distingue «revisado, sin alertas» de «no consultable».
//   5) El sello `daily_briefing_last_run` escribía columnas (`clave`/`descripcion`) que
//      `iarest.sistema_config` no tiene (es `id`/`valor` jsonb) → nunca se guardó ni una vez.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bloqueContexto, mensajeBriefing } from './formato.ts'
import type { Metricas } from './formato.ts'

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

/** Resultado de la narrativa: `texto` null = ningún proveedor sirvió, y `fallos` dice por qué. */
interface Narrativa {
  texto: string | null
  via: string | null
  fallos: string[]
}

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160)

// Genera la narrativa del briefing con doble red:
//   1) PRIMARIO — pasarela IA de plataforma (endpoint /api/ai/chat): el Agente Director elige
//      modelo por petición y detrás tiene la cadena completa OpenRouter → NIM → Groq → Cerebras →
//      Kimi + control de presupuesto + auditoría de coste. Una sola fuente de verdad para IA.
//   2) FALLBACK — NVIDIA NIM directo (comportamiento histórico) por si la pasarela no está
//      configurada o plataforma está caída: así el briefing no depende de un único servicio.
// Este edge function es Deno standalone en el proyecto Supabase de ia-rest y NO puede importar
// `@central/core-ai` (paquete pnpm de las apps Next.js) — por eso habla con la pasarela por HTTP.
// NUNCA lanza: si todo falla devuelve `texto: null` con el motivo de CADA eslabón, y el llamante
// manda igualmente el briefing en crudo. Perder los datos por no tener prosa era el bug de v2.
async function generarNarrativa(contexto: string): Promise<Narrativa> {
  const user = `Genera el briefing:\n${contexto}`
  const fallos: string[] = []

  // 1) Pasarela de plataforma (Agente Director) → es la ÚNICA vía que pasa por OpenRouter.
  const pasarelaUrl = Deno.env.get('PLATAFORMA_URL')
  const gatewaySecret = Deno.env.get('AI_GATEWAY_SECRET')
  if (!pasarelaUrl || !gatewaySecret) {
    // No es un detalle de log: sin esto el briefing NUNCA ve OpenRouter y depende de que NIM
    // tenga un modelo vivo. Que se lea en el propio mensaje de Telegram.
    const faltan = [!pasarelaUrl && 'PLATAFORMA_URL', !gatewaySecret && 'AI_GATEWAY_SECRET'].filter(Boolean).join(' + ')
    fallos.push(`pasarela sin configurar (falta ${faltan})`)
  } else {
    try {
      const res = await fetch(`${pasarelaUrl.replace(/\/$/, '')}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewaySecret}` },
        body: JSON.stringify({
          app: 'ia-rest-briefing',
          system: SYSTEM_BRIEFING,
          messages: [{ role: 'user', content: user }],
          maxTokens: 600,
          timeoutMs: 30_000,
        }),
        signal: AbortSignal.timeout(35_000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.text) return { texto: data.text, via: `Director${data?.modelo ? ` · ${data.modelo}` : ''}`, fallos }
        fallos.push('pasarela 200 sin texto')
      } else {
        // 401 (secreto malo) / 429 (presupuesto mensual) / 502 (IA no disponible) son diagnósticos
        // MUY distintos: el cuerpo los separa y v2 lo tiraba a la basura.
        fallos.push(`pasarela HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}`)
      }
    } catch (e) { fallos.push(`pasarela inalcanzable: ${motivo(e)}`) }
  }

  // 2) Fallback: NVIDIA NIM directo (última red de seguridad).
  // El modelo NO va cableado: los ids de NIM se mueren con EOL cada pocos días (3 muertes en 11
  // días a 28/08/2026). Sin `NVIDIA_BRAIN_MODEL` el eslabón se declara inactivo en vez de quemar
  // una llamada contra el default histórico, que sabemos muerto (410 desde el 26/08).
  const nvidia = Deno.env.get('NVIDIA_API_KEY')
  const modeloNim = Deno.env.get('NVIDIA_BRAIN_MODEL')
  if (!nvidia) fallos.push('NVIDIA inactivo (falta NVIDIA_API_KEY)')
  else if (!modeloNim) fallos.push('NVIDIA inactivo (falta NVIDIA_BRAIN_MODEL; el default histórico murió por EOL el 26/08/2026)')
  else {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nvidia}` },
        body: JSON.stringify({
          model: modeloNim,
          max_tokens: 600,
          temperature: 0.4,
          messages: [
            { role: 'system', content: SYSTEM_BRIEFING },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(35_000),
      })
      if (!res.ok) {
        // El cuerpo del 410 de NIM trae la fecha exacta de EOL del modelo — es el dato que hace
        // falta para el swap; `NVIDIA 410` a secas obligaba a ir a buscarlo a mano.
        throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
      }
      const data = await res.json()
      const texto = data.choices?.[0]?.message?.content
      if (!texto) throw new Error('respuesta vacía')
      return { texto, via: `NVIDIA NIM directo · ${modeloNim}`, fallos }
    } catch (e) { fallos.push(`NVIDIA (${modeloNim}) falló: ${motivo(e)}`) }
  }

  return { texto: null, via: null, fallos }
}

async function getMetricas(supabase: ReturnType<typeof createClient>, restauranteId: string): Promise<Metricas> {
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
  const ticketMedio = numComandas > 0 ? totalVentas / numComandas : 0

  // Stock bajo mínimo. v2 leía `almacen` (tabla inexistente en `iarest`) y encima intentaba
  // comparar dos COLUMNAS con `.filter('stock_actual','lte','stock_minimo')`, que PostgREST no
  // soporta (la parte derecha es siempre un literal). Doble fallo → `data` null → «sin alertas»
  // todos los días. Ahora: vista real `v_stock_actual` (ya trae el nombre del producto, sin
  // segunda consulta) y el umbral se compara en JS. Si la consulta falla → `null`, no `[]`.
  const { data: stockFilas, error: errStock } = await supabase
    .from('v_stock_actual').select('nombre, stock_actual, stock_minimo')
    .eq('local_id', restauranteId).gt('stock_minimo', 0)

  const alertas = errStock || !stockFilas
    ? null
    : stockFilas
        .filter((f: { stock_actual: number; stock_minimo: number }) => Number(f.stock_actual) <= Number(f.stock_minimo))
        .slice(0, 5)
        .map((f: { nombre: string; stock_actual: number }) => `${f.nombre ?? 'Producto'} (${f.stock_actual}u)`)

  const { data: turnos } = await supabase.from('turnos')
    .select('camarero_id').eq('local_id', restauranteId).is('salida_at', null)

  return { numComandas, totalVentas, ticketMedio, top5, personalActivo: (turnos ?? []).length, alertas }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'iarest' } })
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const TELEGRAM_CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID')!

    const { data: restaurantes } = await supabase.from('restaurantes').select('id, nombre').eq('activo', true)
    if (!restaurantes?.length) {
      await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, '📊 <b>Daily Briefing ia.rest</b>\nNo hay restaurantes activos.')
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
    const filas: Array<{ nombre: string; m: Metricas }> = []
    for (const rest of restaurantes) {
      filas.push({ nombre: rest.nombre, m: await getMetricas(supabase, rest.id) })
    }

    const contexto = `Fecha: ${fecha}\n\n` + filas.map(f => bloqueContexto(f.nombre, f.m)).join('')
    const { texto, via, fallos } = await generarNarrativa(contexto)

    // Sin prosa NO es sin briefing: los números ya están calculados y son lo que Alberto lee.
    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
      mensajeBriefing(fecha, filas, { texto, via, fallos }))

    // Sello de última ejecución. v2 escribía `clave`/`descripcion`, columnas que esta tabla no
    // tiene (`iarest.sistema_config` es `id` / `valor` jsonb / `updated_at`): supabase-js no lanza,
    // devuelve `{error}`, así que el upsert falló EN SILENCIO desde siempre — la tabla solo tenía
    // `vapid_keys`. Ahora con las columnas reales, y el error se registra si vuelve a fallar.
    const { error: errSello } = await supabase.from('sistema_config').upsert(
      {
        id: 'daily_briefing_last_run',
        valor: { ts: new Date().toISOString(), via, degradado: texto === null, fallos },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    if (errSello) console.error('[daily-briefing] no se pudo sellar last_run:', errSello.message)

    return new Response(JSON.stringify({ ok: true, restaurantes: restaurantes.length, via, degradado: texto === null, fallos }), {
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
