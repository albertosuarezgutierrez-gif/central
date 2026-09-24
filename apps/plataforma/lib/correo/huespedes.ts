// lib/correo/huespedes.ts — Enruta un correo de huésped al agente de huéspedes de SIVRA.
//
// Los correos de guest.booking.com traen el nº de confirmación de la reserva (OTA), pero el agente
// (procesarMensajeHuesped) necesita el bookingId INTERNO de Smoobu. Resolvemos el uno al otro
// consultando Smoobu; si no se logra, el llamador cae al comportamiento base (etiqueta + aviso).
//
// El agente ya trae idempotencia propia (claimMensaje / esEcoPropio), así que no duplica respuesta
// aunque el mismo mensaje llegue también por la vía Smoobu (cron */3). Best-effort: nunca lanza.
import { smoobuFetch } from '@/lib/smoobu'
import { listarReservasVentana } from '@/lib/sivra/smoobu-sync'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { extraerNumConfirmacionDe } from './num-confirmacion'
import type { CorreoNuevo } from './imap'

// Días hacia atrás/adelante de la ventana ANCHA. Booking deja reservar con ~16 meses de
// antelación; 540 días cubren eso con margen. Hacia atrás basta con cubrir al huésped que
// escribe después de irse.
const VENTANA_ANCHA_ATRAS = 90
const VENTANA_ANCHA_ADELANTE = 540

// Extrae el nº de confirmación de un correo de Booking ("Número de confirmación: 5406163700").
// La lógica vive en `num-confirmacion.ts` (puro, con tests): NO mira dentro de los enlaces, que
// es de donde salió el 🚨 falso del 04/09/2026.
export function extraerNumConfirmacion(correo: CorreoNuevo): string | null {
  return extraerNumConfirmacionDe(correo.subject, correo.extracto)
}

// Extrae el texto de la pregunta del huésped del cuerpo del correo (Booking lo pone tras un marcador).
function extraerPregunta(correo: CorreoNuevo): string {
  const t = correo.extracto
  const m = t.match(/mensaje (?:nuevo )?de un cliente[^:]*:\s*(.+)/i)
  return (m ? m[1] : t).replace(/responder.*$/i, '').trim().slice(0, 500)
}

function casaRef(b: any, ref: string): boolean {
  return String(b?.id) === ref ||
    [b?.['reference-id'], b?.apiReference, b?.referenceId, b?.bookingReference]
      .some(v => v != null && String(v).includes(ref))
}

/**
 * Resuelve el nº de confirmación OTA → bookingId interno de Smoobu (best-effort).
 *
 * 🚨 La ventana NO puede ser corta (04/09/2026). Este resolutor es además la puerta del leg B del
 * vigía: si no encuentra la reserva, el correo se registra como «Smoobu quizá no la tiene». Con la
 * ventana de −7..+30 días, un huésped que escribe por una reserva LEJANA salía por esa puerta y
 * acababa en un 🚨 falso — pasó con la 6144978627 de Booking (luis ortiz benito), que estaba en
 * Smoobu y en `incomes` desde el primer día pero con llegada el 23/04/2027, ocho meses fuera de la
 * ventana. Se mira primero la ventana estrecha (una página, barato y cubre el caso normal) y solo
 * si falla se barre la ancha, paginada.
 */
export async function resolverBookingId(numConfirmacion: string): Promise<string | null> {
  try {
    const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const to = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    const res = await smoobuFetch(`/api/reservations?arrivalFrom=${from}&arrivalTo=${to}&pageSize=100`, { cache: 'no-store' })
    if (res.ok) {
      const data: any = await res.json().catch(() => null)
      const hit = (data?.bookings ?? []).find((b: any) => casaRef(b, numConfirmacion))
      if (hit) return String(hit.id)
    }
  } catch { /* se intenta la ventana ancha */ }

  try {
    const hoy = Date.now()
    const desde = new Date(hoy - VENTANA_ANCHA_ATRAS * 86400_000).toISOString().slice(0, 10)
    const hasta = new Date(hoy + VENTANA_ANCHA_ADELANTE * 86400_000).toISOString().slice(0, 10)
    const bookings = await listarReservasVentana(desde, hasta, 800, 10)
    const hit = bookings.find((b: any) => casaRef(b, numConfirmacion))
    return hit ? String(hit.id) : null
  } catch {
    return null
  }
}

// Intenta enrutar el correo al agente de huéspedes. Devuelve true si lo procesó el agente.
export async function enrutarHuesped(correo: CorreoNuevo): Promise<{ enrutado: boolean; accion?: string }> {
  const num = extraerNumConfirmacion(correo)
  if (!num) return { enrutado: false }
  const bookingId = await resolverBookingId(num)
  if (!bookingId) return { enrutado: false }
  try {
    const r = await procesarMensajeHuesped(bookingId, { pregunta: extraerPregunta(correo), msgId: `correo:${correo.messageId}` })
    return { enrutado: true, accion: r.accion }
  } catch {
    return { enrutado: false }
  }
}
