// qr-assistant v1 — Asistente IA para clientes en mesa (sin auth, acceso por sesión QR)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'iarest' } }
  )

  try {
    const { sesion_id, pregunta, historial } = await req.json()
    if (!sesion_id || !pregunta?.trim()) {
      return new Response(JSON.stringify({ error: 'sesion_id y pregunta requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validar sesión QR activa
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('restaurante_id, mesa_id, estado')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .single()

    if (!sesion) {
      return new Response(JSON.stringify({ error: 'Sesión QR no válida o expirada' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cargar datos del restaurante y productos
    const [{ data: restaurante }, { data: productos }] = await Promise.all([
      supabase.from('restaurantes').select('nombre, descripcion').eq('id', sesion.restaurante_id).single(),
      supabase.from('productos')
        .select('nombre, descripcion, precio, categoria, alergenos, alcoholico')
        .eq('restaurante_id', sesion.restaurante_id)
        .eq('activo', true)
        .limit(80),
    ])

    // Construir carta resumida por categorías
    const porCategoria: Record<string, string[]> = {}
    for (const p of productos ?? []) {
      const cat = p.categoria ?? 'General'
      if (!porCategoria[cat]) porCategoria[cat] = []
      porCategoria[cat].push(
        `${p.nombre}${p.precio ? ` (${Number(p.precio).toFixed(2)}€)` : ''}` +
        (p.alergenos?.length ? ` [alérgenos: ${p.alergenos.join(', ')}]` : '') +
        (p.alcoholico ? ' [alcohólico]' : '')
      )
    }
    const cartaStr = Object.entries(porCategoria)
      .map(([cat, items]) => `**${cat}:** ${items.join(' · ')}`)
      .join('\n')

    const system = `Eres el asistente de mesa de "${restaurante?.nombre ?? 'este restaurante'}".
Ayudas a los clientes con preguntas sobre la carta: ingredientes, alérgenos, recomendaciones, precios.

CARTA DISPONIBLE:
${cartaStr || '(Sin productos disponibles en este momento)'}

REGLAS:
- Responde en español (o en el idioma que use el cliente).
- Máximo 3 frases. Sé amable y útil.
- Si preguntan por alérgenos, da la información exacta de la carta.
- Si no conoces algo, di "consulta al camarero para más detalles".
- NUNCA inventes platos o precios que no aparezcan en la carta.
- No des información personal del restaurante (teléfono, dirección, etc.).`

    const msgs = [
      ...((historial ?? []) as { role: string; content: string }[]).slice(-6),
      { role: 'user', content: pregunta },
    ]

    // Llamar a NIM (glm-5.2) vía NVIDIA
    const nimKey = Deno.env.get('NIM_API_KEY') ?? Deno.env.get('NVIDIA_API_KEY')
    let respuesta = ''

    if (nimKey) {
      const nimRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nimKey}` },
        body: JSON.stringify({
          model: 'z-ai/glm-5.2',
          messages: [{ role: 'system', content: system }, ...msgs],
          max_tokens: 256,
          temperature: 0.4,
        }),
      })
      const nimData = await nimRes.json()
      respuesta = nimData.choices?.[0]?.message?.content ?? ''
    }

    // Sin fallback Anthropic (retirado 17/06/2026, cuenta sin saldo). Si NIM no responde, se
    // devuelve el mensaje por defecto de abajo.

    return new Response(JSON.stringify({ respuesta: respuesta.trim() || 'Lo siento, no puedo responder en este momento. Pregunta al camarero.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[qr-assistant]', error)
    return new Response(JSON.stringify({ error: 'Error interno', respuesta: 'Lo siento, hay un problema técnico. Por favor, pregunta al camarero.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
