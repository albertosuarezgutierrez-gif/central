// Lee una póliza que aporta el usuario: PDF → texto → IA, o foto → visión.
// Replica el pipeline ya probado de apps/sivra/lib/agente-facturas/extraer.ts.
//
// ⚠️ Lo que sale de aquí es SIEMPRE un dato leído por una máquina, nunca un dato
// de contrato: quien lo guarde lo marca `declarado` (ver `procedencia.ts` de
// @central/module-seguros-portal). Y la normalización —qué es dato y qué es un
// «no lo sé» disfrazado— vive en ese módulo puro, no aquí: es la regla que
// decide si un campo existe, y no puede depender de qué proveedor respondió.
import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'
import { normalizarPolizaLeida, polizaLeidaVacia, type PolizaLeida } from '@central/module-seguros-portal'

export type PolizaExtraida = PolizaLeida

export type ResultadoExtraccion = {
  datos: PolizaExtraida
  /** `none` = no se pudo leer NADA. No es lo mismo que «la póliza no tiene esos datos». */
  fuente: 'texto' | 'vision' | 'none'
}

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"compania":string|null,"numeroPoliza":string|null,"ramo":string|null,"primaAnual":number|null,"fechaVencimiento":"YYYY-MM-DD"|null}
Reglas:
- "ramo" debe ser uno de: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, otros.
- "primaAnual" en euros, solo el número, con punto decimal.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes ni lo deduzcas.`

/** Nada leído: los cinco campos a `null` y `fuente: 'none'`. */
function nadaLeido(): ResultadoExtraccion {
  return { datos: polizaLeidaVacia(), fuente: 'none' }
}

export async function extraerPoliza(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
): Promise<ResultadoExtraccion> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch (e) {
      console.warn('[portal] pdf-parse falló:', e)
    }
    if (!texto.trim()) return nadaLeido()
    // Un fallo de IA es «no lo hemos podido mirar», no «no hay datos»: se degrada
    // a `none` y la póliza se guarda igual, para completarla a mano.
    let salida: string
    try {
      salida = await aiComplete(texto.slice(0, 20_000), { system: INSTRUCCION, maxTokens: 600 })
    } catch (e) {
      console.warn('[portal] aiComplete falló:', e)
      return nadaLeido()
    }
    return { datos: parsear(salida), fuente: 'texto' }
  }

  if (mimeType.startsWith('image/')) {
    const apiKey = process.env.OPENROUTER_API_KEY ?? ''
    if (!apiKey) return nadaLeido()
    let salida: string
    try {
      salida = await openrouterVision(
        { apiKey },
        INSTRUCCION,
        [{ data: buffer.toString('base64'), mediaType: mimeType }],
        'Extrae los datos de esta póliza.',
      )
    } catch (e) {
      console.warn('[portal] openrouterVision falló:', e)
      return nadaLeido()
    }
    return { datos: parsear(salida), fuente: 'vision' }
  }

  return nadaLeido()
}

/**
 * Un JSON que no parsea devuelve los cinco campos a `null`, NUNCA campos a
 * medias ni cadenas de cajón. Media extracción pintada como póliza es peor que
 * ninguna: el usuario se cree que está guardada.
 */
function parsear(salida: string): PolizaExtraida {
  try {
    return normalizarPolizaLeida(JSON.parse(cleanJSON(salida)))
  } catch {
    return polizaLeidaVacia()
  }
}
