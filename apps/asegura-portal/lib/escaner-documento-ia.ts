// La llamada a la IA del escáner (13/10/2026). Patrón de `extraer-poliza.ts`: PDF → texto →
// `openrouterChat` (solo OpenRouter); imagen → `openrouterVision`. Sin key de IA devuelve `{ ia: false }` y la ruta
// deja archivar a mano; un fallo de la IA es «no se ha podido leer», nunca «no hay datos».
import { cleanJSON, openrouterChat, openrouterVision } from '@central/core-ai'

import { lecturaVacia, normalizarLecturaEscaner, type LecturaEscaner } from './escaner-documento'

const INSTRUCCION = `Eres un lector de documentos de seguros españoles. Devuelve SOLO un JSON con:
{"tipo": "recibo"|"renovacion"|"carta_impago"|"cambio_condiciones"|"otro",
 "fecha": "YYYY-MM-DD" (la fecha del documento o del recibo) o null,
 "importe": número en euros sin símbolo, o null,
 "compania": nombre de la aseguradora o null,
 "numeroPoliza": número de póliza o null}
carta_impago = reclamación de un recibo impagado o aviso de anulación por falta de pago.
Si un dato no aparece, usa null. NUNCA escribas "N/A" ni "no consta" ni inventes valores.`

export type ResultadoLecturaEscaner = { ia: false } | { ia: true; ok: boolean; lectura: LecturaEscaner }

export function hayClaveIa(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

function parsear(salida: string): LecturaEscaner {
  try {
    return normalizarLecturaEscaner(JSON.parse(cleanJSON(salida)))
  } catch {
    return lecturaVacia()
  }
}

export async function leerDocumentoEscaneado(buffer: Buffer, mime: string, nombre = ''): Promise<ResultadoLecturaEscaner> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? ''
  if (!apiKey) return { ia: false }
  const esPdf = mime === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf')
  try {
    if (esPdf) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const texto: string = (await require('pdf-parse')(buffer)).text || ''
      if (!texto.trim()) return { ia: true, ok: false, lectura: lecturaVacia() }
      // 🔒 Solo OpenRouter (el declarado en la privacidad): sin la cadena de suplentes de `aiComplete`.
      const salida = await openrouterChat({ apiKey }, [{ role: 'user', content: texto.slice(0, 20_000) }], { system: INSTRUCCION, maxTokens: 400 })
      return { ia: true, ok: true, lectura: parsear(salida) }
    }
    if (mime.startsWith('image/')) {
      const salida = await openrouterVision({ apiKey }, INSTRUCCION, [{ data: buffer.toString('base64'), mediaType: mime }], 'Clasifica y extrae los datos de este documento.')
      return { ia: true, ok: true, lectura: parsear(salida) }
    }
  } catch (e) {
    console.warn('[portal/escaner] la IA no pudo leer el documento:', e instanceof Error ? e.message : e)
  }
  return { ia: true, ok: false, lectura: lecturaVacia() }
}
