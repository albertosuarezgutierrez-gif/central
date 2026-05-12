// POST /api/qr/cobrar-preauth
// Cobra una sesión QR que se fue sin pagar usando el PM guardado en pre-auth
// Solo accesible desde /owner o /edge con rol camarero/jefe_sala/owner
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-04-22.dahlia' as any })
const COMISION_RATE = 0.005

async function getRestauranteId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('x-session-token') || req.headers.get('x-ia-session')
  if (!token) return null
  const supabase = createServerClient()
  const { data } = await supabase
    .from('sesiones_activas')
    .select('restaurante_id, rol')
    .eq('token', token)
    .eq('activa', true)
    .single()
  if (!data) return null
  if (!['owner', 'camarero', 'jefe_sala', 'super_admin'].includes(data.rol)) return null
  return data.restaurante_id
}

export async function POST(req: NextRequest) {
  const restauranteId = await getRestauranteId(req)
  if (!restauranteId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { sesion_id, importe_eur } = await req.json()

    if (!sesion_id || !importe_eur || importe_eur <= 0) {
      return NextResponse.json({ error: 'sesion_id e importe_eur requeridos' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Obtener sesión con PM guardado
    const { data: sesion } = await supabase
      .from('qr_sesiones_cliente')
      .select('id, estado, preauth_payment_method_id, preauth_completado, restaurante_id, mesa_id')
      .eq('id', sesion_id)
      .eq('restaurante_id', restauranteId)
      .single()

    if (!sesion) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    if (!sesion.preauth_completado || !sesion.preauth_payment_method_id) {
      return NextResponse.json({ error: 'Esta sesión no tiene tarjeta registrada (pre-auth no completado)' }, { status: 400 })
    }

    if (sesion.estado === 'pagada') {
      return NextResponse.json({ error: 'Esta sesión ya fue pagada' }, { status: 400 })
    }

    // Obtener cuenta Connect del restaurante
    const { data: restaurante } = await supabase
      .from('restaurantes')
      .select('stripe_account_id')
      .eq('id', restauranteId)
      .single()

    const importeCentimos = Math.round(importe_eur * 100)
    const comisionCentimos = Math.round(importeCentimos * COMISION_RATE)

    const stripeOptions = restaurante?.stripe_account_id
      ? { stripeAccount: restaurante.stripe_account_id }
      : {}

    // Crear y confirmar PaymentIntent usando el PM guardado
    const pi = await getStripe().paymentIntents.create(
      {
        amount: importeCentimos,
        currency: 'eur',
        payment_method: sesion.preauth_payment_method_id,
        confirm: true,
        off_session: true,
        application_fee_amount: comisionCentimos,
        metadata: {
          sesion_id,
          restaurante_id: restauranteId,
          tipo: 'qr_cobro_preauth',
          cobrado_por: 'owner',
        },
      },
      stripeOptions
    )

    if (pi.status !== 'succeeded') {
      return NextResponse.json({
        error: `Pago no completado: estado ${pi.status}`,
        stripe_status: pi.status,
      }, { status: 402 })
    }

    // Marcar sesión como pagada
    await supabase
      .from('qr_sesiones_cliente')
      .update({
        estado: 'pagada',
        pagado_en: new Date().toISOString(),
        total_cobrado: importe_eur,
        payment_intent_id: pi.id,
      })
      .eq('id', sesion_id)

    // Registrar en resumen cobros
    const comisionEur = parseFloat((importe_eur * COMISION_RATE).toFixed(2))
    await supabase.rpc('registrar_pago_cobro', {
      p_restaurante_id: restauranteId,
      p_importe_eur:    importe_eur,
      p_comision_eur:   comisionEur,
    })

    return NextResponse.json({
      ok: true,
      cobrado: importe_eur,
      payment_intent_id: pi.id,
      mensaje: `${importe_eur.toFixed(2)}€ cobrados correctamente`,
    })
  } catch (error: any) {
    console.error('[cobrar-preauth] Error:', error)
    // Errores de Stripe (tarjeta rechazada, etc.)
    if (error.type === 'StripeCardError') {
      return NextResponse.json({
        error: 'Tarjeta rechazada: ' + error.message,
        codigo: error.code,
      }, { status: 402 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
