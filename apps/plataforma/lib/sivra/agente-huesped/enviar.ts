// lib/sivra/agente-huesped/enviar.ts — responder en el hilo de Smoobu.
import { smoobuFetch } from '@/lib/smoobu'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
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
    if (r.ok) {
      await registrarEnviado(reservationId, messageBody, subject)
      return { ok: true }
    }
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

// Todo lo que sale hacia el huésped pasa por aquí, así que aquí se anota (28/09/2026). Smoobu
// devuelve nuestros mensajes en el hilo SIN marca de emisor, y sin este registro el agente tomaba por
// preguntas del huésped los acuses, los mensajes programados o el texto que Alberto envía tras
// ✏️ Modificar (reserva 154692216: cinco ecos en cuatro días). Se guarda también «asunto + cuerpo»,
// que es como `construirContexto` compone el mensaje en el historial. Best-effort: si la escritura
// falla, el envío ya salió y no se deshace.
async function registrarEnviado(bookingId: string, cuerpo: string, asunto: string): Promise<void> {
  const textos = [cuerpo, asunto ? `${asunto}\n${cuerpo}` : ''].filter(t => t.trim())
  for (const texto of textos) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO mensajes_enviados (booking_id, texto) VALUES (${bookingId}, ${texto})
    `).catch(e => console.error(`[enviarAlHuesped] no se pudo registrar el envío (${bookingId}): ${e?.message}`))
  }
}

/** Envoltura booleana para los llamadores automáticos (crons, guardias) que solo reintentan. */
export async function enviarAlHuesped(reservationId: string, messageBody: string, subject = ''): Promise<boolean> {
  return (await enviarAlHuespedDetallado(reservationId, messageBody, subject)).ok
}
