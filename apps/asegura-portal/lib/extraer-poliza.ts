// Lee una póliza que aporta el usuario: PDF → texto → IA, o foto → visión.
// Replica el pipeline ya probado de apps/sivra/lib/agente-facturas/extraer.ts.
//
// ⚠️ Lo que sale de aquí es SIEMPRE un dato leído por una máquina, nunca un dato
// de contrato: quien lo guarde lo marca `declarado` (ver `procedencia.ts` de
// @central/module-seguros-portal). Y la normalización —qué es dato y qué es un
// «no lo sé» disfrazado— vive en ese módulo puro, no aquí: es la regla que
// decide si un campo existe, y no puede depender de qué proveedor respondió.
//
// Se lee en DOS pasadas, y la segunda solo existe a veces:
//   1ª — el CONTRATO y el vehículo, con un esquema fijo (`INSTRUCCION`).
//   2ª — los campos propios DEL RAMO que haya salido de la primera, con una
//        instrucción CONSTRUIDA a partir del catálogo (`camposDeRamo()`), nunca
//        escrita a mano aquí: una segunda copia de la lista divergiría del
//        catálogo sin que nada fallara, y entonces la IA no devolvería nunca el
//        campo nuevo y la columna se quedaría a `null` para siempre.
// La 2ª pasada NO se hace si el ramo no se reconoció o si su catálogo está
// vacío: preguntar por una lista de cero campos es gastar una llamada de IA para
// no traer nada. Y si falla, se degrada a `datosRamo: null` — la póliza se
// guarda igual, con su contrato, y los campos del ramo se completan a mano.
//
// Los identificadores del BIEN (matrícula, bastidor y fecha de matriculación
// para el vehículo; la referencia catastral para el inmueble)
// se leen aquí pero se validan en `lib/poliza-editable.ts`, que es puro: la
// misma regla tiene que valer para lo que lee la máquina y para lo que corrige
// a mano la persona. Lo único que cambia es la reacción — aquí, un valor que no
// tiene forma de bastidor sale `null` («no lo hemos sabido leer») y la póliza
// se guarda igual; allí es un error que la persona ve.
import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'
import {
  MAX_TEXTO_RAMO,
  camposDeRamo,
  normalizarDatosRamo,
  normalizarOrigenes,
  normalizarPolizaLeida,
  polizaLeidaVacia,
  type CampoRamo,
  type DatosRamo,
  type OrigenPorCampo,
  type PolizaLeida,
} from '@central/module-seguros-portal'

import {
  normalizarReferenciaCatastralLeida,
  normalizarVehiculoLeido,
  vehiculoLeidoVacio,
  type VehiculoLeido,
} from './poliza-editable'

/**
 * Lo que se lee de un documento: el contrato (`PolizaLeida`), el vehículo
 * (`VehiculoLeido`) y los campos propios del ramo (`datosRamo`). Son cosas
 * distintas —una póliza cambia, el coche no— y viven juntas solo mientras no
 * exista una ficha de bien propia.
 *
 * `datosRamo: null` significa «no se ha podido leer ninguno», que NO es «esta
 * póliza no tiene esos datos». Nunca es `{}`.
 */
export type PolizaExtraida = PolizaLeida &
  VehiculoLeido & {
    /**
     * La referencia catastral del INMUEBLE (20 caracteres), el equivalente de la
     * matrícula para hogar, comercio y comunidades. Una de 14 —la de la FINCA—
     * llega `null`: es la del edificio, y con ella el autorrelleno del Catastro
     * traería los metros del bloque entero a una póliza de un piso.
     */
    referenciaCatastral: string | null
    datosRamo: DatosRamo | null
    /**
     * De dónde salió cada clave de `datosRamo`. Aquí SIEMPRE `documento`: lo ha
     * leído una máquina de un PDF o de una foto, que no es lo mismo que un dato
     * que la persona teclea (`declarado`) ni que uno que acepta del Catastro
     * (`catastro`). Se deriva de `datosRamo`, nunca se escribe suelto: un origen
     * sin su dato es una afirmación sobre algo que no existe.
     */
    datosRamoOrigen: OrigenPorCampo | null
  }

