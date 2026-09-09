// Lee una PÓLIZA que sube el corredor, de CUALQUIER ramo: PDF → texto → IA, o
// foto → visión. Sustituye a `extraer-auto.ts` (que solo leía auto): la IA
// detecta primero el ramo y, según cuál sea, lee lo que hace falta para pedir
// precio de ESE ramo (hoy: auto/moto y hogar, los dos que se retarifican —
// `retarificabilidad()` de `@central/module-seguros`).
//
// ─── Por qué UNA sola llamada y no dos pasadas (como el portal) ────────────
// `apps/asegura-portal/lib/extraer-poliza.ts` detecta el ramo en una llamada y
// pide los campos propios del ramo en una SEGUNDA, porque ahí el catálogo es
// enorme (10 ramos con hasta 11 campos cada uno) y la mayoría de pólizas no
// necesitan leerlo. Aquí solo hay DOS ramos con campos propios y son pocos
// (8 de auto + 7 de hogar), así que caben en la misma instrucción sin pasar
// el presupuesto de tokens: una llamada menos es un fallo menos que declarar.
//
// ─── Lo que sale de aquí NO es un dato de contrato ──────────────────────────
// Es lo que una máquina dice haber leído. Quien lo guarde lo marca con
// procedencia `documento` (`@central/module-seguros-portal`), que:
//   - vale MÁS que lo que alguien teclea (detrás hay un papel real), y
//   - vale MENOS que lo que mandó la compañía por CIMA, así que **nunca lo pisa**.
//
// La normalización —qué es un dato y qué es un «no lo sé» disfrazado— vive en
// `@central/module-seguros` (`documento-auto.ts`/`documento-hogar.ts`), no
// aquí: es la regla que decide si un campo existe, y no puede depender de qué
// proveedor de IA respondió. El mismo comportamiento ante un marcador de cajón
// lo vigila `test/regression-marcadores-sin-dato.test.ts`.

import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'
import {
  normalizarAutoLeido,
  autoLeidoVacio,
  normalizarHogarLeido,
  hogarLeidoVacio,
  type AutoLeido,
  type HogarLeido,
} from '@central/module-seguros'
import { revisarFichero, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES } from './fichero.ts'

export { revisarFichero, TIPOS_ACEPTADOS, TAMANO_MAXIMO_BYTES }

/** Ramos que la IA puede identificar. Cualquier otra cosa es «no se sabe». */
const RAMOS = [
  'auto',
  'moto',
  'hogar',
  'vida',
  'salud',
  'decesos',
  'responsabilidad_civil',
  'comercio',
  'comunidades',
  'otros',
] as const
type Ramo = (typeof RAMOS)[number]

function ramoDetectado(v: unknown): Ramo | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  return (RAMOS as readonly string[]).includes(t) ? (t as Ramo) : null
}

/**
 * Qué lectura extendida le corresponde a cada ramo que hoy la tiene. Mismos
 * dos que se retarifican (`retarificabilidad()`): leer campos propios de un
 * ramo que no se puede cotizar no aporta nada y complicaría el prompt para
 * nada. `RAMOS_CON_LECTURA_EXTENDIDA` se DERIVA de este mapa —nunca al
 * revés— para que no puedan divergir: añadir un ramo aquí es lo único que
 * hace falta para que `empaquetar()` lo lea de verdad.
 */
const FASE_POR_RAMO_EXTENDIDO = {
  auto: 'auto',
  moto: 'auto',
  hogar: 'hogar',
} as const satisfies Record<string, 'auto' | 'hogar'>

export const RAMOS_CON_LECTURA_EXTENDIDA = Object.keys(
  FASE_POR_RAMO_EXTENDIDO,
) as (keyof typeof FASE_POR_RAMO_EXTENDIDO)[]

export type ResultadoLecturaPoliza =
  | { fase: 'ninguno'; motivo: string }
  | { ramo: Ramo | null; fase: 'auto'; fuente: 'texto' | 'vision'; datos: AutoLeido }
  | { ramo: Ramo | null; fase: 'hogar'; fuente: 'texto' | 'vision'; datos: HogarLeido }
  | { ramo: Ramo | null; fase: 'contrato_solo'; fuente: 'texto' | 'vision'; datos: AutoLeido }

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas, de CUALQUIER ramo.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"ramo":string|null,"compania":string|null,"codigoEntidadDgs":string|null,"numeroPoliza":string|null,
"fechaEfecto":"YYYY-MM-DD"|null,"fechaVencimiento":"YYYY-MM-DD"|null,"primaAnual":number|null,
"tomador":string|null,"dni":string|null,"fechaNacimiento":"YYYY-MM-DD"|null,
"matricula":string|null,"marca":string|null,"modelo":string|null,"version":string|null,
"fechaMatriculacion":"YYYY-MM-DD"|null,"fechaCarnet":"YYYY-MM-DD"|null,
"aniosSinSiniestros":number|null,"siniestrosUltimos5":number|null,
"direccion":string|null,"cp":string|null,"localidad":string|null,"metrosCuadrados":number|null,
"anioConstruccion":number|null,"capitalContinente":number|null,"capitalContenido":number|null}

