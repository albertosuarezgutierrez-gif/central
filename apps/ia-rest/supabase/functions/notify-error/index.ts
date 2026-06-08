// notify-error — Edge Function
// Recibe una incidencia y la envía a Telegram + guarda en BD
// POST { tipo, modulo, mensaje, detalle, restaurante_id?, nivel }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMOJIS: Record<string, string> = {
  critico:  '🔴',
  aviso:    '🟡',
  info:     '🔵',
  resuelto: '✅',
}

const MODULOS: Record<string, string> = {
  comanda:   '🍽️ Comanda',
  cobro:     '💳 Cobro',
  bridge:    '🖨️ Bridge/Impresora',
  qr:        '📱 QR',
  ear:       '🎙️ Voz (EAR)',
  stripe:    '💰 Stripe',
  verifactu: '📄 VeriFactu',
  sesion:    '🔐 Sesión',
  sistema:   '⚙️ Sistema',
  cron:      '⏱️ Cron',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const {
      tipo = 'sistema',
      modulo = 'sistema',
      mensaje,
      detalle = {},
      restaurante_id = null,
      nivel = 'aviso',   // 'info' | 'aviso' | 'critico' | 'resuelto'
      auto_resuelta = false,
    } = body

    if (!mensaje) {
      return new Response(JSON.stringify({ error: 'mensaje requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Guardar en BD
    const { data: incidencia, error: dbError } = await supabase
      .from('incidencias_sistema')
      .insert({
        tipo,
        modulo,
        mensaje,
        detalle,
        local_id: restaurante_id,
        nivel,
        resuelta: nivel === 'resuelto',
        auto_resuelta,
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('Error guardando incidencia:', dbError)
    }

    // 2. Enviar a Telegram (solo avisos, críticos y resueltos — no info silenciosa)
    const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')

    if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID && nivel !== 'info') {
      const emoji = EMOJIS[nivel] || '⚪'
      const moduloLabel = MODULOS[modulo] || modulo
      const nivelLabel = nivel.toUpperCase()
      const hora = new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
      const fecha = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' })

      // Obtener nombre del restaurante si hay ID
      let restauranteNombre = 'Sistema general'
      if (restaurante_id) {
        const { data: rest } = await supabase
          .from('restaurantes')
          .select('nombre')
          .eq('id', restaurante_id)
          .single()
        if (rest?.nombre) restauranteNombre = rest.nombre
      }

      const detalleTexto = Object.keys(detalle).length > 0
        ? `\n📋 <i>${JSON.stringify(detalle).substring(0, 200)}</i>`
        : ''

      const incidenciaId = incidencia?.id ? `\n🆔 <code>${incidencia.id.substring(0, 8)}</code>` : ''

      const textoMensaje = [
        `${emoji} <b>[ia.rest] ${nivelLabel}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📍 <b>${restauranteNombre}</b>`,
        `⚙️ ${moduloLabel}`,
        `❌ ${mensaje}`,
        `🕐 ${fecha} · ${hora}`,
        detalleTexto,
        incidenciaId,
        nivel === 'critico' ? '\n⚠️ <b>Requiere atención inmediata</b>' : '',
      ].filter(Boolean).join('\n')

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: textoMensaje,
          parse_mode: 'HTML',
        }),
      })
    }

    return new Response(JSON.stringify({ ok: true, id: incidencia?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('notify-error falló:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