export type ResultadoExtraccion = {
  datos: PolizaExtraida
  /** `none` = no se pudo leer NADA. No es lo mismo que «la póliza no tiene esos datos». */
  fuente: 'texto' | 'vision' | 'none'
}

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"compania":string|null,"numeroPoliza":string|null,"ramo":string|null,"primaAnual":number|null,"fechaVencimiento":"YYYY-MM-DD"|null,"matricula":string|null,"bastidor":string|null,"fechaMatriculacion":"YYYY-MM-DD"|null,"referenciaCatastral":string|null}
Reglas:
- "ramo" debe ser uno de: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, otros.
- "primaAnual" en euros, solo el número, con punto decimal.
- "matricula": la matrícula española del vehículo asegurado, tal cual aparece.
- "bastidor": el número de bastidor o VIN del vehículo, 17 caracteres. Cópialo carácter a carácter; NUNCA lo completes, ni lo corrijas, ni rellenes los que no leas.
- "fechaMatriculacion": la fecha de PRIMERA MATRICULACIÓN del vehículo, que no es la fecha de efecto ni la de vencimiento de la póliza.
- "referenciaCatastral": la referencia catastral del inmueble asegurado, tal cual aparece. Cópiala carácter a carácter; NUNCA la completes ni la corrijas.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes ni lo deduzcas, y NUNCA escribas "N/A", "no consta", "desconocido" ni un guion: eso es null.`

/** Todos los campos a `null`. La forma de un fallo de lectura tiene que ser la
 *  MISMA que la de una lectura buena: si no, quien la guarda deja columnas sin
 *  tocar en vez de escribir NULL. */
function extraidaVacia(): PolizaExtraida {
  return {
    ...polizaLeidaVacia(),
    ...vehiculoLeidoVacio(),
    referenciaCatastral: null,
    datosRamo: null,
    datosRamoOrigen: null,
  }
}

/**
 * Los orígenes de lo que ha leído la máquina: TODAS las claves de `datosRamo` a
 * `documento`, y ninguna más. Se DERIVA de los datos en vez de escribirse a mano
 * en cada sitio, que es lo que garantiza que no pueda quedar un origen huérfano
 * («los metros vienen del documento» sin metros) — el sello de «verificado»
 * sobre un hueco. `normalizarOrigenes` remata la faena descartando lo que no
 * exista en los datos; sin datos, `null`, nunca `{}`.
 */
export function origenesDelDocumento(datos: DatosRamo | null): OrigenPorCampo | null {
  if (datos === null) return null
  return normalizarOrigenes(
    datos,
    Object.fromEntries(Object.keys(datos).map((clave) => [clave, 'documento'])),
  )
}

/** Nada leído: TODOS los campos a `null` y `fuente: 'none'`. */
function nadaLeido(): ResultadoExtraccion {
  return { datos: extraidaVacia(), fuente: 'none' }
}

/**
 * Cómo se le describe a la IA UN campo del catálogo. La forma sale del `tipo`,
 * y el rango y las opciones del propio campo: así, el día que el catálogo gane
 * un campo o cambie un rango, el prompt cambia solo. Escribir la lista a mano
 * aquí sería la segunda copia que acaba divergiendo en silencio.
 */
function describirCampo(campo: CampoRamo): string {
  const forma = (() => {
    switch (campo.tipo) {
      case 'texto':
        return `texto, máximo ${MAX_TEXTO_RAMO} caracteres`
      case 'numero':
      case 'dinero': {
        const unidad = campo.tipo === 'dinero' ? 'número en euros, con punto decimal' : 'número'
        const min = campo.min === undefined ? null : `mínimo ${campo.min}`
        const max = campo.max === undefined ? null : `máximo ${campo.max}`
        const rango = [min, max].filter(Boolean).join(', ')
        return rango ? `${unidad} (${rango})` : unidad
      }
      case 'fecha':
        return 'fecha en formato "YYYY-MM-DD"'
      case 'opcion':
        return `EXACTAMENTE uno de estos valores: ${(campo.opciones ?? []).map((o) => `"${o.valor}"`).join(', ')}`
      case 'triestado':
        return 'true o false; null si el documento no lo dice'
    }
  })()
  const ayuda = campo.ayuda ? ` ${campo.ayuda}` : ''
  return `- "${campo.id}" (${forma}): ${campo.etiqueta}${ayuda}`
}

/**
 * La instrucción de la 2ª pasada, CONSTRUIDA desde `camposDeRamo()`. Devuelve
 * `null` cuando no hay nada que preguntar —ramo no reconocido o catálogo vacío—,
 * y ese `null` es lo que ahorra la llamada.
 */
export function instruccionRamo(ramo: string | null): string | null {
  const campos = camposDeRamo(ramo)
  if (campos.length === 0) return null
  const claves = campos.map((c) => `"${c.id}"`).join(',')
  return `Eres un extractor de datos de pólizas de seguro españolas.
