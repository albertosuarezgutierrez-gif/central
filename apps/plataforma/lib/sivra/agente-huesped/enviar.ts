// lib/sivra/agente-huesped/enviar.ts — responder en el hilo de Smoobu.
import { getSmoobuKey } from '@/lib/smoobu'

// Responde en el hilo del huésped (llega a Airbnb/Booking/email). Devuelve true si 2xx.
export async function enviarAlHuesped(reservationId: string, messageBody: string, subject = 'Re: tu estancia'): Promise<boolean> {
  try {
    const key = await getSmoobuKey()
    const r = await fetch(`https://login.smoobu.com/api/reservations/${reservationId}/messages/send-message-to-guest`, {
      method: 'POST',
      headers: { 'Api-Key': key, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ subject, messageBody }),
    })
    return r.ok
  } catch { return false }
}