Reglas, por orden de importancia:
- "ramo" es de qué es la póliza: uno de auto, moto, hogar, vida, salud, decesos,
  responsabilidad_civil, comercio, comunidades, otros. Si no lo puedes decidir, null.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes, lo deduzcas
  ni lo copies de otro campo parecido.
- NO escribas "no consta", "desconocido", "N/A" ni similares: eso es null.
- "codigoEntidadDgs" es el código DGS de la aseguradora con la forma C0058. Si el
  documento no lo trae literalmente, null (NO lo deduzcas del nombre).
- "primaAnual", "capitalContinente" y "capitalContenido" en euros, solo el número.
- Los campos de VEHÍCULO (matricula, marca, modelo, version, fechaMatriculacion,
  fechaCarnet, aniosSinSiniestros, siniestrosUltimos5) solo tienen sentido si el
  ramo es auto o moto: en cualquier otro caso, todos a null.
- Los campos de VIVIENDA (direccion, cp, localidad, metrosCuadrados,
  anioConstruccion, capitalContinente, capitalContenido) solo tienen sentido si
  el ramo es hogar: en cualquier otro caso, todos a null.
- "matricula" tal y como aparezca, sin espacios ni guiones.
- "cp" el código postal tal y como aparezca, con sus 5 dígitos (aunque empiece por 0).
- "aniosSinSiniestros" y "siniestrosUltimos5" solo si el documento los dice.
  Un 0 es una respuesta válida; "varios" o "algunos" NO son números: pon null.
- Las fechas SIEMPRE en formato YYYY-MM-DD.`

const PETICION = 'Extrae los datos de esta póliza de seguro.'

function nadaLeido(motivo: string): ResultadoLecturaPoliza {
  return { fase: 'ninguno', motivo }
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Un JSON que no parsea produce TODOS los campos a `null`, nunca campos a
 * medias: media extracción pintada como póliza es peor que ninguna.
 */
function parsear(salida: string): { ramo: Ramo | null; auto: AutoLeido; hogar: HogarLeido } {
  let bruto: unknown
  try {
    bruto = JSON.parse(cleanJSON(salida))
  } catch {
    bruto = null
  }
  const o = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {}
  return {
    ramo: ramoDetectado(o.ramo),
    auto: normalizarAutoLeido(bruto),
    hogar: normalizarHogarLeido(bruto),
  }
}

function empaquetar(
  ramo: Ramo | null,
  auto: AutoLeido,
  hogar: HogarLeido,
  fuente: 'texto' | 'vision',
): ResultadoLecturaPoliza {
  // La ÚNICA fuente de qué ramo tiene lectura extendida es `FASE_POR_RAMO_EXTENDIDO`:
  // si un ramo no está ahí (incluido "no reconocido"), no hay `fase` que mirar.
  const fase = ramo !== null ? FASE_POR_RAMO_EXTENDIDO[ramo as keyof typeof FASE_POR_RAMO_EXTENDIDO] : undefined
  if (fase === 'hogar') return { ramo, fase, fuente, datos: hogar }
  if (fase === 'auto') return { ramo, fase, fuente, datos: auto }
  // Ramo sin lectura extendida (o no reconocido): se enseña el contrato con la
  // misma forma que auto (comparte todos esos campos), sin el vehículo — que
  // ya llega a `null` porque el modelo no debía rellenarlo para ese ramo.
  return { ramo, fase: 'contrato_solo', fuente, datos: auto }
}

export async function leerPoliza(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
): Promise<ResultadoLecturaPoliza> {
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
      return nadaLeido(
        'El PDF no tiene texto: parece un escaneo. Súbelo como foto (JPG o PNG) y se leerá con visión.',
      )
    }
    try {
      const salida = await aiComplete(texto.slice(0, 20_000), { system: INSTRUCCION, maxTokens: 1100 })
      const { ramo, auto, hogar } = parsear(salida)
      return empaquetar(ramo, auto, hogar, 'texto')
    } catch (e) {
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
      const { ramo, auto, hogar } = parsear(salida)
      return empaquetar(ramo, auto, hogar, 'vision')
    } catch (e) {
      console.warn('[asegura] openrouterVision falló:', e)
      return nadaLeido(`No se ha podido leer la imagen: ${mensaje(e)}`)
    }
  }

  return nadaLeido(`Tipo de fichero no admitido: ${mimeType || 'desconocido'}.`)
}

export { autoLeidoVacio, hogarLeidoVacio }
