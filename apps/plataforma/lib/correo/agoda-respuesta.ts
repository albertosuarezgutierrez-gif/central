// lib/correo/agoda-respuesta.ts — PURO: cómo se responde a un correo de huésped de Agoda.
//
// Responder al correo de `…@agoda-messaging.com` le llega al huésped (03/11/2026). Aquí solo se arman
// las cabeceras de la respuesta (misma conversación: In-Reply-To/References, «Re: …», To = Reply-To
// del aviso o, si no trae, su remitente). El envío real y la BD viven en `agoda-hilo.ts`.

export interface HiloAgoda {
  messageId: string
  referencias: string[]
  responderA: string
  asunto: string
}

export interface OpcionesRespuestaAgoda {
  from: string
  to: string
  subject: string
  text: string
  inReplyTo: string
  references: string[]
}

const RE_DIRECCION = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/
const RE_MSGID = /^<[^<>\s]+>$/

/** Solo se responde a una dirección de Agoda (agoda.com / agoda-messaging.com): nunca a un destino inventado. */
export function destinoAgodaValido(dir: string): boolean {
  const d = (dir || '').trim().toLowerCase()
  return RE_DIRECCION.test(d) && /@(?:[\w-]+\.)*agoda(?:-messaging)?\.com$/.test(d)
}

export function asuntoRespuesta(asunto: string): string {
  const a = (asunto || '').trim()
  return /^re:/i.test(a) ? a : `Re: ${a}`
}

/** Opciones de nodemailer para responder al hilo, o `null` si el hilo no sirve (sin Message-ID / destino no Agoda). */
export function opcionesRespuestaAgoda(hilo: HiloAgoda, cuerpo: string, from: string): OpcionesRespuestaAgoda | null {
  const to = (hilo.responderA || '').trim().toLowerCase()
  if (!destinoAgodaValido(to)) return null
  if (!RE_MSGID.test(hilo.messageId || '')) return null
  if (!(cuerpo || '').trim() || !from) return null
  const refs = [...hilo.referencias.filter((m) => RE_MSGID.test(m)), hilo.messageId]
  return {
    from, to,
    subject: asuntoRespuesta(hilo.asunto),
    text: cuerpo,
    inReplyTo: hilo.messageId,
    references: [...new Set(refs)].slice(-20),
  }
}

/** Destino de la respuesta: Reply-To del aviso si es de Agoda; si no, su remitente; si tampoco, null. */
export function destinoDeRespuesta(replyTo: string | undefined, from: string): string | null {
  for (const d of [replyTo, from]) if (d && destinoAgodaValido(d)) return d.trim().toLowerCase()
  return null
}

const norm = (t: string) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Entre las reservas de Smoobu, la que corresponde al aviso por NOMBRE + FECHAS (cuando el nº de
 * reserva de Agoda no casa): misma llegada y salida y todas las palabras del huésped en el nombre de la
 * reserva. Exactamente una → su id; cero o varias → null (nunca se adivina a quién se contesta).
 */
export function elegirReservaAgoda(
  reservas: readonly { id?: unknown; arrival?: string; departure?: string; 'guest-name'?: string; channel?: { name?: string } | null }[],
  a: { huesped: string | null; llegada: string | null; salida: string | null },
): string | null {
  if (!a.huesped || !a.llegada || !a.salida) return null
  const palabras = norm(a.huesped).split(' ').filter(Boolean)
  if (!palabras.length) return null
  const hits = reservas.filter((b) => {
    if (b.arrival !== a.llegada || b.departure !== a.salida) return false
    const canal = norm(b.channel?.name || '')
    if (canal && !canal.includes('agoda')) return false
    const nombre = norm(b['guest-name'] || '')
    return palabras.every((p) => nombre.includes(p))
  })
  return hits.length === 1 && hits[0].id != null ? String(hits[0].id) : null
}
