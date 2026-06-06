// qr-cobro v2 — Crea Stripe Checkout Session en la cuenta Connect del restaurante
// POST { sesion_id, propina_pct, success_url, cancel_url }
// v2: en sesiones 'individual' suma SOLO los items de esa subcuenta (comandas.sesion_qr_id);
//     en sesiones de mesa mantiene la suma por mesa (comportamiento actual).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { sesion_id, propina_pct = 0, success_url, cancel_url } = await req.json()

    // 1. Obtener sesión y datos del restaurante
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, restaurante_id, mesa_id, estado, tipo')
      .eq('id', sesion_id)
      .eq('estado', 'activa')
      .single()

    if (!sesion) {
      return new Response(JSON.stringify({ error: 'Sesión no válida o ya pagada' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { data: rest } = await supabase
      .from('restaurantes')
      .select('nombre, stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', sesion.restaurante_id)
      .single()

    if (!rest?.stripe_connect_onboarded || !rest.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: 'El restaurante no tiene pagos QR configurados' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 2. Calcular total. En individual sumamos SOLO los items de esta subcuenta
    //    (comandas.sesion_qr_id); en mesa, todos los items QR de la mesa (legado).
    let itemsQuery = supabase
      .from('comanda_items')
      .select('precio_unitario, cantidad, comandas!inner(mesa_id, origen, restaurante_id, sesion_qr_id)')
      .eq('comandas.origen', 'qr_cliente')
      .eq('comandas.restaurante_id', sesion.restaurante_id)

    if (sesion.tipo === 'individual') {
      itemsQuery = itemsQuery.eq('comandas.sesion_qr_id', sesion.id)
    } else {
      itemsQuery = itemsQuery.eq('comandas.mesa_id', sesion.mesa_id)
    }

    const { data: items } = await itemsQuery

    // En 'mesa' la suma por mesa NO debe incluir lo de subcuentas individuales
    // (modo cliente_elige): cada individual paga lo suyo aparte, así que el que
    // elige "cuenta de mesa" no debe cargar con las cañas de los individuales.
    let excluirSesiones = new Set<string>()
    if (sesion.tipo !== 'individual') {
      const { data: indiv } = await supabase
        .from('qr_sesiones_cliente')
        .select('id')
        .eq('mesa_id', sesion.mesa_id)
        .eq('tipo', 'individual')
      excluirSesiones = new Set((indiv || []).map((s: any) => s.id))
    }

    let subtotal = 0
    for (const item of items || []) {
      const sqid = (item as any).comandas?.sesion_qr_id
      if (sesion.tipo !== 'individual' && sqid && excluirSesiones.has(sqid)) continue
      subtotal += item.precio_unitario * item.cantidad
    }

    const iva = subtotal * 0.10
    const totalComandas = subtotal + iva

    // Precio fijo por persona (cubierto / menú)
    const { data: sesionData } = await supabase
      .from('qr_sesiones_cliente')
      .select('num_comensales, precio_fijo_aplicado, mesas(qr_precio_fijo_concepto)')
      .eq('id', sesion_id)
      .single()

    const precio_fijo = sesionData?.precio_fijo_aplicado || 0
    const concepto_fijo = (sesionData?.mesas as any)?.qr_precio_fijo_concepto || 'Cubierto'
    const total = totalComandas + precio_fijo
    const propina = propina_pct > 0 ? total * propina_pct / 100 : 0
    const totalConPropina = total + propina

    if (totalConPropina <= 0) {
      return new Response(JSON.stringify({ error: 'Total 0, no hay nada que cobrar' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // 3. Comisión ia.rest: 0.5% del total
    const applicationFee = Math.round(totalConPropina * 0.005 * 100) // en céntimos

    // 4. Crear Checkout Session en la cuenta Connect del restaurante
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(totalComandas * 100),
            product_data: { name: `Consumición en ${rest.nombre}`, description: 'IVA incluido' },
          },
          quantity: 1,
        },
        ...(precio_fijo > 0 ? [{
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(precio_fijo * 100),
            product_data: {
              name: concepto_fijo,
              description: `${sesionData?.num_comensales} persona${sesionData?.num_comensales !== 1 ? 's' : ''}`,
            },
          },
          quantity: 1,
        }] : []),
        ...(propina > 0 ? [{
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(propina * 100),
            product_data: { name: 'Propina', description: `${propina_pct}% — Gracias al equipo` },
          },
          quantity: 1,
        }] : []),
      ],
      success_url: success_url || `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/q/success?sesion=${sesion_id}`,
      cancel_url: cancel_url || `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/q/cancel?sesion=${sesion_id}`,
      metadata: { sesion_id, restaurante_id: sesion.restaurante_id, mesa_id: sesion.mesa_id },
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: rest.stripe_connect_account_id },
      },
    })

    // 5. Guardar checkout_session_id y propina en sesión
    await supabase
      .from('qr_sesiones_cliente')
      .update({
        checkout_session_id: session.id,
        propina_pct,
        propina_amt: propina,
        total_cobrado: totalConPropina,
      })
      .eq('id', sesion_id)

    return new Response(JSON.stringify({
      ok: true,
      checkout_url: session.url,
      total: totalConPropina,
      desglose: { subtotal, iva, precio_fijo, concepto_fijo, propina, total: totalConPropina }
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
