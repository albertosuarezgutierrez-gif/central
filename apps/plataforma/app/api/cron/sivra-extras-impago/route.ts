// /api/cron/sivra-extras-impago — extras con enlace enviado que nadie ha pagado.
//
// Recordatorio suave a las 24 h; a 48 h de la entrada se caduca y se avisa a Alberto. Sin pago NO
// se avisa a la limpieza: la cuna no sale del trastero por un enlace abierto.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend, escapeHtml } from '@central/core-telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { pendientesDeCobro, marcarRecordatorio, marcarCaducado } from '@/lib/sivra/extras/reserva'
import { decidirImpago, horasEntre } from '@/lib/sivra/extras/impago'
import { extraDeCatalogo, nombreEnIdioma } from '@/lib/sivra/extras/catalogo'
import { construirContexto } from '@/lib/sivra/agente-huesped/contexto'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Recordatorio en el idioma del huésped. Literal y sin IA a propósito: es un cron, y una traducción
// que depende de que la pasarela responda es un recordatorio que a veces no sale.
const RECORDATORIO: Record<string, (extra: string, importe: string) => string> = {
  es: (e, i) => `Hola: te dejamos de nuevo el enlace para ${e.toLowerCase()} (${i}). En cuanto esté pagado lo dejamos todo preparado para tu llegada.`,
  en: (e, i) => `Hello! Here is the payment link again for ${e.toLowerCase()} (${i}). As soon as it is paid we will have everything ready for your arrival.`,
  fr: (e, i) => `Bonjour ! Voici à nouveau le lien de paiement pour ${e.toLowerCase()} (${i}). Dès qu'il sera réglé, tout sera prêt pour votre arrivée.`,
  de: (e, i) => `Hallo! Hier ist noch einmal der Zahlungslink für ${e.toLowerCase()} (${i}). Sobald die Zahlung eingeht, bereiten wir alles für Ihre Ankunft vor.`,
  it: (e, i) => `Salve! Le lasciamo di nuovo il link di pagamento per ${e.toLowerCase()} (${i}). Appena sarà pagato prepareremo tutto per il suo arrivo.`,
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const pendientes = await pendientesDeCobro()
  let recordados = 0, caducados = 0
  const ahora = new Date()

  for (const p of pendientes) {
    const ctx = await construirContexto(p.booking_id, 'es').catch(() => null)
    // `checkIn` ilegible → `horasHastaEntrada` null → `decidirImpago` NUNCA caduca. Es deliberado:
    // no haber podido leer la reserva no es lo mismo que saber que la entrada está lejos.
    const entrada = ctx?.checkIn ? new Date(`${ctx.checkIn}T15:00:00Z`) : null
    const accion = decidirImpago({
      horasDesdeEnlace: horasEntre(p.enlace_enviado_at, ahora) ?? 0,
      yaRecordado: !!p.recordatorio_at,
      horasHastaEntrada: entrada && !Number.isNaN(entrada.getTime()) ? horasEntre(ahora, entrada) : null,
    })
    if (accion === 'esperar') continue

    const catalogo = await extraDeCatalogo(p.codigo, p.property_id)
    const lang = ctx?.idiomaReserva && RECORDATORIO[ctx.idiomaReserva] ? ctx.idiomaReserva : 'en'
    const nombre = catalogo ? nombreEnIdioma(catalogo, lang) : p.codigo

    if (accion === 'recordar') {
      const texto = RECORDATORIO[lang](nombre, eur(p.precio_cents / 100))
      const ok = await enviarAlHuesped(ctx?.reservationId || p.booking_id, texto)
      if (ok) { await marcarRecordatorio(p.id); recordados++ }
      continue
    }

    await marcarCaducado(p.id)
    caducados++
    await tgSend(
      `⏳ <b>Extra sin pagar y la entrada es ya</b>\n` +
      `${escapeHtml(ctx?.property || p.property_id)} · ${escapeHtml(nombre)} — ${eur(p.precio_cents / 100)}\n` +
      `Reserva ${escapeHtml(p.booking_id)}. He dejado de esperar el cobro; si quieres ponerla igualmente, dilo tú.`,
    ).catch(() => {})
  }

  const detalle = `${pendientes.length} pendiente(s) · ${recordados} recordado(s) · ${caducados} caducado(s)`
  await registrarLatido('sivra_extras_impago', true, detalle).catch(() => {})
  return NextResponse.json({ ok: true, pendientes: pendientes.length, recordados, caducados })
}
