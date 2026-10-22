// PATRIMONIO (22/10/2026, paso 7) — lee una factura que sube la persona: PDF → texto → IA, o foto → visión.
// Patrón de `lib/extraer-poliza.ts` (portal) y de `apps/plataforma/lib/agente-facturas/extraer.ts`. La normalización
// (qué es dato y qué es un «no lo sé» disfrazado) vive en `factura-propuesta.ts`, que es pura y tiene test.
//
// 🔒 Solo OpenRouter (el proveedor que declara la privacidad del portal), sin la cadena de suplentes. Sin clave, fallo
// de IA o PDF sin texto = `fuente: 'none'`: «no se ha podido leer», que NO es «la factura no trae datos».
import { openrouterChat, openrouterVision, cleanJSON } from '@central/core-ai'
import { CATEGORIAS_GASTO } from '@central/module-patrimonio'
import { modelosLecturaPoliza } from '@central/module-seguros'

import { normalizarFacturaLeida, PROPUESTA_VACIA, type FuenteFactura, type PropuestaFactura } from './factura-propuesta'

export type ResultadoFactura = { propuesta: PropuestaFactura; motivos: string[]; fuente: FuenteFactura }

const INSTRUCCION = `Eres un extractor de facturas españolas. Devuelve SOLO un JSON con estas claves:
{"proveedor": string|null, "nif_proveedor": string|null, "fecha": "YYYY-MM-DD"|null, "base_imponible": number|null, "iva": number|null, "retencion": number|null, "total": number|null, "concepto": string|null, "categoria": ${CATEGORIAS_GASTO.filter((c) => c !== 'OTRO').map((c) => `"${c}"`).join('|')}|null}
Importes en euros, con punto decimal, sin símbolo. "iva" es el IMPORTE del IVA, no el porcentaje. "retencion" es el IMPORTE retenido de IRPF (alquileres, profesionales), no el porcentaje; null si no hay. "total" es lo que se paga: base + IVA − retención. "fecha" es la de emisión.
Si un dato no aparece en el documento, pon null. NUNCA inventes ni pongas 0, "N/A" ni "OTRO" cuando no lo sepas.`

const MODELO = () => ({ models: modelosLecturaPoliza(process.env), privacidad: true })

const nada = (motivo: string): ResultadoFactura => ({ propuesta: PROPUESTA_VACIA, motivos: [motivo], fuente: 'none' })

function interpretar(salida: string, fuente: 'texto' | 'vision'): ResultadoFactura {
  let bruto: unknown = null
  try {
    bruto = JSON.parse(cleanJSON(salida))
  } catch {
    return nada('La lectura automática no devolvió datos utilizables.')
  }
  const { propuesta, motivos } = normalizarFacturaLeida(bruto)
  return { propuesta, motivos, fuente }
}

export async function extraerFactura(buffer: Buffer, mimeType: string, _fileName = ''): Promise<ResultadoFactura> {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim()
  // El tipo llega YA comprobado por los bytes (`tipo-fichero.ts`); el nombre del fichero no decide nada.
  const esPdf = mimeType === 'application/pdf'

  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch (e) {
      console.warn('[portal] factura: pdf-parse falló:', e)
      return nada('No hemos podido abrir el PDF. Rellena los datos a mano.')
    }
    if (!texto.trim()) return nada('El PDF no tiene texto (parece escaneado). Sube una foto nítida o rellena los datos a mano.')
    if (!apiKey) return nada('La lectura automática no está disponible ahora. Rellena los datos a mano.')
    try {
      const salida = await openrouterChat({ apiKey }, [{ role: 'user', content: texto.slice(0, 20_000) }], { system: INSTRUCCION, maxTokens: 700, ...MODELO() })
      return interpretar(salida, 'texto')
    } catch (e) {
      console.warn('[portal] factura: openrouterChat falló:', e)
      return nada('La lectura automática ha fallado. Rellena los datos a mano.')
    }
  }

  if (mimeType.startsWith('image/')) {
    if (!apiKey) return nada('La lectura automática no está disponible ahora. Rellena los datos a mano.')
    try {
      const salida = await openrouterVision({ apiKey }, INSTRUCCION, [{ data: buffer.toString('base64'), mediaType: mimeType }], 'Extrae los datos de esta factura.', MODELO())
      return interpretar(salida, 'vision')
    } catch (e) {
      console.warn('[portal] factura: openrouterVision falló:', e)
      return nada('La lectura automática ha fallado. Rellena los datos a mano.')
    }
  }

  return nada('Formato no admitido. Sube un PDF o una foto (JPG, PNG, WebP).')
}
