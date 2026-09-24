// lib/sivra/reservas-booking-vigia.ts — vigía Booking↔Smoobu por correo.
//
// Caso fundacional (30/08/2026): Smoobu se cayó y la reserva de James Ascott (Luxury,
// 27→29/08/2026) NUNCA llegó a `incomes` — la limpieza del 29 no salió en el calendario de
// Si que Brilla y el ingreso no contó. Dos señales alimentan la tabla `reservas_correo_booking`
// (las inserta el triaje de correo):
//   - los avisos de Booking al propietario («⚠️ reserva/cancelación no registrada», y las
//     confirmaciones ordinarias si Booking las reactiva) — parser en lib/correo/reserva-booking.ts;
//   - los mensajes de huésped cuyo nº de confirmación Smoobu NO reconoce (leg B: para James
//     Ascott, Booking no mandó NINGÚN aviso — el correo solo no basta).
//
// verificarReservasBooking() (cron cada 15 min) contrasta cada fila contra Smoobu:
//   nueva + Smoobu la tiene      → confirmada + sync forzado de su ventana (que `incomes` y la
//                                  intranet la cojan YA, sin esperar al cron de las 05:00).
//   nueva + Smoobu NO la tiene   → huerfana + Telegram 🚨 (una vez) + se pinta ⚠️ en la intranet.
//   cancelación + sigue ACTIVA   → huerfana + Telegram 🚨 (el calendario bloquea noches muertas).
//   Smoobu incontactable         → NO se decide nada (no lo sé ≠ no está); se reintenta.
// Hay un cuarto estado, 'descartada', que NO escribe este código: se pone a mano cuando se
// comprueba que la fila nunca fue una reserva (un número pescado de un correo que no era de un
// canal). Al no estar en ('pendiente','huerfana') deja de re-comprobarse y de pintarse ⚠️ en la
// intranet, y no miente diciendo 'confirmada' —que dispararía un ✅ «ya está en Smoobu» falso.
// Las huérfanas se re-comprueban cada pasada: cuando Smoobu se cura, ✅ Telegram de cierre.
//
// 🚨 CORRECCIÓN 01/09/2026 — los tres primeros 🚨 que mandó este vigía fueron FALSOS, y las tres
// reservas estaban en Smoobu y en `incomes`. Dos causas, las dos arregladas aquí:
//   1. El nº que llega de leg B puede ser el **id interno de Smoobu** (los correos de Smoobu
//      enlazan `login.smoobu.com/es/booking/detail/<id>`, que es lo que guarda
//      `incomes.reservationId`), y solo se comparaba contra los campos de REFERENCIA de la OTA.
//      Ahora se compara también contra `b.id`, y antes de preguntar a Smoobu se mira `incomes`.
//   2. Ese correo lo manda el propio Smoobu diciendo «he sincronizado esta reserva»: es prueba de
//      lo contrario de lo que se afirmaba. Ya no entra al vigía (puerta en lib/correo/triaje.ts,
//      parser en lib/correo/smoobu-notificacion.ts).
// Y el canal deja de estar cableado a Booking: entran reservas de Expedia, Agoda y Airbnb, y el
// aviso decía «revisa en Booking» para una reserva de Expedia. Ahora dice el canal REAL, o
// ninguno si el correo no lo publica.
import { prisma } from '@/lib/db'
import { escapeHtml, tgAviso } from '@/lib/telegram'
import { listarReservasVentana, runSync } from '@/lib/sivra/smoobu-sync'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { veredictoAviso, type AvisoReservaBooking } from '@/lib/correo/reserva-booking'
import { PROPS_CALENDARIO } from '@/lib/sivra/constantes'
import { canalDeAsunto } from '@/lib/correo/smoobu-notificacion'

const REVISAR_DIAS = 30      // una fila con >30 días se deja de re-comprobar (queda su estado)
// Sin check-in conocido se busca en hoy−VENTANA_ATRAS .. hoy+VENTANA_ADELANTE.
// 🚨 Eran 180 días hacia delante y se quedaban CORTOS (04/09/2026): la reserva 6144978627 de
// Booking (luis ortiz benito, Luxury Busto) estaba en Smoobu con llegada el 23/04/2027 —ocho meses
// fuera de la ventana— y el vigía la declaró «que Smoobu NO tiene». No mirar ≠ no estar: la
// ventana tiene que cubrir toda la antelación con la que se puede reservar (Booking, ~16 meses).
const VENTANA_ATRAS = 90
const VENTANA_ADELANTE = 540

interface Fila {
  id: bigint
  tipo: string
  origen: string
  ref_booking: string | null
  property_id: string | null
  nombre_piso: string | null
  check_in: Date | null
  estado: string
  asunto: string | null
  avisada_at: Date | null
}

