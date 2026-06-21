// qr-session v4 — Crea/obtiene sesión de cliente QR
// GET  ?token=xxx[&device_id=yyy]        → valida token, devuelve restaurante+mesa+carta+config
// POST { token, num_comensales, device_id?, nombre_cliente?, tipo? } → crea/recupera sesión
// PATCH { sesion_id, num_comensales?, precio_fijo_aplicado?, nombre_cliente? } → actualiza
// v3: devuelve cobro.llamar_camarero (100% autoservicio)
// v4: cuenta individual — cada móvil (device_id) abre su propia subcuenta bajo la mesa.
//     cobro.modo_consumo: 'mesa_unica' | 'individual' | 'cliente_elige' (configurable por el dueño)

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
    const body = !isGet ? await req.json().catch(() => ({})) : {}
    const token = isGet ? url.searchParams.get('token') : body.token

    if (!token && !isPatch) {
      return res400('token requerido')
    }

    // PATCH: actualizar num_comensales / nombre en sesión existente
    if (isPatch) {
      const { sesion_id, num_comensales, precio_fijo_aplicado, nombre_cliente } = body
      if (!sesion_id) return res400('sesion_id requerido')
      const patch: Record<string, unknown> = {}
      if (num_comensales !== undefined) patch.num_comensales = Math.max(1, parseInt(num_comensales) || 1)
      if (precio_fijo_aplicado !== undefined) patch.precio_fijo_aplicado = parseFloat(precio_fijo_aplicado) || 0
      if (nombre_cliente !== undefined) patch.nombre_cliente = String(nombre_cliente).slice(0, 60) || null
      if (Object.keys(patch).length === 0) return res400('nada que actualizar')
      await supabase
        .from('qr_sesiones_cliente')
        .update(patch)
        .eq('id', sesion_id)
        .eq('estado', 'activa')
      return resOK({ updated: true, ...patch })
    }

    // 1. Buscar mesa por token
    const { data: mesa, error: mesaErr } = await supabase
      .from('mesas')
      .select('id, codigo, nombre, local_id, qr_habilitado, qr_modo_pago, qr_precio_fijo_persona, qr_precio_fijo_concepto')
      .eq('qr_token', token)
      .single()

    if (mesaErr || !mesa) return res404('QR no válido o expirado')
    if (!mesa.qr_habilitado)  return res403('QR no activo en esta mesa')

    // 2. Restaurante
    const { data: rest } = await supabase
      .from('restaurantes')
      .select('id, nombre, stripe_connect_account_id, stripe_connect_onboarded, stripe_account_id')
      .eq('id', mesa.local_id)
      .single()

    // 2b. Configuración de cobro (modo_cobro + modo_consumo)
    const { data: cobroConfig } = await supabase
      .from('cobro_config')
      .select('modo_cobro, timer_inactividad_min, qr_llamar_camarero, qr_modo_consumo')
      .eq('local_id', mesa.local_id)
      .single()

    const modoConsumo = cobroConfig?.qr_modo_consumo || 'mesa_unica'

    const cobroOut = {
      modo_cobro: cobroConfig?.modo_cobro || 'cuenta_abierta',
      timer_min: cobroConfig?.timer_inactividad_min || 45,
      llamar_camarero: cobroConfig?.qr_llamar_camarero !== false,
      modo_consumo: modoConsumo,
    }

    const restOut = {
      id: rest?.id, nombre: rest?.nombre,
      connect_activo: rest?.stripe_connect_onboarded,
      stripe_account_id: rest?.stripe_account_id || null,
    }

    const mesaOut = {
      id: mesa.id, codigo: mesa.codigo, nombre: mesa.nombre,
      qr_modo_pago: mesa.qr_modo_pago,
      precio_fijo_persona: mesa.qr_precio_fijo_persona,
      precio_fijo_concepto: mesa.qr_precio_fijo_concepto || 'Cubierto',
    }

    // 3. Carta activa
    const { data: productos } = await supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, imagen_url, categoria, alergenos, activo')
      .eq('local_id', mesa.local_id)
      .eq('activo', true)
      .order('categoria')
      .order('nombre')

    // 4. GET: devolver config sin crear sesión
    if (isGet) {
      const deviceId = url.searchParams.get('device_id')
      // En modo individual buscamos la subcuenta de ESTE móvil; si no, la cuenta de mesa.
      let q = supabase
        .from('qr_sesiones_cliente')
        .select('id, estado, payment_method_id, preauth_completado, num_comensales, precio_fijo_aplicado, tipo, nombre_cliente')
        .eq('mesa_id', mesa.id)
        .eq('estado', 'activa')
        .order('creado_en', { ascending: false })
        .limit(1)

      if (modoConsumo !== 'mesa_unica' && deviceId) {
        q = q.eq('device_id', deviceId)
      } else {
        q = q.eq('tipo', 'mesa')
      }

      const { data: sesionExistente } = await q.maybeSingle()

      return resOK({
        mesa: mesaOut,
        restaurante: restOut,
        cobro: cobroOut,
        productos: productos || [],
        sesion_id: sesionExistente?.id || null,
        num_comensales: sesionExistente?.num_comensales || null,
        precio_fijo_aplicado: sesionExistente?.precio_fijo_aplicado || 0,
        tipo: sesionExistente?.tipo || null,
        nombre_cliente: sesionExistente?.nombre_cliente || null,
        tiene_tarjeta: !!sesionExistente?.payment_method_id || !!sesionExistente?.preauth_completado,
      })
    }

    // 5. POST: crear (o recuperar) sesión
    const num_comensales = Math.max(1, parseInt(body.num_comensales) || 1)
    const deviceId = body.device_id ? String(body.device_id).slice(0, 80) : null
    const nombreCliente = body.nombre_cliente ? String(body.nombre_cliente).slice(0, 60) : null
    // tipo efectivo: en modo_unica siempre 'mesa'; si no, lo que pida el cliente (default individual)
    const tipo = modoConsumo === 'mesa_unica'
      ? 'mesa'
      : (body.tipo === 'mesa' ? 'mesa' : 'individual')

    // Recuperar subcuenta activa de este móvil (evita duplicar al recargar)
    if (tipo === 'individual' && deviceId) {
      const { data: existente } = await supabase
        .from('qr_sesiones_cliente')
        .select('id, num_comensales, precio_fijo_aplicado')
        .eq('mesa_id', mesa.id)
        .eq('device_id', deviceId)
        .eq('estado', 'activa')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existente) {
        if (nombreCliente) {
          await supabase.from('qr_sesiones_cliente')
            .update({ nombre_cliente: nombreCliente }).eq('id', existente.id)
        }
        return resOK({
          sesion_id: existente.id, num_comensales: existente.num_comensales || num_comensales,
          precio_fijo_aplicado: existente.precio_fijo_aplicado || 0, tipo, nombre_cliente: nombreCliente,
          mesa: mesaOut, restaurante: restOut, cobro: cobroOut, productos: productos || [],
        })
      }
    }

    // En individual no aplicamos precio fijo por mesa multiplicado por comensales globales
    const precio_fijo_persona = mesa.qr_precio_fijo_persona || 0
    const precio_fijo_aplicado = (tipo === 'mesa' && precio_fijo_persona > 0)
      ? Math.round(precio_fijo_persona * num_comensales * 100) / 100
      : (tipo === 'individual' && precio_fijo_persona > 0 ? precio_fijo_persona : 0)

    const { data: nuevaSesion } = await supabase
      .from('qr_sesiones_cliente')
      .insert({
        local_id: mesa.local_id,
        mesa_id: mesa.id,
        num_comensales: tipo === 'individual' ? 1 : num_comensales,
        precio_fijo_aplicado,
        // device_id solo identifica subcuentas individuales; en 'mesa' va null para
        // no chocar con el índice único parcial (mesa_id, device_id) WHERE activa.
        device_id: tipo === 'individual' ? deviceId : null,
        nombre_cliente: nombreCliente,
        tipo,
      })
      .select('id')
      .single()

    return resOK({
      sesion_id: nuevaSesion?.id,
      num_comensales: tipo === 'individual' ? 1 : num_comensales,
      precio_fijo_aplicado,
      tipo,
      nombre_cliente: nombreCliente,
      mesa: mesaOut,
      restaurante: restOut,
      cobro: cobroOut,
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
