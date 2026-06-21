// check-elaboraciones v1
// Cron cada hora: revisa elaboraciones próximas a caducar y envía push a camareros

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
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://www.iarest.es'

  try {
    // 1. Marcar como caducadas las que ya pasaron
    await supabase.rpc('fn_marcar_elaboraciones_caducadas')

    // 2. Buscar elaboraciones activas que necesitan alerta
    const ahora = new Date()
    const en4h  = new Date(ahora.getTime() + 4  * 3600000).toISOString()
    const en24h = new Date(ahora.getTime() + 24 * 3600000).toISOString()

    const { data: elaboraciones } = await supabase
      .from('elaboraciones_propias')
      .select('id, local_id, nombre, lote, fecha_caducidad, alerta_24h_enviada, alerta_hoy_enviada, elaborado_por_nombre')
      .eq('estado', 'activa')
      .lte('fecha_caducidad', en24h) // caduca en las próximas 24h

    let alertas24h = 0
    let alertasCriticas = 0

    for (const elab of (elaboraciones ?? [])) {
      const cad = new Date(elab.fecha_caducidad)
      const horasRestantes = (cad.getTime() - ahora.getTime()) / 3600000

      // ── Alerta crítica: caduca en < 4 horas (avisar a TODOS los roles de sala + cocina) ──
      if (horasRestantes <= 4 && horasRestantes > 0 && !elab.alerta_hoy_enviada) {
        const horas = Math.round(horasRestantes)
        const mins  = Math.round((horasRestantes % 1) * 60)
        const tiempoLabel = horas > 0 ? `${horas}h ${mins}min` : `${mins} min`

        await fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurante_id: elab.local_id,
            roles: ['camarero', 'jefe_sala', 'cocina'],
            title: '⚠️ Caduca pronto',
            body: `${elab.nombre} caduca en ${tiempoLabel}. ¡Recomiéndalo ahora!`,
            data: { tipo: 'caducidad_critica', elaboracion_id: elab.id, lote: elab.lote },
          }),
        })

        await supabase.from('elaboraciones_propias')
          .update({ alerta_hoy_enviada: true, updated_at: new Date().toISOString() })
          .eq('id', elab.id)

        alertasCriticas++
      }

      // ── Alerta 24h: avisa solo a jefe de sala y cocina para planificar ──
      if (horasRestantes <= 24 && horasRestantes > 4 && !elab.alerta_24h_enviada) {
        const fechaLabel = cad.toLocaleString('es-ES', {
          hour: '2-digit', minute: '2-digit',
          day: 'numeric', month: 'short',
          timeZone: 'Europe/Madrid',
        })

        await fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurante_id: elab.local_id,
            roles: ['jefe_sala', 'cocina', 'owner'],
            title: '🏷️ Caduca mañana',
            body: `${elab.nombre} (lote ${elab.lote}) caduca el ${fechaLabel}. Planifica la venta.`,
            data: { tipo: 'caducidad_24h', elaboracion_id: elab.id, lote: elab.lote },
          }),
        })

        await supabase.from('elaboraciones_propias')
          .update({ alerta_24h_enviada: true, updated_at: new Date().toISOString() })
          .eq('id', elab.id)

        alertas24h++
      }
    }

    // 3. Guardar en log de alertas
    if (alertas24h > 0 || alertasCriticas > 0) {
      await supabase.from('ia_training_log').insert({
        tipo: 'check_elaboraciones',
        metadata: { alertas_24h: alertas24h, alertas_criticas: alertasCriticas, ts: ahora.toISOString() },
      }).select()
    }

    return new Response(
      JSON.stringify({ ok: true, alertas_24h: alertas24h, alertas_criticas: alertasCriticas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[check-elaboraciones]', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
