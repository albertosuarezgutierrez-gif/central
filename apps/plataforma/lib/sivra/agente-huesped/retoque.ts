// lib/sivra/agente-huesped/retoque.ts — aplica una instrucción de Alberto sobre el borrador existente.

import { asegurarIdioma } from './idioma-salida.ts'

const NOMBRE_IDIOMA: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' }

// Tipo de la función de completado (inyectable para test; por defecto aiComplete de @central/core-ai).
type Complete = (messages: { role: 'user'; content: string }[], opts: { system: string; maxTokens: number }) => Promise<string>

// aiComplete se carga de forma perezosa para que el módulo sea testeable con `node --test`
// (el alias de workspace @central/core-ai no resuelve fuera del bundler de Next).
const defaultComplete: Complete = (messages, opts) =>
  import('@central/core-ai').then(({ aiComplete }) => (aiComplete as unknown as Complete)(messages, opts))

// Aplica una instrucción corta del anfitrión al borrador (que YA está en el idioma del huésped).
// Devuelve el mensaje revisado en ESE idioma, o '' si falta entrada o la IA falla/da vacío.
export async function aplicarRetoque(
  borrador: string,
  instruccion: string,
  idioma: string,
  complete: Complete = defaultComplete,
): Promise<string> {
  const txt = (borrador || '').trim()
  const ins = (instruccion || '').trim()
  if (!txt || !ins) return ''
  const nombre = NOMBRE_IDIOMA[idioma] || idioma || 'español'
  try {
    const out = (await complete(
      [{ role: 'user', content: `BORRADOR:\n${txt}\n\nCAMBIO A APLICAR:\n${ins}` }],
      { system: `Eres el anfitrión de un alojamiento. Tienes un BORRADOR de respuesta a un huésped escrito en ${nombre}. Aplica el CAMBIO indicado conservando el resto del mensaje intacto. Devuelve SOLO el mensaje revisado, en ${nombre}, sin comillas ni notas.`, maxTokens: 600 },
    )).trim()
    // Mismo riesgo que en `redactar.ts`: la instrucción va en español y el retoque puede volver en
    // español aunque el borrador estuviera en el idioma del huésped.
    return (await asegurarIdioma(out, idioma, complete)).texto
  } catch { return '' }
}
