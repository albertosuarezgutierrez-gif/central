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

import { openrouterVision, cleanJSON } from '@central/core-ai'
import { iaTexto } from '../ia.ts'
import { leerPdfProbando, pdfCifrado } from './pdf-contrasena.ts'
import {
  normalizarAutoLeido,
  autoLeidoVacio,
  normalizarHogarLeido,
  hogarLeidoVacio,
  normalizarContactoTomador,
  normalizarFigurasLeidas,
  figurasSinNombre,
  type AutoLeido,
  type FiguraLeida,
  type FiguraSinNombre,
  type ContactoTomadorLeido,
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

/**
 * Lo leído además de los datos del ramo (03/10/2026): el contacto y domicilio del TOMADOR, la clase
 * de carné, el mediador y la cesión de derechos (`contacto`, ya normalizado: `null` = no lo dice), y
 * el JSON tal cual lo devolvió la IA (`bruto`, que se guarda con el documento). En motor, además,
 * las `figuras` que no son (necesariamente) el tomador: propietario y conductores (y las que llevan rol
 * sin nombre, `figurasSinNombre`: sin ficha, una línea en la oportunidad). Opcionales para no
 * romper a quien construye un resultado a mano (tests, Telegram).
 */
type Extra = { contacto?: ContactoTomadorLeido; figuras?: FiguraLeida[]; figurasSinNombre?: FiguraSinNombre[]; bruto?: Record<string, unknown> | null }

export type ResultadoLecturaPoliza =
  | { fase: 'ninguno'; motivo: string }
  | ({ ramo: Ramo | null; fase: 'auto'; fuente: 'texto' | 'vision'; datos: AutoLeido } & Extra)
  | ({ ramo: Ramo | null; fase: 'hogar'; fuente: 'texto' | 'vision'; datos: HogarLeido } & Extra)
  | ({ ramo: Ramo | null; fase: 'contrato_solo'; fuente: 'texto' | 'vision'; datos: AutoLeido } & Extra)

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas, de CUALQUIER ramo.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"ramo":string|null,"compania":string|null,"cifCompania":string|null,"codigoEntidadDgs":string|null,"numeroPoliza":string|null,
"fechaEfecto":"YYYY-MM-DD"|null,"fechaVencimiento":"YYYY-MM-DD"|null,"primaAnual":number|null,
"tomador":string|null,"dni":string|null,"fechaNacimiento":"YYYY-MM-DD"|null,
"matricula":string|null,"marca":string|null,"modelo":string|null,"version":string|null,"combustible":string|null,
"fechaMatriculacion":"YYYY-MM-DD"|null,"fechaCarnet":"YYYY-MM-DD"|null,
"aniosSinSiniestros":number|null,"siniestrosUltimos5":number|null,
"direccion":string|null,"cp":string|null,"localidad":string|null,"metrosCuadrados":number|null,
"anioConstruccion":number|null,"capitalContinente":number|null,"capitalContenido":number|null,
"telefono":string|null,"email":string|null,"domicilioVia":string|null,"domicilioCp":string|null,
"domicilioPoblacion":string|null,"domicilioProvincia":string|null,"claseCarnet":string|null,
"mediador":string|null,"cesionDerechos":boolean|null,"modalidad":string|null,"pagoUnicoPlurianual":boolean|null,"tomadorEsConductorHabitual":boolean|null,
"tomadorEsEmpresa":boolean|null,"cifTomador":string|null,"personaContactoTomador":string|null,
"figuras":[{"rol":"propietario"|"conductor_habitual"|"conductor_ocasional","nombre":string|null,"dni":string|null,
"fechaNacimiento":"YYYY-MM-DD"|null,"fechaCarnet":"YYYY-MM-DD"|null,"claseCarnet":string|null,"esTomador":boolean|null,
"domicilioVia":string|null,"domicilioCp":string|null,"domicilioPoblacion":string|null,"domicilioProvincia":string|null}]}

Reglas, por orden de importancia:
- "ramo" es de qué es la póliza: uno de auto, moto, hogar, vida, salud, decesos,
  responsabilidad_civil, comercio, comunidades, otros. Si no lo puedes decidir, null.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes, lo deduzcas
  ni lo copies de otro campo parecido.
