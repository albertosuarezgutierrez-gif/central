import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Validar secret interno (opcional si INTERNAL_API_SECRET está seteado)
  const internalSecret = req.headers.get('x-internal-secret')
  const expectedSecret = Deno.env.get('INTERNAL_API_SECRET')
  if (expectedSecret && internalSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
