// /api/sivra/extras/webhook — Stripe avisa de que el huésped ha pagado un extra.
//
// Este endpoint es el que convierte «le mandamos un enlace» en «está pagado», y es lo único que
// autoriza el aviso a la limpieza. Sin él tendríamos que entrar a Stripe a mirar, que es justo la
// razón por la que se descartó el enlace de pago de Smoobu.
import { NextRequest, NextResponse } from 'next/server'
import { createStripe } from '@central/core-payments'
import { requireSecret } from '@central/core-identity'
import { escapeHtml, tgAviso } from '@/lib/telegram'
import { marcarPagado, marcarAvisoLimpieza } from '@/lib/sivra/extras/reserva'
import { extraDeCatalogo, nombreEnIdioma } from '@/lib/sivra/extras/catalogo'
import { avisarLimpieza } from '@/lib/sivra/extras/aviso-limpieza'
import { construirContexto } from '@/lib/sivra/agente-huesped/contexto'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const firma = req.headers.get('stripe-signature')
  if (!firma) return NextResponse.json({ error: 'sin firma' }, { status: 400 })

  // 🚨 El secreto que VALIDA la firma nunca cae a un literal: `requireSecret` lanza en producción si
  // falta, y aquí eso es lo correcto — sin poder verificar la firma, cualquiera podría declarar
  // pagado un extra que nadie ha pagado. Lo vigila `test/regression-secrets.test.ts`.
  let secreto: string
  try {
    secreto = requireSecret('STRIPE_WEBHOOK_SECRET_SIVRA')
  } catch {
    console.error('[extras/webhook] falta STRIPE_WEBHOOK_SECRET_SIVRA')
    return NextResponse.json({ error: 'webhook no configurado' }, { status: 500 })
  }

  const crudo = await req.text()
  const stripe = createStripe(process.env.STRIPE_SECRET_KEY_SIVRA)
  let evento: { type: string; data: { object: Record<string, unknown> } }
  try {
    evento = stripe.webhooks.constructEvent(crudo, firma, secreto) as never
  } catch (e: unknown) {
    console.error('[extras/webhook] firma inválida:', (e as Error)?.message)
    return NextResponse.json({ error: 'firma inválida' }, { status: 400 })
  }

  if (evento.type !== 'checkout.session.completed') return NextResponse.json({ ok: true, ignorado: evento.type })

  const sesion = evento.data.object
  const meta = (sesion.metadata ?? {}) as Record<string, string>
  const paymentLinkId = typeof sesion.payment_link === 'string' ? sesion.payment_link : undefined
  const paymentIntentId = typeof sesion.payment_intent === 'string' ? sesion.payment_intent : `sess_${sesion.id}`

  // Idempotente: si devuelve null, este cobro ya estaba marcado y NO se vuelve a avisar.
  const fila = await marcarPagado({
    paymentLinkId,
    bookingId: meta.booking_id,
    codigo: meta.codigo,
    paymentIntentId,
  })
  if (!fila) return NextResponse.json({ ok: true, yaProcesado: true })

  const catalogo = await extraDeCatalogo(fila.codigo, fila.property_id)
  const ctx = await construirContexto(fila.booking_id, 'es').catch(() => null)
  const nombre = catalogo ? nombreEnIdioma(catalogo, 'es') : fila.codigo

  const aviso = catalogo?.avisa_limpieza === false
    ? { ok: true as const }
    : await avisarLimpieza({
        piso: ctx?.property || fila.property_id,
        checkIn: ctx?.checkIn || '',
        checkOut: ctx?.checkOut || '',
        huesped: ctx?.guestName,
        extra: nombre,
        instruccion: catalogo?.instruccion_limpieza || `Preparar «${nombre}» para esta estancia.`,
        precioCents: fila.precio_cents,
      })
  await marcarAvisoLimpieza(fila.id, aviso)

  // Copia informativa a Alberto: el dinero entra sin que él toque nada, así que se entera igual.
  await tgAviso('pisos.extras-pagado', 
    `💰 <b>Extra cobrado</b> · ${escapeHtml(ctx?.property || fila.property_id)}\n` +
    `${escapeHtml(nombre)} — ${eur(fila.precio_cents / 100)} (reserva ${escapeHtml(fila.booking_id)})\n` +
    (aviso.ok ? `📧 Limpieza avisada.` : `🛑 <b>La limpieza NO ha podido ser avisada.</b>`),
  ).catch(() => {})

  return NextResponse.json({ ok: true, avisoLimpieza: aviso.ok })
}
