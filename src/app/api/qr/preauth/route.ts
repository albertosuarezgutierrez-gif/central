// POST /api/qr/preauth
// Crea un Stripe SetupIntent para capturar la tarjeta del cliente en modo pre_auth
// El PM guardado permite cobrar si el cliente se va sin pagar
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })

export async function POST(req: NextRequest) {
  try {
    const { sesion_id, restaurante_id } = await req.json()

    if (!sesion_id || !restaurante_id) {
      return NextResponse.json({ error: 'sesion_id y restaurante_id requeridos' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Verificar que la sesión existe y está activa
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, estado, preauth_completado, restaurante_id')
      .eq('id', sesion_id)
      .eq('restaurante_id', restaurante_id)
      .single()

    if (!sesion) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    if (sesion.estado !== 'activa') {
      return NextResponse.json({ error: 'Sesión no activa' }, { status: 400 })
    }

    // Si ya tiene pre-auth completado, devolver éxito directo
    if (sesion.preauth_completado) {
      return NextResponse.json({ ok: true, ya_completado: true })
    }

    // Obtener la cuenta Connect del restaurante
    const { data: restaurante } = await supabase
      .from('restaurantes')
      .select('stripe_account_id')
      .eq('id', restaurante_id)
      .single()

    // Crear SetupIntent en la cuenta del restaurante
    // usage: off_session → permite cobrar más tarde sin que el cliente esté presente
    const setupIntent = await getStripe().setupIntents.create(
      {
        usage: 'off_session',
        payment_method_types: ['card'],
        metadata: {
          sesion_id,
          restaurante_id,
          tipo: 'qr_preauth',
        },
      },
      restaurante?.stripe_account_id
        ? { stripeAccount: restaurante.stripe_account_id }
        : {}
    )

    // Guardar el setup intent en la sesión
    await supabase
      .from('qr_sesiones_cliente')
      .update({ preauth_setup_intent_id: setupIntent.id })
      .eq('id', sesion_id)

    return NextResponse.json({
      ok: true,
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
      stripe_account_id: restaurante?.stripe_account_id || null,
    })
  } catch (error: any) {
    console.error('[qr/preauth] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/qr/preauth — Confirmar que la tarjeta fue añadida correctamente
export async function PATCH(req: NextRequest) {
  try {
    const { sesion_id, payment_method_id } = await req.json()

    if (!sesion_id || !payment_method_id) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const supabase = createServerClient()

    await supabase
      .from('qr_sesiones_cliente')
      .update({
        preauth_payment_method_id: payment_method_id,
        preauth_completado: true,
      })
      .eq('id', sesion_id)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
