// POST /api/qr/webhook — Stripe webhook: checkout.session.completed
// v2: registra cada pago en resumen_cobros_mensual (panel financiero Alberto)
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMISION_RATE = 0.005 // 0,5% ia.rest cobro
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_QR!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { sesion_id, mesa_id, restaurante_id, slot_id } = session.metadata || {}

    if (sesion_id) {
      const supabase = createServerClient()

      if (slot_id) {
        // Pago parcial (división de cuenta)
        await supabase
          .from('qr_division_slots')
          .update({ pagado: true, pagado_en: new Date().toISOString() })
          .eq('id', slot_id)

        // Incrementar contador de slots pagados en la sesión
        await supabase.rpc('increment_division_slots_pagados', { p_sesion_id: sesion_id })

        // Comprobar si todos han pagado → cerrar sesión
        const { data: sesion } = await supabase
          .from('qr_sesiones_cliente')
          .select('division_personas, division_modo, division_slots_pagados')
          .eq('id', sesion_id).single()

        const { count: slotsPagados } = await supabase
          .from('qr_division_slots')
          .select('*', { count: 'exact', head: true })
          .eq('sesion_id', sesion_id).eq('pagado', true)

        const todosHanPagado = sesion?.division_modo === 'por_items'
          ? (slotsPagados || 0) > 0 // en por_items cerramos cuando no quedan items
          : (slotsPagados || 0) >= (sesion?.division_personas || 1)

        if (todosHanPagado) {
          await supabase
            .from('qr_sesiones_cliente')
            .update({ estado: 'pagada', pagado_en: new Date().toISOString() })
            .eq('id', sesion_id)
        }
      } else {
        // Pago completo (sin división)
        await supabase
          .from('qr_sesiones_cliente')
          .update({ estado: 'pagada', pagado_en: new Date().toISOString() })
          .eq('id', sesion_id)
      }

      // ── REGISTRAR EN RESUMEN COBROS (panel financiero Alberto) ──
      if (restaurante_id && session.amount_total) {
        const importeEur = session.amount_total / 100
        const comisionEur = parseFloat((importeEur * COMISION_RATE).toFixed(2))
        try {
          await supabase.rpc('registrar_pago_cobro', {
            p_restaurante_id: restaurante_id,
            p_importe_eur:    importeEur,
            p_comision_eur:   comisionEur,
          })
        } catch (e) {
          console.error('[cobro-resumen] Error registrando pago en resumen:', e)
        }
      }
      // ─────────────────────────────────────────────────────────

      // Push al camarero: mesa pagada vía QR
      const { data: camareros } = await supabase
        .from('camareros')
        .select('id')
        .eq('restaurante_id', restaurante_id)
        .in('rol', ['camarero', 'jefe_sala'])

      for (const cam of camareros || []) {
        await fetch(`${process.env.SUPABASE_URL}/functions/v1/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            camarero_id: cam.id,
            titulo: slot_id ? '💳 Pago parcial QR' : '💳 Pagado por QR',
            cuerpo: slot_id ? `Una persona ha pagado su parte en mesa ${mesa_id}` : `Mesa ${mesa_id} ha pagado desde su móvil`,
            datos: { tipo: slot_id ? 'qr_pago_parcial' : 'qr_pagado', mesa_id, sesion_id }
          })
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