- NO escribas "no consta", "desconocido", "N/A" ni similares: eso es null.
- "compania" es la compañía ASEGURADORA: la que asume el riesgo, como sale en el MEMBRETE o en
  la RAZÓN SOCIAL del pie legal (p. ej. "MAPFRE ESPAÑA", "Allianz"). NO es el mediador (corredor,
  agente, oficina o banco que la vende) NI la antefirma: "P.P." significa "por poder" y va delante
  de la firma de un apoderado; nunca es la compañía, ni tampoco unas siglas sueltas ("S.A."). Si
  no ves la aseguradora, null.
- "cifCompania" es el CIF de esa MISMA aseguradora tal como sale junto a su razón social (p. ej.
  "A28141935"), sin espacios ni guiones. NO el del mediador ni el del tomador. Si no aparece, null.
- "codigoEntidadDgs" es el código DGS de la aseguradora con la forma C0058. Si el
  documento no lo trae literalmente, null (NO lo deduzcas del nombre).
- "primaAnual" es lo que cuesta el seguro un AÑO, en euros y solo el número.
  🚨 NO es el importe del recibo cuando ese recibo lleva descuentos de otra
  póliza. Si el documento dice que se abona o se descuenta la "parte de prima no
  consumida" de una póliza anterior (extorno, regularización, continuidad
  Bonus-Malus), el "Total Recibo" es MENOR que la prima y NO sirve: usa la prima
  del periodo anual completo. Si solo aparece el recibo rebajado y no se puede
  reconstruir la prima del año, pon null — un importe demasiado bajo parece un
  precio y no hay nada que delate el error.
- "primaAnual" es el TOTAL que paga el cliente (con recargos, IPS y Consorcio),
  no la prima neta. Si el pago es fraccionado, el año completo, no el fraccionamiento.
- "capitalContinente" y "capitalContenido" en euros, solo el número.
- "combustible" es el tipo de combustible/motor del vehículo tal como lo escribe el documento
  (p. ej. "Gasolina", "Diésel", "Eléctrico", "Híbrido"). Si no aparece, null: NO lo deduzcas de la
  marca ni del modelo.
- Los campos de VEHÍCULO (matricula, marca, modelo, version, combustible, fechaMatriculacion,
  fechaCarnet, aniosSinSiniestros, siniestrosUltimos5) solo tienen sentido si el
  ramo es auto o moto: en cualquier otro caso, todos a null.
- Los campos de VIVIENDA (direccion, cp, localidad, metrosCuadrados,
  anioConstruccion, capitalContinente, capitalContenido) solo tienen sentido si
  el ramo es hogar: en cualquier otro caso, todos a null.
- "tomador" es el TOMADOR del seguro, que el documento puede llamar "tomador", "titular de la
  póliza", "nombre del titular de la póliza", "contratante" o "policyholder". Si es una EMPRESA
  (sociedad, "Empresa: …", S.L., S.A.…), "tomador" es su RAZÓN SOCIAL tal cual, NUNCA la "persona de
  contacto" ni el conductor.
- "tomadorEsEmpresa": true si el tomador es una persona jurídica (empresa, sociedad, comunidad,
  asociación…); false si es una persona física; null si no se puede decidir.
- "cifTomador" es el identificador fiscal del tomador EMPRESA: su CIF, que puede venir rotulado
  "CIF", "NIF", "Número de IVA", "NIF-IVA" o "VAT", a veces con el prefijo de país ("ESB12345674").
  Cópialo tal cual aparece. Si el tomador es persona física, null.
- "dni" es el DNI/NIE del tomador PERSONA FÍSICA. Si el tomador es una empresa, "dni" es null (NO
  pongas el de la persona de contacto ni el del conductor).
- "figuras" (solo auto o moto; en otro ramo, []): cada PERSONA que la póliza nombra como
  "propietario" (titular del vehículo), "conductor_habitual" (conductor principal/habitual) o
  "conductor_ocasional" (conductor adicional/ocasional), una entrada por rol y persona, como mucho 6.
  También si es el propio tomador (entonces "esTomador": true; si es otra persona, false; si no se
  sabe, null). "nombre" con nombre y apellidos; "dni", "fechaNacimiento", "fechaCarnet" y
  "claseCarnet" ("B", "A2"…) de ESA persona, null si no aparecen junto a ella. "domicilioVia",
  "domicilioCp", "domicilioPoblacion" y "domicilioProvincia" son el domicilio de ESA persona si
  figura junto a ella (separado en sus partes, como el del tomador); si no, null (NUNCA copies el
  del tomador). Si la póliza trae un conductor (p. ej. "Conductor adicional") con algún dato pero
  SIN nombre, inclúyelo con "nombre": null (no inventes uno). Si la póliza no nombra a nadie en
  esos papeles, [].
