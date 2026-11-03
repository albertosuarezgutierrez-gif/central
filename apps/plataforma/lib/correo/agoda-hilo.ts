// lib/correo/agoda-hilo.ts — hilo de correo de Agoda por reserva: registro, búsqueda y ENVÍO.
//
// Es el transporte de salida de los mensajes de huésped de Agoda (03/11/2026): el agente de huéspedes
// decide y redacta como siempre; si la reserva tiene un hilo de correo VIVO aquí, la respuesta sale
// respondiendo a ese correo (Gmail SMTP, mismo buzón que lo recibió) en vez de por Smoobu.
// Best-effort en lectura: un fallo de BD = «no hay hilo» → se cae a Smoobu como siempre.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { gmailTransporter } from '@central/core-email'
import { decidirRegistroHilo, opcionesRespuestaAgoda, type HiloAgoda } from './agoda-respuesta'

/** Un correo de Agoda más viejo que esto ya no es «el hilo vivo» de la conversación. */
export const VIGENCIA_HILO_DIAS = 30

export type ResultadoRegistroHilo = { ok: true } | { ok: false; motivo: string }

/**
 * Registra (o refresca) el hilo de correo de la reserva. Si ya hay uno con OTRO destino (`responder_a`),
 * NO lo pisa: un correo no puede desviar en silencio las respuestas de esa reserva a otro alias. Devuelve
 * el motivo para que el triaje avise por Telegram. El guard va también en el SQL (`WHERE` del upsert):
 * dos pasadas a la vez no se cuelan entre la lectura y la escritura.
 */
export async function registrarHiloAgoda(bookingId: string, h: HiloAgoda & { huesped?: string | null; reservaAgoda?: string | null }): Promise<ResultadoRegistroHilo> {
  const previo = await prisma.$queryRaw<{ responder_a: string }[]>(Prisma.sql`
    SELECT responder_a FROM agoda_hilos_correo WHERE booking_id = ${bookingId} LIMIT 1
  `)
  const conflicto = () => ({
    ok: false as const,
    motivo: `la reserva ya tiene hilo de Agoda con OTRO destino (${previo[0]?.responder_a ?? '¿?'}); este correo pide ${h.responderA}. No he cambiado el destino: revisa que el correo sea legítimo`,
  })
  if (decidirRegistroHilo(previo[0]?.responder_a, h.responderA) === 'conflicto') return conflicto()
  const n = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO agoda_hilos_correo (booking_id, message_id, referencias, responder_a, asunto, huesped, reserva_agoda, recibido_at)
    VALUES (${bookingId}, ${h.messageId}, ${h.referencias}::text[], ${h.responderA}, ${h.asunto}, ${h.huesped ?? null}, ${h.reservaAgoda ?? null}, now())
    ON CONFLICT (booking_id) DO UPDATE SET
      message_id = EXCLUDED.message_id, referencias = EXCLUDED.referencias,
      asunto = EXCLUDED.asunto, huesped = EXCLUDED.huesped, reserva_agoda = EXCLUDED.reserva_agoda, recibido_at = now()
    WHERE lower(agoda_hilos_correo.responder_a) = lower(EXCLUDED.responder_a)
  `)
  return n > 0 ? { ok: true } : conflicto()
}

/** Hilo VIVO de la reserva (o null). El destino se muestra en la propuesta de Telegram. */
export async function hiloAgodaDe(bookingId: string): Promise<HiloAgoda | null> {
  try {
    const f = await prisma.$queryRaw<{ message_id: string; referencias: string[]; responder_a: string; asunto: string }[]>(Prisma.sql`
      SELECT message_id, referencias, responder_a, asunto FROM agoda_hilos_correo
      WHERE booking_id = ${bookingId} AND recibido_at > now() - make_interval(days => ${VIGENCIA_HILO_DIAS}::int)
      LIMIT 1
    `)
    const r = f[0]
    return r ? { messageId: r.message_id, referencias: r.referencias ?? [], responderA: r.responder_a, asunto: r.asunto } : null
  } catch {
    return null
  }
}

export type ResultadoCorreoAgoda = { ok: true } | { ok: false; motivo: string; reintentable: boolean }

/** Responde al correo de Agoda. Nunca lanza: devuelve el motivo si no se pudo enviar. */
export async function responderCorreoAgoda(hilo: HiloAgoda, cuerpo: string): Promise<ResultadoCorreoAgoda> {
  const from = process.env.GMAIL_USER || ''
  const op = opcionesRespuestaAgoda(hilo, cuerpo, from)
  if (!op) return { ok: false, motivo: 'hilo de Agoda no válido (sin Message-ID o destino que no es de Agoda)', reintentable: false }
  const tr = gmailTransporter()
  if (!tr) return { ok: false, motivo: 'sin credenciales de Gmail (GMAIL_USER/GMAIL_APP_PASSWORD) para responder al correo', reintentable: false }
  try {
    await tr.sendMail({ from: op.from, to: op.to, subject: op.subject, text: op.text, inReplyTo: op.inReplyTo, references: op.references })
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: `Gmail rechazó el envío: ${e instanceof Error ? e.message.slice(0, 160) : 'error'}`, reintentable: true }
  }
}
