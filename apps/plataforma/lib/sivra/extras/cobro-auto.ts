// lib/sivra/extras/cobro-auto.ts — el huésped dice que sí y le llega el enlace de pago.
//
// 🚨 ESTO ENVÍA DINERO AL HUÉSPED SIN QUE ALBERTO TOQUE NADA, y contradice la regla escrita de que
// el dinero nunca se auto-envía. Es decisión suya (28/08/2026), así que va ATADO POR CÓDIGO y no
// por criterio del modelo. Se exige TODO:
//   1. Existe fila `ofrecido` para esta reserva y este extra — y esa fila SOLO la crea el botón ✅
//      de Telegram, así que «el precio lo aprobó Alberto» es un hecho de la BD, no una inferencia.
//   2. El mensaje del huésped pasa `esAceptacion`, que es deliberadamente estrecho.
//   3. El importe sale del catálogo. La IA no interviene en ningún punto de este camino.
// Regatear, pedir dos cunas o preguntar si se puede pagar en efectivo NO son aceptaciones y siguen
// yendo a Telegram como cualquier otro mensaje.
import { esAceptacion } from '@/lib/sivra/agente-huesped/extras'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { ofertaPendiente, marcarEnlaceEnviado } from './reserva'
import { extraDeCatalogo, nombreEnIdioma } from './catalogo'
import { crearEnlacePago, stripeDisponible } from './stripe'
import { tgSend, escapeHtml } from '@central/core-telegram'
import { eur } from '@/lib/dinero'
import type { Contexto } from '@/lib/sivra/agente-huesped/contexto'

/** Texto del mensaje al huésped, en su idioma. Literal, sin IA: es un cobro, no un borrador. */
const MENSAJE: Record<string, (extra: string, importe: string, url: string) => string> = {
  es: (e, i, u) => `¡Perfecto! Aquí tienes el enlace para pagar ${e.toLowerCase()} (${i}):\n${u}\nEn cuanto esté pagado lo dejamos preparado para tu llegada.`,
  en: (e, i, u) => `Perfect! Here is the link to pay for ${e.toLowerCase()} (${i}):\n${u}\nAs soon as it is paid we will have it ready for your arrival.`,
  fr: (e, i, u) => `Parfait ! Voici le lien pour régler ${e.toLowerCase()} (${i}) :\n${u}\nDès le paiement reçu, tout sera prêt pour votre arrivée.`,
  de: (e, i, u) => `Perfekt! Hier ist der Zahlungslink für ${e.toLowerCase()} (${i}):\n${u}\nSobald die Zahlung eingeht, steht alles für Ihre Ankunft bereit.`,
  it: (e, i, u) => `Perfetto! Ecco il link per pagare ${e.toLowerCase()} (${i}):\n${u}\nAppena sarà pagato prepareremo tutto per il suo arrivo.`,
}

export type ResultadoCobro = { enviado: true } | { enviado: false; motivo: string }

/**
 * Si procede, manda el enlace de pago y devuelve `enviado:true` — el llamador debe entonces cortar
 * el flujo normal (ya se ha respondido al huésped).
 *
 * Cualquier duda devuelve `enviado:false` con el motivo, y el mensaje sigue su camino habitual
 * hacia la propuesta por Telegram. NUNCA se inventa un precio ni se envía sin oferta previa.
 */
export async function intentarCobroAutomatico(ctx: Contexto, pregunta: string): Promise<ResultadoCobro> {
  if (!esAceptacion(pregunta)) return { enviado: false, motivo: 'no_es_aceptacion' }

  const oferta = await ofertaPendiente(ctx.bookingId)
  if (!oferta) return { enviado: false, motivo: 'sin_oferta_aprobada' }

  const catalogo = await extraDeCatalogo(oferta.codigo, oferta.property_id)
  if (!catalogo) return { enviado: false, motivo: 'extra_fuera_de_catalogo' }

  // El precio que se cobra es el que se PROMETIÓ al ofertar. Si el catálogo ha cambiado desde
  // entonces, manda lo prometido y se avisa: cobrar otra cosa sería cambiar el trato a mitad.
  if (catalogo.precio_cents !== oferta.precio_cents) {
    await tgSend(
      `⚠️ <b>El catálogo cambió después de ofertar</b>\n` +
      `${escapeHtml(ctx.property)} · reserva ${escapeHtml(ctx.bookingId)}: se ofertó ` +
      `${eur(oferta.precio_cents / 100)} y el catálogo dice ${eur(catalogo.precio_cents / 100)}. ` +
      `Se cobra lo ofertado.`,
    ).catch(() => {})
  }

  if (!stripeDisponible()) return { enviado: false, motivo: 'stripe_sin_configurar' }

  const lang = MENSAJE[ctx.lang] ? ctx.lang : 'en'
  const nombre = nombreEnIdioma(catalogo, lang)
  const enlace = await crearEnlacePago({
    bookingId: oferta.booking_id,
    propertyId: oferta.property_id,
    codigo: oferta.codigo,
    precioCents: oferta.precio_cents,
    nombre,
  })
  if (!enlace) return { enviado: false, motivo: 'stripe_no_devolvio_enlace' }

  const texto = MENSAJE[lang](nombre, eur(oferta.precio_cents / 100), enlace.url)
  const ok = await enviarAlHuesped(ctx.reservationId, texto)
  if (!ok) return { enviado: false, motivo: 'smoobu_rechazo_el_envio' }

  await marcarEnlaceEnviado(oferta.id, enlace.paymentLinkId)
  // Copia informativa: sale dinero sin que Alberto pulse nada, así que ve exactamente qué salió.
  await tgSend(
    `💳 <b>Enlace de pago enviado</b> · ${escapeHtml(ctx.property)}\n` +
    `${escapeHtml(nombre)} — ${eur(oferta.precio_cents / 100)} (reserva ${escapeHtml(ctx.bookingId)})\n` +
    `<i>El huésped aceptó el precio que tú aprobaste en este hilo.</i>`,
  ).catch(() => {})
  return { enviado: true }
}
