// lib/sivra/agente-huesped/idioma-salida.ts — red de seguridad de IDIOMA sobre el texto que sale
// al huésped.
//
// El fallo que cubre (medido 05/09/2026, reserva 154375571): todos los prompts del agente están
// escritos en español y la orden «responde en inglés» es UNA línea dentro de ese muro; el modelo
// deriva al idioma ambiental y devuelve el borrador en español. El aviso de Telegram lo etiquetaba
// «Borrador (en EN)» —porque `ctx.lang` SÍ era 'en'— y la línea 🔁 salía «no he podido traducirlo
// al español» (traducir español a español devuelve lo mismo y `traduccionUtil` lo descarta). O sea:
// el sistema tenía la señal delante y la pintaba como un fallo de traducción. Y si la categoría
// permitía auto-envío, al huésped le llegaba en el idioma equivocado sin que nadie lo viera.
//
// Alcance a propósito: solo se corrige la deriva AL ESPAÑOL, que es la que produce el idioma de los
// prompts. No se arbitra entre en/fr/de/it — `detectLang` no los distingue con fiabilidad y un falso
// positivo reescribiría una respuesta correcta.
import { pareceEspanol } from './reglas.ts'

const NOMBRE_IDIOMA: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano' }

type Complete = (messages: { role: 'user'; content: string }[], opts: { system: string; maxTokens: number }) => Promise<string>

const defaultComplete: Complete = (messages, opts) =>
  import('@central/core-ai').then(({ aiComplete }) => (aiComplete as unknown as Complete)(messages, opts))

// ¿El texto que íbamos a mandar salió en español cuando el huésped escribe en otro idioma?
export function derivaAEspanol(texto: string, lang: string): boolean {
  if (!(texto || '').trim()) return false
  if (!lang || lang === 'es') return false
  return pareceEspanol(texto)
}

export type ResultadoIdioma = {
  texto: string        // el texto a usar (traducido si se pudo; el original si no)
  corregido: boolean   // hubo deriva y se tradujo con éxito
  fallo: boolean       // hubo deriva y NO se pudo corregir → el texto sigue en el idioma equivocado
}

// Devuelve el texto en el idioma del huésped. Si no hay deriva, lo deja intacto y no gasta llamada.
// Si la traducción falla o vuelve igual de española, NO se maquilla: se declara con `fallo` para que
// el llamante escale a Alberto en vez de mandar al huésped un mensaje en un idioma que no es el suyo.
export async function asegurarIdioma(
  texto: string,
  lang: string,
  complete: Complete = defaultComplete,
): Promise<ResultadoIdioma> {
  if (!derivaAEspanol(texto, lang)) return { texto, corregido: false, fallo: false }
  const nombre = NOMBRE_IDIOMA[lang] || lang
  try {
    const out = (await complete(
      [{ role: 'user', content: texto }],
      {
        system:
          `Traduce el mensaje al ${nombre}. Es un mensaje de un anfitrión a su huésped: conserva el ` +
          `tono, el contenido y el formato exactos, sin añadir ni quitar nada. Devuelve SOLO la ` +
          `traducción, sin comillas ni explicaciones.`,
        maxTokens: 600,
      },
    )).trim()
    if (!out || pareceEspanol(out)) return { texto, corregido: false, fallo: true }
    return { texto: out, corregido: true, fallo: false }
  } catch {
    return { texto, corregido: false, fallo: true }
  }
}