// Inserta el aviso parseado (lo llama el triaje). Idempotente por gmail_message_id.
export async function registrarAvisoBooking(gmailMessageId: string, asunto: string, aviso: AvisoReservaBooking): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO reservas_correo_booking (gmail_message_id, tipo, origen, ref_booking, property_id, nombre_piso, check_in, asunto)
    VALUES (${gmailMessageId}, ${aviso.tipo}, 'aviso_booking', ${aviso.ref}, ${aviso.propertyId},
            ${aviso.nombrePiso}, ${aviso.checkIn}::date, ${asunto.slice(0, 300)})
    ON CONFLICT (gmail_message_id) DO NOTHING
  `
}

// Leg B: un mensaje de huésped trae nº de confirmación pero Smoobu no lo resolvió — puede ser
// una reserva que Smoobu perdió (o simplemente fuera de la ventana del resolutor). Se registra
// como pendiente y el vigía decide con su ventana ancha.
export async function registrarReservaHuesped(gmailMessageId: string, asunto: string, ref: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO reservas_correo_booking (gmail_message_id, tipo, origen, ref_booking, asunto)
    VALUES (${gmailMessageId}, 'nueva', 'mensaje_huesped', ${ref}, ${asunto.slice(0, 300)})
    ON CONFLICT (gmail_message_id) DO NOTHING
  `
}

function iso(d: Date): string { return d.toISOString().slice(0, 10) }
function addDias(base: Date, n: number): string { return iso(new Date(base.getTime() + n * 86400000)) }

// ¿Tiene Smoobu una reserva ACTIVA con esta ref? true/false, o null si no se pudo mirar.
async function activaEnSmoobu(ref: string, checkIn: Date | null): Promise<boolean | null> {
  const hoy = new Date()
  const arrFrom = checkIn ? addDias(checkIn, -3) : addDias(hoy, -VENTANA_ATRAS)
  const arrTo = checkIn ? addDias(checkIn, 3) : addDias(hoy, VENTANA_ADELANTE)
  try {
    const bookings = await listarReservasVentana(arrFrom, arrTo, 800, 10)
    // 🚨 El nº que traemos puede ser la referencia de la OTA **o el id INTERNO de Smoobu**: los
    // correos de Smoobu enlazan la ficha (`login.smoobu.com/es/booking/detail/153896946`) y ese id
    // es justo el que guarda `incomes.reservationId`. Mirar solo los campos de referencia hacía
    // que una reserva presente saliera «desaparecida» (01/09/2026, Expedia 153896946).
    const conRef = bookings.filter(b =>
      String(b.id) === ref ||
      [b['reference-id'], b.apiReference, b.referenceId, b.bookingReference]
        .some(v => v != null && String(v).includes(ref)),
    )
    // Activa = existe y NO es una fila de cancelación (el listado trae ambas con showCancellation=1).
    return conRef.some(b => b.type !== 'cancellation')
  } catch {
    return null
  }
}