- "personaContactoTomador": si el tomador es una EMPRESA y la póliza trae una "persona de
  contacto", su nombre tal cual (solo el nombre, sin teléfono ni email). Si no la trae, o el tomador
  es una persona física, null.
- Los datos de CONTACTO son SOLO del TOMADOR (no de la compañía, ni de la oficina, ni del agente,
  ni el teléfono de asistencia): "telefono" (el suyo, móvil o fijo), "email" (el suyo). Si el
  tomador es una empresa, son los que figuran en el bloque del titular (aunque sean los de su
  persona de contacto).
- "domicilioVia", "domicilioCp", "domicilioPoblacion", "domicilioProvincia" son el DOMICILIO DEL
  TOMADOR (calle y número / código postal / población / provincia). Si viene en una sola línea
  ("Calle Mayor 17 41003 Sevilla"), sepáralo en sus partes. NO son la dirección de la
  vivienda asegurada (esa va en "direccion"/"cp"/"localidad"): aunque coincidan, rellena las dos.
- "fechaNacimiento" es la del TOMADOR persona física (o del conductor principal si es la misma
  persona). Si el tomador es una empresa, null: la del conductor va en su entrada de "figuras".
- "fechaCarnet" y "claseCarnet" son del CONDUCTOR HABITUAL (el permiso que figura en la póliza).
- "tomadorEsConductorHabitual": true SOLO si el documento dice que el tomador es también el
  conductor habitual/principal (p. ej. "Conductor habitual: el tomador", o el mismo nombre y DNI en
  los dos sitios); false si el conductor habitual es otra persona; si no lo dice, null.
- "claseCarnet" la clase del permiso de conducir ("B", "A2"…) solo si el documento la escribe.
- "mediador" es el agente, corredor, oficina o entidad que figura como mediador/canal de la póliza
  (p. ej. "RCI BANQUE", "Mobilize Financial Services", "Oficina 1234"). null si no aparece.
- "cesionDerechos": true si la póliza recoge una cesión de derechos o un beneficiario
  preferente a favor de un banco o financiera; false si dice expresamente que no; si no dice
  nada, null.
- "pagoUnicoPlurianual": true si el seguro es de VARIOS años (plurianual) y el documento dice que se paga
  de una sola vez (pago único, prima única del periodo completo); false si dice que se paga por años,
  fraccionado o anual; si no lo dice, null. NO lo deduzcas de las fechas.
- "modalidad" (solo auto o moto) es la modalidad de cobertura tal como la nombra la póliza ("Terceros",
  "Terceros ampliado", "Todo riesgo con franquicia de 300 €"…). Si no la nombra, null.
- "matricula" tal y como aparezca, sin espacios ni guiones.
- "cp" el código postal tal y como aparezca, con sus 5 dígitos (aunque empiece por 0).
- "aniosSinSiniestros" y "siniestrosUltimos5" solo si el documento los dice.
  Un 0 es una respuesta válida; "varios" o "algunos" NO son números: pon null.
