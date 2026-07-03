// lib/correo/huespedes.ts — Enruta un correo de huésped al agente de huéspedes de SIVRA.
//
// Los correos de guest.booking.com traen el nº de confirmación de la reserva (OTA), pero el agente
// (procesarMensajeHuesped) necesita el bookingId INTERNO de Smoobu. Resolvemos el uno al otro
// consultando Smoobu; si no se logra, el llamador cae al comportamiento base (etiqueta + aviso).
//
// El agente ya trae idempotencia propia (claimMensaje / esEcoPropio), así que no duplica respuesta
// aunque el mismo mensaje llegue también por la vía Smoobu (cron */3). Best-effort: nunca lanza.
import { smoobuFetch } from '@/lib/smoobu'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import type { CorreoNuevo } from './imap'

// Extrae el nº de confirmación de un correo de Booking ("Número de confirmación: 5406163700").
export function extraerNumConfirmacion(correo: CorreoNuevo): string | null {
  const texto = `${correo.subject}\n${correo.extracto}`
  const m = texto.match(/confirmaci[oó]n[:\s#]*([0-9]{6,})/i) || texto.match(/\b(\d{9,})\b/)
  return m ? m[1] : null
}

// Extrae el texto de la pregunta del huésped del cuerpo del correo (Booking lo pone tras un marcador).
function extraerPregunta(correo: CorreoNuevo): string {
  const t = correo.extracto
  const m = t.match(/mensaje (?:nuevo )?de un cliente[^:]*:\s*(.+)/i)
  return (m ? m[1] : t).replace(/responder.*$/i, '').trim().slice(0, 500)
}

// Resuelve el nº de confirmación OTA → bookingId interno de Smoobu (best-effort).
export async function resolverBookingId(numConfirmacion: string): Promise<string | null> {
  try {
    const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)
    const to = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    const res = await smoobuFetch(`/api/reservations?arrivalFrom=${from}&arrivalTo=${to}&pageSize=100`, { cache: 'no-store' })
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    const bookings: any[] = data?.bookings ?? []
    const hit = bookings.find(b =>
      [b['reference-id'], b.apiReference, b.referenceId, b.bookingReference]
        .some(v => v != null && String(v).includes(numConfirmacion)),
    )
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
