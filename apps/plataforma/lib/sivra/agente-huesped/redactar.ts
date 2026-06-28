// lib/sivra/agente-huesped/redactar.ts — genera un borrador desde la idea en bruto del anfitrión.

const NOMBRE_IDIOMA: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' }

type Complete = (messages: { role: 'user'; content: string }[], opts: { system: string; maxTokens: number }) => Promise<string>

const defaultComplete: Complete = (messages, opts) =>
  import('@central/core-ai').then(({ aiComplete }) => (aiComplete as unknown as Complete)(messages, opts))

export type ContextoRedaccion = {
  pregunta: string     // último mensaje del huésped
  historial: string    // últimas N conversaciones formateadas como texto
  idioma: string       // idioma del huésped (es/en/fr/de/it)
  propiedad: string    // nombre del apartamento
  guestName: string    // nombre del huésped
  checkIn: string      // YYYY-MM-DD
  checkOut: string     // YYYY-MM-DD
}

// Genera un mensaje profesional a partir de la idea en bruto que escribe el anfitrión.
// Devuelve el borrador en el idioma del huésped, o '' si falta entrada o la IA falla.
export async function redactarDesdeIdea(
  idea: string,
  ctx: ContextoRedaccion,
  complete: Complete = defaultComplete,
): Promise<string> {
  const ideaTrim = (idea || '').trim()
  if (!ideaTrim) return ''
  const nombre = NOMBRE_IDIOMA[ctx.idioma] || ctx.idioma || 'español'
  const historialBloque = ctx.historial
    ? `Conversación reciente con ${ctx.guestName} (${ctx.checkIn}–${ctx.checkOut}):\n${ctx.historial}\n\n`
    : ''
  const content =
    `${historialBloque}Su último mensaje: "${ctx.pregunta}"\n` +
    `Quieres responderle transmitiendo esta idea: "${ideaTrim}"\n\n` +
    `Escribe el mensaje en ${nombre}. Cálido, directo, máximo 4 frases.\nSolo el texto del mensaje.`
  try {
    const out = (await complete(
      [{ role: 'user', content }],
      { system: `Eres el anfitrión de ${ctx.propiedad} (Sevilla).`, maxTokens: 600 },
    )).trim()
    return out
  } catch { return '' }
}