- Las fechas SIEMPRE en formato YYYY-MM-DD (también las que el documento escribe en texto, como
  "2 de jul. de 1971").`

const PETICION = 'Extrae los datos de esta póliza de seguro.'

/**
 * Tope de salida de la IA (texto y visión). 1.700 bastaban para los campos sueltos; con `figuras`
 * (hasta 6 personas con 11 claves cada una, domicilio incluido) el JSON crece, y uno cortado no
 * parsea y se queda en «nada leído» (03/10/2026).
 */
const MAX_TOKENS = 3000

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
function parsear(salida: string): { ramo: Ramo | null; auto: AutoLeido; hogar: HogarLeido; contacto: ContactoTomadorLeido; figuras: FiguraLeida[]; sinNombre: FiguraSinNombre[]; bruto: Record<string, unknown> | null } {
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
    contacto: normalizarContactoTomador(bruto),
    figuras: normalizarFigurasLeidas(bruto),
    sinNombre: figurasSinNombre(bruto),
    bruto: Object.keys(o).length > 0 ? o : null,
  }
}

function empaquetar(
  { ramo, auto, hogar, contacto, figuras, sinNombre, bruto }: ReturnType<typeof parsear>,
  fuente: 'texto' | 'vision',
): ResultadoLecturaPoliza {
  // La ÚNICA fuente de qué ramo tiene lectura extendida es `FASE_POR_RAMO_EXTENDIDO`:
  // si un ramo no está ahí (incluido "no reconocido"), no hay `fase` que mirar.
  const fase = ramo !== null ? FASE_POR_RAMO_EXTENDIDO[ramo as keyof typeof FASE_POR_RAMO_EXTENDIDO] : undefined
  if (fase === 'hogar') return { ramo, fase, fuente, datos: hogar, contacto, bruto }
  // Las figuras (propietario, conductores) solo se leen de motor.
  if (fase === 'auto') return { ramo, fase, fuente, datos: auto, contacto, figuras, figurasSinNombre: sinNombre, bruto }
  // Ramo sin lectura extendida (o no reconocido): se enseña el contrato con la
  // misma forma que auto (comparte todos esos campos), sin el vehículo — que
  // ya llega a `null` porque el modelo no debía rellenarlo para ese ramo.
  return { ramo, fase: 'contrato_solo', fuente, datos: auto, contacto, bruto }
}

/** Texto con `pdf-parse`; `''` si no abre (se dice aguas abajo). */
async function textoPdfParse(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    return (await pdfParse(buffer)).text || ''
  } catch (e) {
    console.warn('[asegura] pdf-parse falló:', e)
    return ''
  }
}

export async function leerPoliza(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
  /** Contraseñas a probar si el PDF está protegido (el DNI del cliente de la ficha). Nunca se devuelven. */
  opts: { contrasenas?: () => Promise<string[]> } = {},
): Promise<ResultadoLecturaPoliza> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    if (pdfCifrado(buffer)) {
      // Las compañías protegen la póliza con el DNI del tomador: se prueba el de la ficha.
      // `null` = no se ha podido consultar el DNI (BD o clave PII): no es «la ficha no tiene».
      const candidatas = opts.contrasenas ? await opts.contrasenas().catch(() => null) : []
      const r = await leerPdfProbando(buffer, candidatas ?? [])
      const rescate = !r.ok && r.motivo === 'ilegible' ? await textoPdfParse(buffer) : ''
      if (rescate.trim()) {
        texto = rescate
      } else if (!r.ok) {
        return nadaLeido(
          !opts.contrasenas && r.motivo !== 'ilegible'
            ? 'El PDF tiene contraseña. Súbelo desde la ficha del cliente (se prueba su DNI) o sin protección.'
            : candidatas === null && r.motivo !== 'ilegible'
            ? 'El PDF tiene contraseña y no se ha podido consultar el DNI de la ficha para probarlo. Vuelve a intentarlo en un momento.'
            : r.motivo === 'sin_candidatas'
            ? 'El PDF tiene contraseña y esta ficha no tiene un DNI con el que probar. Guarda el DNI del cliente y vuelve a leerlo.'
            : r.motivo === 'ninguna_vale'
              ? 'El PDF tiene contraseña y no es el DNI de este cliente (quizá es el de otro tomador). Ábrelo con su contraseña y súbelo sin protección, o súbelo como foto.'
              : 'El PDF tiene contraseña y no se ha podido abrir. Súbelo sin protección o como foto.',
        )
      } else {
        texto = r.texto
      }
    } else {
      texto = await textoPdfParse(buffer)
    }
    if (!texto.trim()) {
      return nadaLeido(
        'El PDF no tiene texto: parece un escaneo. Súbelo como foto (JPG o PNG) y se leerá con visión.',
      )
    }
    try {
      const salida = await iaTexto(texto.slice(0, 20_000), { system: INSTRUCCION, maxTokens: MAX_TOKENS, timeoutMs: 55_000, privado: true })
      return empaquetar(parsear(salida), 'texto')
    } catch (e) {
      console.warn('[asegura] lectura de texto por IA falló:', e)
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
        { maxTokens: MAX_TOKENS },
      )
      return empaquetar(parsear(salida), 'vision')
    } catch (e) {
      console.warn('[asegura] openrouterVision falló:', e)
      return nadaLeido(`No se ha podido leer la imagen: ${mensaje(e)}`)
    }
  }

  return nadaLeido(`Tipo de fichero no admitido: ${mimeType || 'desconocido'}.`)
}

export { autoLeidoVacio, hogarLeidoVacio }
