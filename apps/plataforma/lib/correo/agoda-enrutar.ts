// lib/correo/agoda-enrutar.ts — mensaje de huésped de Agoda (correo individual) → agente de huéspedes.
//
// Mismo agente, misma política de envío (auto / botón de Telegram) que Booking: lo ÚNICO distinto es el
// transporte de salida, que responde al correo de Agoda (`agoda-hilo.ts` + `enviar.ts`). Best-effort:
// nunca lanza; si no se puede identificar la reserva o el mensaje, devuelve el motivo y el triaje avisa a mano.
import { listarReservasVentana } from '@/lib/sivra/smoobu-sync'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { resolverBookingId } from './huespedes'
import { registrarHiloAgoda } from './agoda-hilo'
import { agenteSeEncarga, autenticadoPorAgoda, destinoDeRespuesta, elegirReservaAgoda } from './agoda-respuesta'
import type { AvisoMensajesAgoda } from './agoda-mensajes'
import type { CorreoNuevo } from './imap'

export type ResultadoEnrutadoAgoda =
  | { enrutado: true; bookingId: string; accion: string }
  | { enrutado: false; motivo: string }

export async function resolverReservaAgoda(a: AvisoMensajesAgoda): Promise<string | null> {
  if (a.reservaAgoda) {
    const id = await resolverBookingId(a.reservaAgoda).catch(() => null)
    if (id) return id
  }
  if (a.llegada && a.salida) {
    const lista = await listarReservasVentana(a.llegada, a.llegada, 800, 3).catch(() => [] as any[])
    return elegirReservaAgoda(lista, a)
  }
  return null
}

export async function enrutarMensajeAgoda(correo: CorreoNuevo, a: AvisoMensajesAgoda): Promise<ResultadoEnrutadoAgoda> {
  if (!a.respondePorCorreo) return { enrutado: false, motivo: 'resumen diario: no admite respuesta por correo' }
  if (!a.mensaje) return { enrutado: false, motivo: 'no se pudo leer el texto del mensaje' }
  // 🛡️ Sin DKIM/DMARC de Agoda no se enruta ni se registra hilo: un From falsificado con el Reply-To de
  // otro alias de Agoda podría secuestrar el hilo de otra reserva.
  if (!autenticadoPorAgoda(correo.autenticacion)) return { enrutado: false, motivo: 'sin DKIM de Agoda: el correo no viene autenticado por agoda.com / agoda-messaging.com' }
  const responderA = destinoDeRespuesta(correo.replyTo, correo.from)
  if (!responderA) return { enrutado: false, motivo: 'el correo no trae una dirección de Agoda a la que responder' }
  const bookingId = await resolverReservaAgoda(a)
  if (!bookingId) return { enrutado: false, motivo: 'no he podido identificar la reserva en Smoobu (ni por nº ni por huésped+fechas)' }
  try {
    // El hilo se registra ANTES de procesar: la propuesta de Telegram y el envío posterior lo necesitan.
    const reg = await registrarHiloAgoda(bookingId, {
      messageId: correo.messageId, referencias: correo.referencias ?? [], responderA, asunto: correo.subject,
      huesped: a.huesped, reservaAgoda: a.reservaAgoda,
    })
    if (!reg.ok) return { enrutado: false, motivo: reg.motivo }
    const r = await procesarMensajeHuesped(bookingId, { pregunta: a.mensaje, msgId: `agoda-correo:${correo.messageId}`, fecha: correo.fecha })
    // Solo cuenta como «cogido» si el agente respondió, propuso o ya lo tenía; si no, aviso de respaldo.
    if (!agenteSeEncarga(r.accion)) return { enrutado: false, motivo: `el agente no lo ha resuelto (${r.accion})` }
    return { enrutado: true, bookingId, accion: r.accion }
  } catch (e) {
    return { enrutado: false, motivo: `fallo al procesarlo: ${e instanceof Error ? e.message.slice(0, 100) : 'error'}` }
  }
}
