// lib/sivra/extras/stripe.ts — enlace de pago del extra.
//
// Por qué Stripe y no el enlace de Smoobu (decisión de Alberto, 28/08/2026): lo importante no es
// cobrar —Smoobu cobra igual de bien— sino SABER que ha pagado. Con webhook, «pagado» es un hecho
// que dispara el aviso a la limpieza solo; sin él sería un NULL que alguien tiene que ir a mirar, y
// un extra pendiente que nadie mira acaba siendo una cuna sin montar.
import { createStripe } from '@central/core-payments'

/** Sin clave configurada NO se cobra: el flujo cae a la propuesta por Telegram de siempre. */
export function stripeDisponible(): boolean {
  return !!process.env.STRIPE_SECRET_KEY_SIVRA
}

export interface EnlacePago { url: string; paymentLinkId: string }

/**
 * Crea un Payment Link de un solo uso para este extra.
 *
 * La `metadata` es lo que ata el cobro a la reserva: el webhook no adivina nada, lee de aquí. El
 * precio llega en céntimos DESDE EL CATÁLOGO — esta función no sabe cuánto cuesta una cuna y no
 * debe saberlo.
 */
export async function crearEnlacePago(p: {
  bookingId: string
  propertyId: string
  codigo: string
  precioCents: number
  nombre: string
}): Promise<EnlacePago | null> {
  if (!stripeDisponible()) return null
  try {
    const stripe = createStripe(process.env.STRIPE_SECRET_KEY_SIVRA)
    const metadata = { booking_id: p.bookingId, property_id: p.propertyId, codigo: p.codigo }

    // 🚨 Un Payment Link exige un `price` YA CREADO: `line_items[].price_data` es de Checkout
    // Sessions y aquí Stripe lo rechaza. Y una Checkout Session no vale para este caso porque
    // caduca a las 24 h como mucho — justo cuando sale nuestro recordatorio de impago. Así que
    // se crea el precio primero (inline, con su producto) y el enlace después.
    const precio = await stripe.prices.create({
      currency: 'eur',
      unit_amount: p.precioCents,
      product_data: { name: p.nombre },
      metadata,
    })

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: precio.id, quantity: 1 }],
      metadata,
      // Un extra de una reserva se paga UNA vez: en cuanto se completa un pago el enlace deja de
      // aceptar más. Sin esto un huésped podría pagar dos veces la misma cuna.
      restrictions: { completed_sessions: { limit: 1 } },
      payment_intent_data: { metadata },
    })
    return { url: link.url, paymentLinkId: link.id }
  } catch (e: unknown) {
    console.error('[extras/stripe] no se pudo crear el enlace:', (e as Error)?.message)
    return null
  }
}
