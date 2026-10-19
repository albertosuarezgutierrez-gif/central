// Responder EN EL HILO del correo de un cliente (19/10/2026, spec lead → propuesta F1, hueco H2). PURO.
//
// Para que el cliente vea nuestra respuesta debajo de su correo (y su contestación lleve el Message-ID de su lead en
// `References`, que es como el triaje la casa), el envío lleva `In-Reply-To` = el Message-ID de su correo y
// `References` = sus referencias + ese Message-ID, y el asunto «Re: …».
//
// 🚨 Cabeceras que vienen de un correo de FUERA: solo se aceptan Message-ID con forma `<algo@algo>` sin espacios ni
// saltos de línea. Un CR/LF colado sería una inyección de cabeceras (un `Bcc:` de regalo). Lo que no tiene forma se
// descarta; si el propio Message-ID no la tiene, no se responde en hilo (`null`): sale como correo nuevo.

export type EnRespuestaA = { messageId: string; references: readonly string[] }

const RE_MESSAGE_ID = /^<[^<>\s@]+@[^<>\s@]+>$/
/** Gmail y otros recortan References largos; con las últimas y la raíz el hilo se reconoce igual. */
const MAX_REFERENCIAS = 20

export function messageIdValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 300 && RE_MESSAGE_ID.test(v)
}

/** `In-Reply-To` y `References` listos para el proveedor, o `null` si el Message-ID no es válido. */
export function cabecerasHilo(en: EnRespuestaA | null | undefined): { inReplyTo: string; references: string[] } | null {
  if (!en || !messageIdValido(en.messageId)) return null
  const refs = [...new Set([...(Array.isArray(en.references) ? en.references : []).filter(messageIdValido), en.messageId])]
  // La raíz (primera) se conserva siempre: es la que casa con el lead.
  const recortadas = refs.length > MAX_REFERENCIAS ? [refs[0], ...refs.slice(refs.length - (MAX_REFERENCIAS - 1))] : refs
  return { inReplyTo: en.messageId, references: recortadas }
}

/** «Re: <asunto>» sin duplicar el «Re:» y sin saltos de línea. */
export function asuntoRespuesta(asunto: string): string {
  const a = String(asunto ?? '').replace(/[\r\n]+/g, ' ').trim()
  return (/^re:/i.test(a) ? a : `Re: ${a}`).slice(0, 200)
}

/** Una dirección de correo simple (para el BCC propio). Sin nombre visible ni comas: una sola. */
export function direccionSimple(v: unknown): string | null {
  return typeof v === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v.trim()) ? v.trim().toLowerCase() : null
}
