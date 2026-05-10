// qr-session v1 — Crea/obtiene sesión de cliente QR
// GET  ?token=xxx          → valida token, devuelve restaurante+mesa+carta
// POST { token, action }   → crea sesión activa

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const token = url.searchParams.get('token') || (await req.json().catch(() => ({}))).token

    if (!token) {
      return new Response(JSON.stringify({ error: 'token requerido' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 1. Buscar mesa por token
    const { data: mesa, error: mesaErr } = await supabase
      .from('mesas')
      .select('id, codigo, nombre, restaurante_id, qr_habilitado, qr_modo_pago')
      .eq('qr_token', token)
      .single()

    if (mesaErr || !mesa) {
      return new Response(JSON.stringify({ error: 'QR no válido o expirado' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (!mesa.qr_habilitado) {
      return new Response(JSON.stringify({ error: 'QR no activo en esta mesa' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 2. Restaurante
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('id, nombre, stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', mesa.restaurante_id)
      .single()

    // 3. Carta activa
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, imagen_url, categoria, alergenos, activo')
      .eq('restaurante_id', mesa.restaurante_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre')

    // 4. Sesión activa existente para esta mesa
    let sesion = null
    if (req.method === 'GET') {
      const { data: sesionExistente } = await supabase
        .from('qr_sesiones_cliente')
        .select('id, estado, payment_method_id')
        .eq('mesa_id', mesa.id)
        .eq('estado', 'activa')
        .order('creado_en', { ascending: false })
        .limit(1)
        .single()
      sesion = sesionExistente
    }

    // 5. POST: crear nueva sesión
    if (req.method === 'POST') {
      const { data: nuevaSesion } = await supabase
        .from('qr_sesiones_cliente')
        .insert({ restaurante_id: mesa.restaurante_id, mesa_id: mesa.id })
        .select('id')
        .single()
      sesion = nuevaSesion
    }

    return new Response(JSON.stringify({
      ok: true,
      mesa: { id: mesa.id, codigo: mesa.codigo, nombre: mesa.nombre, qr_modo_pago: mesa.qr_modo_pago },
      restaurante: { id: rest?.id, nombre: rest?.nombre, connect_activo: rest?.stripe_connect_onboarded },
      productos: productos || [],
      sesion_id: sesion?.id || null,
      tiene_tarjeta: !!sesion?.payment_method_id,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
