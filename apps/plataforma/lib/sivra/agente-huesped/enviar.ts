// lib/sivra/agente-huesped/enviar.ts — responder en el hilo de Smoobu.
import { smoobuFetch } from '@/lib/smoobu'
import { motivoFalloEnvio, type MotivoFallo } from './motivo-envio'

export type ResultadoEnvio = { ok: true } | { ok: false; status: number; motivo: MotivoFallo }

// Responde en el hilo del huésped (llega a Airbnb/Booking/email). Devuelve el motivo CLASIFICADO
// cuando falla, para que quien avisa a Alberto pueda decirle si reintentar sirve de algo (Smoobu
// caído) o no (credencial, reserva desconocida) en vez del genérico «reintenta en un momento».
// Sin asunto por defecto (decisión de Alberto): no repetir "Re: tu estancia" en cada mensaje;
// solo se incluye `subject` si se pasa explícitamente (algunos canales de email lo aprovechan).
export async function enviarAlHuespedDetallado(
  reservationId: string,
  messageBody: string,
  subject = '',
): Promise<ResultadoEnvio> {
  try {
    const payload: Record<string, string> = { messageBody }
    if (subject) payload.subject = subject
    const r = await smoobuFetch(`/api/reservations/${reservationId}/messages/send-message-to-guest`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (r.ok) return { ok: true }
    // Si Smoobu rechaza, dejamos rastro del motivo (status + cuerpo) para poder diagnosticar.
    const detalle = await r.text().catch(() => '')
    const motivo = motivoFalloEnvio(r.status, detalle)
    console.error(`[enviarAlHuesped] reserva ${reservationId} → Smoobu ${r.status} (${motivo.clase}): ${detalle.slice(0, 300)}`)
    return { ok: false, status: r.status, motivo }
  } catch (e: any) {
    console.error(`[enviarAlHuesped] reserva ${reservationId} → excepción: ${e?.message}`)
    return { ok: false, status: 0, motivo: motivoFalloEnvio(0, String(e?.message || '')) }
  }
}

/** Envoltura booleana para los llamadores automáticos (crons, guardias) que solo reintentan. */
export async function enviarAlHuesped(reservationId: string, messageBody: string, subject = ''): Promise<boolean> {
  return (await enviarAlHuespedDetallado(reservationId, messageBody, subject)).ok
}
