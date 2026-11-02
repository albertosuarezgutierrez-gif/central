import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { claveSecreta } from "../_shared/clave-supabase.ts";
import { exigirServicioOSecreto } from '../_shared/auth-interna.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Clave de servicio o INTERNAL_API_SECRET en x-internal-secret. FAIL-CLOSED (02/11/2026): antes,
  // sin la variable definida, entraba cualquiera (`if (expectedSecret && …)`), y comparaba con `!==`.
  const denegado = exigirServicioOSecreto(req, 'INTERNAL_API_SECRET', 'x-internal-secret', corsHeaders)
  if (denegado) return denegado

  try {
    const body = await req.json()
    const { nivel, categoria, mensaje, funcion_origen, request_id, restaurante_id, contexto } = body

    if (!nivel || !categoria || !mensaje) {
      return new Response(JSON.stringify({ error: 'nivel, categoria y mensaje son obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      claveSecreta(),
      { db: { schema: 'iarest' } }
    )

    // Guardar el error
    const { error: dbError } = await supabase
      .from('system_errors')
      .insert({ nivel, categoria, mensaje, funcion_origen: funcion_origen ?? null,
                request_id: request_id ?? null, restaurante_id: restaurante_id ?? null,
                contexto: contexto ?? null })

    if (dbError) throw new Error(dbError.message)

    // Push si es critical
    if (nivel === 'critical') {
      try {
        await supabase.functions.invoke('push-send', {
          body: {
            restaurante_id: restaurante_id ?? 'GLOBAL',
            titulo: `🔴 Error crítico · ${categoria.toUpperCase()}`,
            mensaje: mensaje,
            datos: { tipo: 'system_error', nivel },
          }
        })
      } catch (pushErr) {
        console.error('[error-ingest] push fallido:', pushErr)
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[error-ingest]', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
