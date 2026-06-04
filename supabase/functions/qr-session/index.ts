// qr-session v3 — Crea/obtiene sesión de cliente QR
// GET  ?token=xxx                        → valida token, devuelve restaurante+mesa+carta+config precio fijo
// POST { token, num_comensales }         → crea sesión activa con número de comensales
// v3: devuelve cobro.llamar_camarero (configurable por el dueño; 100% autoservicio)

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
    const isGet = req.method === 'GET'
    const isPatch = req.method === 'PATCH'
    const token = isGet
      ? url.searchParams.get('token')
      : (await req.json().catch(() => ({}))).token

    if (!token && !isPatch) {
      return res400('token requerido')
    }

    // PATCH: actualizar num_comensales en sesión existente (flujo pre_auth + precio_fijo)
    if (isPatch) {
      const body = await req.json().catch(() => ({}))
      const { sesion_id, num_comensales, precio_fijo_aplicado } = body
      if (!sesion_id) return res400('sesion_id requerido')
      const nc = Math.max(1, parseInt(num_comensales) || 1)
      const pf = parseFloat(precio_fijo_aplicado) || 0
      await supabase
        .from('qr_sesiones_cliente')
        .update({ num_comensales: nc, precio_fijo_aplicado: pf })
        .eq('id', sesion_id)
        .eq('estado', 'activa')
      return resOK({ updated: true, num_comensales: nc, precio_fijo_aplicado: pf })
    }

    // 1. Buscar mesa por token
    const { data: mesa, error: mesaErr } = await supabase
      .from('mesas')
      .select('id, codigo, nombre, restaurante_id, qr_habilitado, qr_modo_pago, qr_precio_fijo_persona, qr_precio_fijo_concepto')
      .eq('qr_token', token)
      .single()

    if (mesaErr || !mesa) return res404('QR no válido o expirado')
    if (!mesa.qr_habilitado)  return res403('QR no activo en esta mesa')

    // 2. Restaurante
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('id, nombre, stripe_connect_account_id, stripe_connect_onboarded, stripe_account_id')
      .eq('id', mesa.restaurante_id)
      .single()

    // 2b. Configuración de cobro (modo pre_auth / por_ronda / cuenta_abierta)
    const { data: cobroConfig } = await supabase
      .from('cobro_config')
      .select('modo_cobro, timer_inactividad_min, qr_llamar_camarero')
      .eq('restaurante_id', mesa.restaurante_id)
      .single()

    // 3. Carta activa
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, imagen_url, categoria, alergenos, activo')
      .eq('restaurante_id', mesa.restaurante_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre')

    // 4. GET: devolver config sin crear sesión
    if (isGet) {
      const { data: sesionExistente } = await supabase
        .from('qr_sesiones_cliente')
        .select('id, estado, payment_method_id, num_comensales, precio_fijo_aplicado')
        .eq('mesa_id', mesa.id)
        .eq('estado', 'activa')
        .order('creado_en', { ascending: false })
        .limit(1)
        .single()

      return resOK({
        mesa: {
          id: mesa.id, codigo: mesa.codigo, nombre: mesa.nombre,
          qr_modo_pago: mesa.qr_modo_pago,
          precio_fijo_persona: mesa.qr_precio_fijo_persona,
          precio_fijo_concepto: mesa.qr_precio_fijo_concepto || 'Cubierto',
        },
        restaurante: {
          id: rest?.id, nombre: rest?.nombre,
          connect_activo: rest?.stripe_connect_onboarded,
          stripe_account_id: rest?.stripe_account_id || null,
        },
        cobro: {
          modo_cobro: cobroConfig?.modo_cobro || 'cuenta_abierta',
          timer_min: cobroConfig?.timer_inactividad_min || 45,
          llamar_camarero: cobroConfig?.qr_llamar_camarero !== false,
        },
        productos: productos || [],
        sesion_id: sesionExistente?.id || null,
        num_comensales: sesionExistente?.num_comensales || null,
        precio_fijo_aplicado: sesionExistente?.precio_fijo_aplicado || 0,
        tiene_tarjeta: !!sesionExistente?.payment_method_id,
      })
    }

    // 5. POST: crear sesión con num_comensales
    const body = await req.json().catch(() => ({}))
    const num_comensales = Math.max(1, parseInt(body.num_comensales) || 1)
    const precio_fijo_persona = mesa.qr_precio_fijo_persona || 0
    const precio_fijo_aplicado = precio_fijo_persona > 0
      ? Math.round(precio_fijo_persona * num_comensales * 100) / 100
      : 0

    const { data: nuevaSesion } = await supabase
      .from('qr_sesiones_cliente')
      .insert({
        restaurante_id: mesa.restaurante_id,
        mesa_id: mesa.id,
        num_comensales,
        precio_fijo_aplicado,
      })
      .select('id')
      .single()

    return resOK({
      sesion_id: nuevaSesion?.id,
      num_comensales,
      precio_fijo_aplicado,
      mesa: {
        id: mesa.id, codigo: mesa.codigo, nombre: mesa.nombre,
        qr_modo_pago: mesa.qr_modo_pago,
        precio_fijo_persona,
        precio_fijo_concepto: mesa.qr_precio_fijo_concepto || 'Cubierto',
      },
      restaurante: {
        id: rest?.id, nombre: rest?.nombre,
        connect_activo: rest?.stripe_connect_onboarded,
        stripe_account_id: rest?.stripe_account_id || null,
      },
      cobro: {
        modo_cobro: cobroConfig?.modo_cobro || 'cuenta_abierta',
        timer_min: cobroConfig?.timer_inactividad_min || 45,
        llamar_camarero: cobroConfig?.qr_llamar_camarero !== false,
      },
      productos: productos || [],
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const resOK  = (d: object) => new Response(JSON.stringify({ ok: true, ...d }), { headers: h })
const res400 = (e: string) => new Response(JSON.stringify({ error: e }), { status: 400, headers: h })
const res403 = (e: string) => new Response(JSON.stringify({ error: e }), { status: 403, headers: h })
const res404 = (e: string) => new Response(JSON.stringify({ error: e }), { status: 404, headers: h })
