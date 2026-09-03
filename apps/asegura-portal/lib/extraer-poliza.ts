// Lee una póliza que aporta el usuario: PDF → texto → IA, o foto → visión.
// Replica el pipeline ya probado de apps/sivra/lib/agente-facturas/extraer.ts.
//
// ⚠️ Lo que sale de aquí es SIEMPRE un dato leído por una máquina, nunca un dato
// de contrato: quien lo guarde lo marca `declarado` (ver `procedencia.ts` de
// @central/module-seguros-portal). Y la normalización —qué es dato y qué es un
// «no lo sé» disfrazado— vive en ese módulo puro, no aquí: es la regla que
// decide si un campo existe, y no puede depender de qué proveedor respondió.
//
// Los identificadores del BIEN (matrícula, bastidor y fecha de matriculación)
// se leen aquí pero se validan en `lib/poliza-editable.ts`, que es puro: la
// misma regla tiene que valer para lo que lee la máquina y para lo que corrige
// a mano la persona. Lo único que cambia es la reacción — aquí, un valor que no
// tiene forma de bastidor sale `null` («no lo hemos sabido leer») y la póliza
// se guarda igual; allí es un error que la persona ve.
import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'
import { normalizarPolizaLeida, polizaLeidaVacia, type PolizaLeida } from '@central/module-seguros-portal'

import { normalizarVehiculoLeido, vehiculoLeidoVacio, type VehiculoLeido } from './poliza-editable'

/**
 * Lo que se lee de un documento: el contrato (`PolizaLeida`) más el vehículo
 * (`VehiculoLeido`). Son cosas distintas —una póliza cambia, el coche no— y
 * viven juntas solo mientras no exista una ficha de bien propia.
 */
export type PolizaExtraida = PolizaLeida & VehiculoLeido

export type ResultadoExtraccion = {
  datos: PolizaExtraida
  /** `none` = no se pudo leer NADA. No es lo mismo que «la póliza no tiene esos datos». */
  fuente: 'texto' | 'vision' | 'none'
}

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"compania":string|null,"numeroPoliza":string|null,"ramo":string|null,"primaAnual":number|null,"fechaVencimiento":"YYYY-MM-DD"|null,"matricula":string|null,"bastidor":string|null,"fechaMatriculacion":"YYYY-MM-DD"|null}
Reglas:
- "ramo" debe ser uno de: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, otros.
- "primaAnual" en euros, solo el número, con punto decimal.
- "matricula": la matrícula española del vehículo asegurado, tal cual aparece.
- "bastidor": el número de bastidor o VIN del vehículo, 17 caracteres. Cópialo carácter a carácter; NUNCA lo completes, ni lo corrijas, ni rellenes los que no leas.
- "fechaMatriculacion": la fecha de PRIMERA MATRICULACIÓN del vehículo, que no es la fecha de efecto ni la de vencimiento de la póliza.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes ni lo deduzcas, y NUNCA escribas "N/A", "no consta", "desconocido" ni un guion: eso es null.`

/** Nada leído: TODOS los campos a `null` y `fuente: 'none'`. */
function nadaLeido(): ResultadoExtraccion {
  return { datos: { ...polizaLeidaVacia(), ...vehiculoLeidoVacio() }, fuente: 'none' }
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
 * Un JSON que no parsea devuelve TODOS los campos a `null`, NUNCA campos a
 * medias ni cadenas de cajón. Media extracción pintada como póliza es peor que
 * ninguna: el usuario se cree que está guardada.
 *
 * Las dos normalizaciones son independientes a propósito: el contrato lo
 * normaliza el módulo puro compartido (`@central/module-seguros-portal`) y el
 * vehículo `lib/poliza-editable.ts`, que es el mismo que valida la corrección a
 * mano. Ninguna de las dos lanza.
 */
export function parsearPolizaExtraida(bruto: unknown, hoy: Date = new Date()): PolizaExtraida {
  return { ...normalizarPolizaLeida(bruto), ...normalizarVehiculoLeido(bruto, hoy) }
}

function parsear(salida: string): PolizaExtraida {
  try {
    return parsearPolizaExtraida(JSON.parse(cleanJSON(salida)))
  } catch {
    return { ...polizaLeidaVacia(), ...vehiculoLeidoVacio() }
  }
}
