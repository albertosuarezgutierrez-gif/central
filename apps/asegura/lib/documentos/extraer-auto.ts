// Lee una PÓLIZA DE AUTO que sube el corredor: PDF → texto → IA, o foto → visión.
//
// Sigue el mismo pipeline que `apps/asegura-portal/lib/extraer-poliza.ts`, que
// ya está probado contra documentos reales. La diferencia es QUÉ se busca: allí
// los cinco campos que el asegurado ve en su bóveda, aquí lo que hace falta
// para pedir precio (el vehículo, la antigüedad y el historial).
//
// ─── Lo que sale de aquí NO es un dato de contrato ──────────────────────────
// Es lo que una máquina dice haber leído. Quien lo guarde lo marca con
// procedencia `documento` (`@central/module-seguros-portal`), que:
//   - vale MÁS que lo que alguien teclea (detrás hay un papel real), y
//   - vale MENOS que lo que mandó la compañía por CIMA, así que **nunca lo pisa**
//     (para eso está `debeSustituir()`, y por eso no se compara a mano).
//
// La normalización —qué es un dato y qué es un «no lo sé» disfrazado— vive en
// `@central/module-seguros`, no aquí: es la regla que decide si un campo existe
// y no puede depender de qué proveedor de IA respondió.

import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'
import { normalizarAutoLeido, autoLeidoVacio, type AutoLeido } from '@central/module-seguros'
import { revisarFichero, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES } from './fichero.ts'

export { revisarFichero, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES }

export type ResultadoLectura = {
  datos: AutoLeido
  /**
   * TRES estados, y la diferencia importa:
   *   `texto`  → se leyó el PDF y respondió la IA.
   *   `vision` → era una imagen y respondió el modelo de visión.
   *   `none`   → **no se pudo leer NADA**. Que NO es «el documento no tiene
   *              esos datos»: es que no lo hemos podido mirar.
   */
  fuente: 'texto' | 'vision' | 'none'
  /** Por qué no se pudo leer, cuando `fuente` es `none`. Para decirlo en pantalla. */
  motivo?: string
}

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro de AUTOMÓVIL españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"compania":string|null,"codigoEntidadDgs":string|null,"numeroPoliza":string|null,
"fechaEfecto":"YYYY-MM-DD"|null,"fechaVencimiento":"YYYY-MM-DD"|null,"primaAnual":number|null,
"matricula":string|null,"marca":string|null,"modelo":string|null,"version":string|null,
"fechaMatriculacion":"YYYY-MM-DD"|null,"tomador":string|null,"dni":string|null,
"fechaNacimiento":"YYYY-MM-DD"|null,"fechaCarnet":"YYYY-MM-DD"|null,
"aniosSinSiniestros":number|null,"siniestrosUltimos5":number|null}

Reglas, por orden de importancia:
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes, lo deduzcas
  ni lo copies de otro campo parecido.
- NO escribas "no consta", "desconocido", "N/A" ni similares: eso es null.
- "codigoEntidadDgs" es el código DGS de la aseguradora con la forma C0058. Si el
  documento no lo trae literalmente, null (NO lo deduzcas del nombre).
- "matricula" tal y como aparezca, sin espacios ni guiones.
- "primaAnual" en euros, solo el número.
- "aniosSinSiniestros" y "siniestrosUltimos5" solo si el documento los dice.
  Un 0 es una respuesta válida; "varios" o "algunos" NO son números: pon null.
- Las fechas SIEMPRE en formato YYYY-MM-DD.`

const PETICION = 'Extrae los datos de esta póliza de automóvil.'

function nadaLeido(motivo: string): ResultadoLectura {
  return { datos: autoLeidoVacio(), fuente: 'none', motivo }
}

export async function leerPolizaAuto(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
): Promise<ResultadoLectura> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch (e) {
      console.warn('[asegura] pdf-parse falló:', e)
    }
    if (!texto.trim()) {
      // Un PDF sin texto suele ser un escaneo. Decirlo es útil: la salida es
      // volver a subirlo como foto, no que el corredor crea que está roto.
      return nadaLeido(
        'El PDF no tiene texto: parece un escaneo. Súbelo como foto (JPG o PNG) y se leerá con visión.',
      )
    }
    try {
      const salida = await aiComplete(texto.slice(0, 20_000), {
        system: INSTRUCCION,
        maxTokens: 900,
      })
      return { datos: parsear(salida), fuente: 'texto' }
    } catch (e) {
      // Un fallo de IA es «no lo hemos podido mirar», no «no hay datos».
      console.warn('[asegura] aiComplete falló:', e)
      return nadaLeido(`No se ha podido leer el documento: ${mensaje(e)}`)
    }
  }

  if (mimeType.startsWith('image/')) {
    const apiKey = process.env.OPENROUTER_API_KEY ?? ''
    if (!apiKey) {
      return nadaLeido('La lectura de imágenes no está configurada en este entorno.')
    }
    try {
      const salida = await openrouterVision(
        { apiKey },
        INSTRUCCION,
        [{ data: buffer.toString('base64'), mediaType: mimeType }],
        PETICION,
      )
      return { datos: parsear(salida), fuente: 'vision' }
    } catch (e) {
      console.warn('[asegura] openrouterVision falló:', e)
      return nadaLeido(`No se ha podido leer la imagen: ${mensaje(e)}`)
    }
  }

  return nadaLeido(`Tipo de fichero no admitido: ${mimeType || 'desconocido'}.`)
}

/**
 * Un JSON que no parsea devuelve TODOS los campos a `null`, nunca campos a
 * medias. Media extracción pintada como póliza es peor que ninguna: quien la
 * mira se cree que eso es lo que pone el documento.
 */
function parsear(salida: string): AutoLeido {
  try {
    return normalizarAutoLeido(JSON.parse(cleanJSON(salida)))
  } catch {
    return autoLeidoVacio()
  }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
