// lib/sivra/agente-huesped/enviar.ts — responder en el hilo de Smoobu.
import { getSmoobuKey } from '@/lib/smoobu'

// Responde en el hilo del huésped (llega a Airbnb/Booking/email). Devuelve true si 2xx.
// Sin asunto por defecto (decisión de Alberto): no repetir "Re: tu estancia" en cada mensaje;
// solo se incluye `subject` si se pasa explícitamente (algunos canales de email lo aprovechan).
export async function enviarAlHuesped(reservationId: string, messageBody: string, subject = ''): Promise<boolean> {
  try {
    const key = await getSmoobuKey()
    const payload: Record<string, string> = { messageBody }
    if (subject) payload.subject = subject
    const r = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}/messages/send-message-to-guest`, {
      method: 'POST',
      headers: { 'Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(payload),
    })
    // Si Smoobu rechaza, dejamos rastro del motivo (status + cuerpo) para poder diagnosticar.
    if (!r.ok) {
      const detalle = await r.text().catch(() => '')
      console.error(`[enviarAlHuesped] reserva ${reservationId} → Smoobu ${r.status}: ${detalle.slice(0, 300)}`)
    }
    return r.ok
  } catch (e: any) {
    console.error(`[enviarAlHuesped] reserva ${reservationId} → excepción: ${e?.message}`)
    return false
  }
}
