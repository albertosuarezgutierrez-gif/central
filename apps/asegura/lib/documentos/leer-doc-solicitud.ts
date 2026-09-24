// Lee un documento que el CLIENTE sube por el enlace de datos del presupuesto
// (24/09/2026): DNI, carné, permiso de circulación, ficha técnica o la póliza
// que tiene ahora. PDF con texto → IA de texto; foto (o PDF escaneado no) →
// visión, igual que `extraer-poliza.ts`.
//
// Devuelve el JSON BRUTO del modelo. Qué es un dato válido lo decide
// `normalizarLecturaSolicitud()` de `@central/module-seguros` (las mismas
// reglas que el formulario), nunca el proveedor que respondió.
import { openrouterVision, cleanJSON } from '@central/core-ai'
import { iaTexto } from '../ia.ts'

const INSTRUCCION = `Eres un lector de documentos españoles para una correduría de seguros:
Identifica QUÉ documento es y extrae SOLO lo que aparece escrito en él. No inventes: si un dato no está, déjalo en null.
Responde ÚNICAMENTE con un JSON así:
{
  "tipo": "dni" | "carnet" | "permiso_circulacion" | "ficha_tecnica" | "poliza" | "otro",
  "dni": "DNI o NIE del titular, o null",
  "fechaNacimiento": "AAAA-MM-DD o null",
  "carnets": [ { "clase": "AM|A1|A2|A|B|...", "fecha": "AAAA-MM-DD (fecha de expedición de ESA clase)" } ],
  "matricula": "matrícula del vehículo o null",
  "marca": "marca del vehículo o null",
  "modelo": "modelo/versión o denominación comercial o null",
  "fechaMatriculacion": "AAAA-MM-DD de primera matriculación o null",
  "companiaActual": "aseguradora (si es una póliza o recibo) o null",
  "vencimientoActual": "AAAA-MM-DD de vencimiento de esa póliza o null"
}
Notas: en el carné español, el reverso lista cada clase (AM, A1, A2, A, B…) con su fecha en la columna 10. En el permiso de circulación la primera matriculación es el campo B y la marca/modelo los D.1/D.3.`

const PETICION = 'Extrae los datos de este documento.'
const TIEMPO_MS = 40_000

export type LecturaBruta = { ok: true; bruto: unknown; fuente: 'texto' | 'vision' } | { ok: false; motivo: string }

function conTiempo<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('la lectura tardó demasiado')), ms))])
}

function aJson(salida: string): unknown {
  try {
    return JSON.parse(cleanJSON(salida))
  } catch {
    return null
  }
}

export async function leerDocSolicitud(buffer: Buffer, mime: string, nombre = ''): Promise<LecturaBruta> {
  const esPdf = mime === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf')
  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch {
      /* un PDF que no se abre: se dice abajo */
    }
    if (!texto.trim()) return { ok: false, motivo: 'El PDF es un escaneo: guardado, pero para leerlo súbelo como foto.' }
    try {
      const salida = await iaTexto(texto.slice(0, 12_000), { system: INSTRUCCION, maxTokens: 600, timeoutMs: TIEMPO_MS, privado: true })
      const bruto = aJson(salida)
      return bruto ? { ok: true, bruto, fuente: 'texto' } : { ok: false, motivo: 'No se ha entendido el documento.' }
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
    }
  }
  if (mime.startsWith('image/')) {
    const apiKey = process.env.OPENROUTER_API_KEY ?? ''
    if (!apiKey) return { ok: false, motivo: 'La lectura de fotos no está configurada.' }
    try {
      // Un DNI o un carné: solo proveedores que NO guardan ni entrenan con los datos (data_collection=deny),
      // y un modelo de visión explícito (Gemini se sirve por Vertex, que cumple esa política).
      const salida = await conTiempo(
        openrouterVision({ apiKey }, INSTRUCCION, [{ data: buffer.toString('base64'), mediaType: mime }], PETICION, {
          model: process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-flash',
          privacidad: true,
          signal: AbortSignal.timeout(TIEMPO_MS),
        }),
        TIEMPO_MS + 1_000,
      )
      const bruto = aJson(salida)
      return bruto ? { ok: true, bruto, fuente: 'vision' } : { ok: false, motivo: 'No se ha entendido la foto.' }
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
    }
  }
  return { ok: false, motivo: 'Tipo de fichero no admitido.' }
}