Este documento es una póliza del ramo "${ramo}". Extrae SOLO los datos de esta lista.
Devuelve SOLO un objeto JSON, sin texto alrededor, con estas claves y ninguna más: {${claves}}
Campos:
${campos.map(describirCampo).join('\n')}
Reglas:
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes, ni lo deduzcas, ni lo estimes.
- NUNCA escribas "N/A", "no consta", "desconocido", "pendiente" ni un guion: eso es null.
- No añadas claves que no estén en la lista.`
}

/**
 * Lo leído en la 2ª pasada, normalizado CAMPO A CAMPO contra el catálogo del
 * ramo. Uno a uno y no de golpe a propósito: un solo campo mal leído tiraría el
 * objeto entero, y con él cuatro datos buenos. Un campo que no valida no llega
 * a medias ni con un valor de cajón — sencillamente NO está, que es el «no lo
 * sé» honesto; si no sobrevive ninguno, `null` (la columna vacía), nunca `{}`.
 */
export function normalizarDatosRamoLeidos(ramo: string | null, bruto: unknown): DatosRamo | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const o = bruto as Record<string, unknown>
  // El modelo puede devolver las claves sueltas o envueltas en `datosRamo`: se
  // aceptan las dos formas, porque la alternativa es perder la lectura entera
  // por cómo decidió anidar el JSON.
  const anidado = o.datosRamo
  const fuente =
    anidado && typeof anidado === 'object' && !Array.isArray(anidado)
      ? (anidado as Record<string, unknown>)
      : o

  const datos: Record<string, string | number | boolean> = {}
  for (const campo of camposDeRamo(ramo)) {
    if (!(campo.id in fuente)) continue
    const r = normalizarDatosRamo(ramo, { [campo.id]: fuente[campo.id] })
    if (!r.ok || r.datos === null) continue
    Object.assign(datos, r.datos)
  }
  return Object.keys(datos).length === 0 ? null : datos
}

/**
 * La 2ª pasada. `pedir` es lo único que cambia entre un PDF (texto) y una foto
 * (visión), así que el resto —cuándo se pregunta, cómo se normaliza y qué pasa
 * si falla— vive aquí una sola vez.
 */
async function leerDatosRamo(
  datos: PolizaExtraida,
  pedir: (instruccion: string) => Promise<string>,
): Promise<PolizaExtraida> {
  const instruccion = instruccionRamo(datos.ramo)
  if (instruccion === null) return datos

  let salida: string
  try {
    salida = await pedir(instruccion)
  } catch (e) {
    // «No lo hemos podido mirar», no «no hay datos»: el contrato ya leído se
    // conserva y los campos del ramo se completan a mano.
    console.warn('[portal] 2ª pasada (campos del ramo) falló:', e)
    return datos
  }

  try {
    const datosRamo = normalizarDatosRamoLeidos(datos.ramo, JSON.parse(cleanJSON(salida)))
    // Datos y orígenes se reemplazan JUNTOS: los de la 1ª pasada hablaban de los
    // valores de la 1ª pasada, y aquí acaban de cambiar.
    return { ...datos, datosRamo, datosRamoOrigen: origenesDelDocumento(datosRamo) }
  } catch {
    return datos
  }
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
    const datos = await leerDatosRamo(parsear(salida), (instruccion) =>
      aiComplete(texto.slice(0, 20_000), { system: instruccion, maxTokens: 400 }),
    )
    return { datos, fuente: 'texto' }
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
    const datos = await leerDatosRamo(parsear(salida), (instruccion) =>
      openrouterVision(
        { apiKey },
        instruccion,
        [{ data: buffer.toString('base64'), mediaType: mimeType }],
        'Extrae los datos de esta póliza.',
      ),
    )
    return { datos, fuente: 'vision' }
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
  const contrato = normalizarPolizaLeida(bruto)
  // Normalmente `null`: los campos del ramo los trae la 2ª pasada. Se mira
  // aquí igualmente porque un modelo puede devolverlos ya en la primera, y
  // tirarlos obligaría a preguntar otra vez por algo que ya está dicho.
  const datosRamo = normalizarDatosRamoLeidos(contrato.ramo, bruto)
  const o = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {}
  return {
    ...contrato,
    ...normalizarVehiculoLeido(bruto, hoy),
    // La misma regla que valida la corrección a mano (`lib/poliza-editable.ts`),
    // con la reacción de la máquina: lo que no sea la referencia del INMUEBLE
    // —incluida la de la FINCA, que es real pero es la del edificio— sale `null`
    // y la póliza se guarda igual, para completarla a mano.
    referenciaCatastral: normalizarReferenciaCatastralLeida(o.referenciaCatastral),
    datosRamo,
    datosRamoOrigen: origenesDelDocumento(datosRamo),
  }
}

function parsear(salida: string): PolizaExtraida {
  try {
    return parsearPolizaExtraida(JSON.parse(cleanJSON(salida)))
  } catch {
    return extraidaVacia()
  }
}