// Prueba POSITIVA barata: si el sync ya trajo esta reserva a `incomes`, Smoobu la tiene y no hay
// nada que comprobar contra su API. Vale en UN SOLO sentido: no estar en `incomes` NO prueba que
// Smoobu no la tenga (el sync puede ir por detrás), así que ahí sigue mandando Smoobu. Y solo se
// usa para 'nueva': para una cancelación, una fila vieja de `incomes` diría «sigue activa» sin
// haber mirado nada.
async function yaSincronizada(ref: string): Promise<boolean> {
  const r = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM incomes WHERE "reservationId" = ${ref}
  `
  return Number(r[0]?.n ?? 0) > 0
}

function labelPiso(propertyId: string | null, nombre: string | null): string {
  const p = propertyId ? PROPS_CALENDARIO.find(x => x.id === propertyId) : null
  return p?.label ?? nombre ?? 'piso sin identificar'
}

/**
 * Canal REAL de la reserva. `aviso_booking` viene por definición de un correo de booking.com; el
 * resto lo publica el asunto entre paréntesis. null = el correo no lo dijo, y entonces el aviso
 * NO nombra ningún portal: mandar a Alberto a la extranet de Booking a buscar una reserva de
 * Expedia es afirmar algo que no se ha mirado (01/09/2026).
 */
function canalDeFila(f: Fila): string | null {
  if (f.origen === 'aviso_booking') return 'Booking.com'
  return canalDeAsunto(f.asunto)
}

function lineaReserva(f: Fila): string {
  const fecha = f.check_in ? ` · check-in ${iso(new Date(f.check_in))}` : ''
  const canal = canalDeFila(f)
  return `<b>${escapeHtml(labelPiso(f.property_id, f.nombre_piso))}</b> · reserva ${escapeHtml(f.ref_booking ?? '¿?')}${fecha}` +
    (canal ? ` · canal ${escapeHtml(canal)}` : ' · canal no identificado en el correo')
}

export async function verificarReservasBooking(): Promise<{
  ok: boolean; comprobadas: number; confirmadas: number; huerfanasNuevas: number; sinComprobar: number
}> {
  const filas = await prisma.$queryRaw<Fila[]>`
    SELECT id, tipo, origen, ref_booking, property_id, nombre_piso, check_in, estado, asunto, avisada_at
    FROM reservas_correo_booking
    WHERE estado IN ('pendiente', 'huerfana')
      AND visto_at > now() - make_interval(days => ${REVISAR_DIAS}::int)
      AND ref_booking IS NOT NULL
    ORDER BY visto_at ASC
    LIMIT 20
  `
  const stats = { ok: true, comprobadas: 0, confirmadas: 0, huerfanasNuevas: 0, sinComprobar: 0 }

  for (const f of filas) {
    const tipo = f.tipo === 'cancelacion' ? 'cancelacion' as const : 'nueva' as const
    const activa = (tipo === 'nueva' && await yaSincronizada(f.ref_booking!).catch(() => false))
      ? true
      : await activaEnSmoobu(f.ref_booking!, f.check_in)
    const veredicto = veredictoAviso(tipo, activa)
    stats.comprobadas++
    await prisma.$executeRaw`UPDATE reservas_correo_booking SET ultima_comprobacion_at = now() WHERE id = ${f.id}`

    if (veredicto === 'sin_comprobar') { stats.sinComprobar++; stats.ok = false; continue }

    if (veredicto === 'ok') {
      await prisma.$executeRaw`
        UPDATE reservas_correo_booking SET estado = 'confirmada', confirmada_at = now() WHERE id = ${f.id}
      `
      stats.confirmadas++
      // Reserva nueva ya en Smoobu → sync de su ventana para que incomes/la intranet la cojan YA
      // (el cron diario tardaría hasta 24 h). Best-effort: si falla, el cron de las 05:00 la trae.
      if (tipo === 'nueva' && f.check_in) {
        const ci = new Date(f.check_in)
        await runSync(800, 10, addDias(ci, -1), addDias(ci, 2)).catch(() => {})
        await prisma.$executeRaw`UPDATE reservas_correo_booking SET sync_forzado_at = now() WHERE id = ${f.id}`
      }
      // Si Alberto ya había sido avisado del agujero, se le cuenta el cierre (una vez).
      if (f.avisada_at) {
        const canalOk = canalDeFila(f)
        await tgAviso('pisos.reserva-vigia', `✅ <b>Reserva${canalOk ? ` de ${escapeHtml(canalOk)}` : ''} ya en Smoobu</b>\n${lineaReserva(f)}\nSe resolvió sola o la arreglaste — el calendario ya la tiene.`).catch(() => {})
        await prisma.$executeRaw`UPDATE reservas_correo_booking SET resuelta_avisada_at = now() WHERE id = ${f.id}`
      }
      continue
    }

    // problema → huérfana; Telegram UNA vez (queda pintada ⚠️ en la intranet mientras dure).
    await prisma.$executeRaw`UPDATE reservas_correo_booking SET estado = 'huerfana' WHERE id = ${f.id}`
    if (!f.avisada_at) {
      stats.huerfanasNuevas++
      const canal = canalDeFila(f)
      const deCanal = canal ? ` de ${escapeHtml(canal)}` : ''
      const extranet = canal ? `la extranet de ${escapeHtml(canal)}` : 'la extranet del portal por el que entró'
      const msg = tipo === 'nueva'
        ? [
            `🚨 <b>Reserva${deCanal} que Smoobu NO tiene</b>`,
            lineaReserva(f),
            f.origen === 'mensaje_huesped'
              ? 'Un huésped ha escrito sobre esta reserva y Smoobu no la reconoce.'
              : `El portal avisó por correo y lo he comprobado contra Smoobu: no está.`,
            `Métela a mano en Smoobu (o desde ${extranet}) para que cuente en calendario, limpiezas e ingresos.`,
            f.property_id
              ? 'La he marcado ⚠️ en la intranet de Si que Brilla hasta que Smoobu la tenga.'
              : `⚠️ No he podido identificar el piso por el nombre del anuncio — revisa en ${canal ? escapeHtml(canal) : 'el portal'} cuál es.`,
          ].join('\n')
        : [
            `🚨 <b>Cancelación${deCanal} que Smoobu NO ha aplicado</b>`,
            lineaReserva(f),
            'La reserva sigue ACTIVA en Smoobu: esas noches están bloqueadas sin huésped. Cancélala en Smoobu.',
          ].join('\n')
      await tgAviso('pisos.reserva-vigia', msg).catch(() => {})
      await prisma.$executeRaw`UPDATE reservas_correo_booking SET avisada_at = now() WHERE id = ${f.id}`
    }
  }

  await registrarLatido('reservas_booking_vigia', stats.ok,
    `${stats.comprobadas} comprobadas · ${stats.confirmadas} ok · ${stats.huerfanasNuevas} huérfanas nuevas` +
    (stats.sinComprobar ? ` · ⚠️ ${stats.sinComprobar} sin poder comprobar (Smoobu no responde)` : ''),
  ).catch(() => {})

  return stats
}
