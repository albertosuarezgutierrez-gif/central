// lib/sivra/extras/stripe.ts — enlace de pago del extra.
//
// Por qué Stripe y no el enlace de Smoobu (decisión de Alberto, 28/08/2026): lo importante no es
// cobrar —Smoobu cobra igual de bien— sino SABER que ha pagado. Con webhook, «pagado» es un hecho
// que dispara el aviso a la limpieza solo; sin él sería un NULL que alguien tiene que ir a mirar, y
// un extra pendiente que nadie mira acaba siendo una cuna sin montar.
import { createStripe } from '@central/core-payments'
import { tgSend, escapeHtml } from '@central/core-telegram'

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
      // 🚨 Managed Payments viene ACTIVADO POR DEFECTO en las cuentas nuevas (lo estaba en la de
      // SIVRA) y con él Stripe RECHAZA este enlace: exige `tax_code` en el producto y solo admite
      // productos DIGITALES — su propia doc dice que «doesn't support ... selling services», y una
      // cuna montada en un piso de Sevilla es un servicio. Error real contra la cuenta viva:
      // «the product tax code is missing … required for Managed Payments, which is enabled by
      // default on your account». El `catch` de abajo lo habría convertido en `null` y el huésped
      // se habría quedado sin enlace SIN QUE NADA SE PUSIERA ROJO.
      //
      // Y tampoco interesaría aunque encajara: con Managed Payments el MERCHANT OF RECORD pasa a
      // ser Stripe, el huésped ve «LINK.COM*» en su extracto y recibe el recibo como «Sold through
      // Link». Alberto cobra como persona física y sin IVA (decisión 28/08/2026): eso es lo contrario.
      //
      // Se manda explícito en CADA enlace, no solo apagado en el panel: es un ajuste de cuenta que
      // Stripe puede volver a poner por defecto, y el fallo que produce es mudo.
      // El SDK 22.2.0 todavía no tipa el campo; la API sí lo acepta (verificado contra la cuenta
      // real el 29/08/2026). De ahí el spread, que deja el resto del objeto tipado.
      ...({ managed_payments: { enabled: false } } as object),
    })
    return { url: link.url, paymentLinkId: link.id }
  } catch (e: unknown) {
    // 🚨 Este `null` es indistinguible aguas arriba de «Stripe no está configurado»: `cobro-auto`
    // devuelve `stripe_no_devolvio_enlace`, el mensaje sigue su camino normal y NADIE se entera de
    // que Stripe ha rechazado el cobro. Fue exactamente lo que escondió el rechazo de Managed
    // Payments del 29/08/2026, así que el fallo se canta con el motivo REAL que da Stripe: sin él,
    // el diagnóstico es leer código en vez de leer el mensaje.
    const motivo = (e as Error)?.message ?? 'sin detalle'
    console.error('[extras/stripe] no se pudo crear el enlace:', motivo)
    await tgSend(
      `🛑 <b>Stripe ha rechazado el enlace de pago</b>\n` +
      `${escapeHtml(p.nombre)} · reserva ${escapeHtml(p.bookingId)} (${escapeHtml(p.propertyId)})\n` +
      `<code>${escapeHtml(motivo)}</code>\n` +
      `<i>El huésped NO ha recibido nada. El mensaje sigue por el camino normal.</i>`,
    ).catch(() => {})
    return null
  }
}
