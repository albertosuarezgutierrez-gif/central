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
  importeEsPrimaAnual,
  normalizarTipoDocumento,
  normalizarDatosRamo,
  normalizarOrigenes,
  normalizarPolizaLeida,
  polizaLeidaVacia,
  vencimientoDesdeEfecto,
  type CampoRamo,
  type DatosRamo,
  type OrigenPorCampo,
  type PolizaLeida,
  type TipoDocumento,
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
    /**
     * Qué documento se ha leído. 🚨 NO es metadato: es lo que decide si el
     * importe puede guardarse como prima ANUAL. Un suplemento y un recibo
     * llevan una cifra en euros que no lo es, y sin esta clave el extractor los
     * trataba como una póliza (medido el 07/09/2026: 55,85 € de un suplemento
     * de cambio de vehículo guardados como prima anual de auto).
     */
    tipoDocumento: TipoDocumento | null
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

/**
 * Cómo fue la 2ª pasada, la que lee los campos PROPIOS del ramo (marca, modelo,
 * uso del coche…). Son tres estados y no dos a propósito:
 *
 *   `no_aplica`  — no había nada que preguntar (ramo desconocido o catálogo vacío).
 *   `no_leidos`  — se preguntó y NO se pudo mirar: la IA falló o devolvió vacío.
 *   `leidos`     — se preguntó y volvió al menos un campo.
 *
 * 🚨 `no_leidos` NO es «la póliza no trae marca ni modelo». Sin este estado las
 * dos cosas se ven idénticas en pantalla —campos vacíos bajo un cartel que dice
 * «Leída de tu PDF»— y el cliente concluye que su documento no los lleva. Es el
 * «no lo sé» pintado como «no hay» que persigue el CLAUDE.md de la raíz, y aquí
 * mordió de verdad el 07/09/2026: la 1ª pasada leyó compañía, número, vencimiento
 * y matrícula, la 2ª se llevó un `OpenRouter: respuesta vacía` con toda la cadena
 * de suplentes apagada, y la pantalla no dijo ni una palabra.
 *
 * `leidos` tampoco promete que estén TODOS: promete que la pasada se hizo.
 */
export type EstadoCamposRamo = 'leidos' | 'no_leidos' | 'no_aplica'

export type ResultadoExtraccion = {
  datos: PolizaExtraida
  /** `none` = no se pudo leer NADA. No es lo mismo que «la póliza no tiene esos datos». */
  fuente: 'texto' | 'vision' | 'none'
  /** Cómo fue la 2ª pasada. Ver `EstadoCamposRamo`. */
  camposRamo: EstadoCamposRamo
  /**
   * Por qué `fuente` es `'none'`, cuando se sabe.
   *
   * `'protegido'` = el PDF pide una contraseña que no tenemos: NUNCA es un
   * fallo nuestro de lectura, es que el documento la lleva de verdad (medido:
   * `pdf-parse` la exige incluso para un PDF cuya contraseña de USUARIO está
   * vacía). Dictado de Alberto (19/09/2026): en vez de pedirle a la persona
   * que «quite la protección» —algo que la mayoría no sabe hacer, y que para
   * un PDF de un seguro suele ser su propio DNI/NIF— se le ofrece escribir la
   * contraseña y reintentar (`POST /api/polizas/[id]/reintentar`).
   *
   * `'contrasena_incorrecta'` = SÍ se dio una contraseña y el documento la
   * rechazó. Distinto de `'protegido'` a propósito: la acción que sigue no es
   * «escribe una contraseña», es «prueba OTRA» — colapsar los dos deja a la
   * persona reintentando con la misma contraseña que ya falló.
   */
  motivo?: 'protegido' | 'contrasena_incorrecta'
}

// 🚗 `marca` y `modelo` se piden AQUÍ, en la 1ª pasada, además de estar en el
// catálogo del ramo que pide la 2ª. No es duplicar por duplicar:
//
//   · La 1ª pasada es la que FUNCIONA. La 2ª depende de una segunda llamada que
//     el 07/09/2026 volvió VACÍA en producción con toda la cadena de suplentes
//     apagada, y con ella se perdieron marca, modelo y uso de una póliza que sí
//     los traía. Alberto, sobre esa póliza: «falta la marca, el modelo y la
//     versión del vehículo; hay que buscar todo lo posible».
//   · Son identidad del BIEN, como la matrícula y el bastidor, que ya se piden
//     aquí. Van con sus hermanos.
//   · No hay riesgo de dos verdades: `parsearPolizaExtraida` ya pasa la
//     respuesta de la 1ª pasada por `normalizarDatosRamoLeidos`, y si la 2ª
//     responde, sus valores REEMPLAZAN a estos (`leerDatosRamo` sustituye datos
//     y orígenes juntos). O sea, esto es un suelo, no una competencia.
//
// ⚠️ Y el suelo importa porque el documento NO se guarda: `portal_poliza_declarada`
// conserva el NOMBRE del fichero, no el PDF. Lo que no se lea en la subida no se
// puede volver a leer — hay que pedirle a la persona que lo suba otra vez.
const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"tipoDocumento":"poliza"|"suplemento"|"recibo"|"otro"|null,"compania":string|null,"numeroPoliza":string|null,"ramo":string|null,"primaAnual":number|null,"fechaVencimiento":"YYYY-MM-DD"|null,"fechaEfecto":"YYYY-MM-DD"|null,"matricula":string|null,"marca":string|null,"modelo":string|null,"bastidor":string|null,"fechaMatriculacion":"YYYY-MM-DD"|null,"referenciaCatastral":string|null}
Reglas:
- "ramo" debe ser uno de: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, otros.
- "fechaEfecto": la fecha de EFECTO, ENTRADA EN VIGOR o EMISIÓN de esta póliza o de su periodo actual — el día en que empezó a correr, NO la de vencimiento. Ponla SIEMPRE que aparezca en el documento, aunque también haya "fechaVencimiento": los contratos de seguro son anuales renovables y esta fecha sirve para calcular el vencimiento cuando el documento no traiga uno vigente.
- "tipoDocumento": qué es este documento. "poliza" = el contrato o sus condiciones particulares. "suplemento" = una MODIFICACIÓN de una póliza que ya existe (cambio de vehículo, de coberturas, de tomador); suele decir "suplemento", "anexo" o "modificación". "recibo" = un justificante de cobro de un periodo. "otro" si no es ninguno de los tres. Si no lo puedes decidir, pon null: NUNCA fuerces "poliza".
- "primaAnual" en euros, solo el número, con punto decimal. Es lo que se paga AL AÑO por la póliza. Si el documento es un suplemento o un recibo, pon aquí su importe igualmente: nosotros ya sabemos qué hacer con él.
- "matricula": la matrícula española del vehículo asegurado, tal cual aparece.
- "marca": la MARCA del vehículo (Seat, Renault, Kia, Citroën…), sola, sin el modelo.
- "modelo": el modelo y la versión juntos, tal cual vengan ("León 1.5 TSI", "C4 Grand Picasso 1.6 HDi"). Si solo aparece el modelo sin versión, pon el modelo.
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
    tipoDocumento: null,
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
function nadaLeido(motivo?: 'protegido' | 'contrasena_incorrecta'): ResultadoExtraccion {
  // `no_aplica` y no `no_leidos`: sin ramo no había 2ª pasada que hacer, así que
  // decir que «no se pudieron leer» los campos del ramo sería inventarse un
  // intento que nunca ocurrió.
  return { datos: extraidaVacia(), fuente: 'none', camposRamo: 'no_aplica', ...(motivo ? { motivo } : {}) }
}

/** `pdf-parse` (pdf.js) lanza esto cuando el PDF exige una contraseña que no le
 *  hemos dado — incluso cuando la contraseña de usuario está vacía, si el
 *  documento la exige de verdad pdf.js no la da por buena sola. */
function esPasswordException(e: unknown): boolean {
  return e instanceof Error && e.name === 'PasswordException'
}

/**
 * `pdf-parse` NUNCA acepta una contraseña: llama a `PDFJS.getDocument(dataBuffer)`
 * pasando solo el Buffer, así que cualquier `{password}` en sus opciones públicas
 * se ignora en silencio (medido el 19/09/2026 contra un PDF real: `No password
 * given` aunque se le pasara la contraseña correcta). Por eso, cuando `pdf-parse`
 * falla por contraseña, el reintento pasa por `pdfjs-dist` DIRECTO — la única vía
 * que de verdad la usa — y solo si la persona nos ha dado una.
 *
 * Devuelve el texto si la contraseña abre el documento; si no, el motivo exacto
 * (`code` de `PasswordException`: 1 = hace falta contraseña, 2 = la que se dio
 * no vale), para que la pantalla no confunda «no sabemos la contraseña» con
 * «la que has escrito está mal».
 */
async function leerPdfConContrasena(
  buffer: Buffer,
  password: string | undefined,
): Promise<{ ok: true; texto: string } | { ok: false; motivo: 'protegido' | 'contrasena_incorrecta' }> {
  if (!password) return { ok: false, motivo: 'protegido' }
  try {
    // Import dinámico: `pdfjs-dist` solo publica ESM, y este fichero es CJS
    // (como `pdf-parse`, importado con `require` más abajo). Mismo patrón que
    // `apps/rrhh/lib/distribuir-nominas.ts`: sin worker (no hay hilos en
    // serverless) y sin eval (lo bloquea el sandbox de Vercel).
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise
    let texto = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i)
      const contenido = await pagina.getTextContent()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto += contenido.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n'
    }
    return { ok: true, texto }
  } catch (e) {
    // `code === 2` (INCORRECT_PASSWORD) es la única distinción que importa: el
    // resto de fallos de este intento (PDF corrupto, etc.) se tratan igual que
    // «no hemos podido leerlo», no como un problema de contraseña.
    const codigo = e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : null
    return { ok: false, motivo: codigo === 2 ? 'contrasena_incorrecta' : 'protegido' }
  }
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
): Promise<{ datos: PolizaExtraida; estado: EstadoCamposRamo }> {
  const instruccion = instruccionRamo(datos.ramo)
  if (instruccion === null) return { datos, estado: 'no_aplica' }

  let salida: string
  try {
    salida = await pedir(instruccion)
  } catch (e) {
    // «No lo hemos podido mirar», no «no hay datos»: el contrato ya leído se
    // conserva, los campos del ramo se completan a mano — y ahora, además, se
    // DICE. Antes este `return` era indistinguible de una póliza sin esos datos.
    console.warn('[portal] 2ª pasada (campos del ramo) falló:', e)
    return { datos, estado: 'no_leidos' }
  }

  try {
    const datosRamo = normalizarDatosRamoLeidos(datos.ramo, JSON.parse(cleanJSON(salida)))
    if (datosRamo === null) {
      // El JSON parseó pero ningún campo sobrevivió a `normalizarDatosRamoLeidos`
      // (claves que el catálogo no reconoce, o valores fuera de rango). Es el
      // mismo «no lo hemos podido leer» que un JSON roto, y sin este log es
      // indistinguible de él — se pierde justo el dato que diría SI la IA leyó
      // algo y lo perdimos al validar, o si no leyó nada.
      console.warn('[portal] 2ª pasada (campos del ramo): JSON válido sin campos reconocidos:', salida.slice(0, 500))
      return { datos, estado: 'no_leidos' }
    }
    // Datos y orígenes se reemplazan JUNTOS: los de la 1ª pasada hablaban de los
    // valores de la 1ª pasada, y aquí acaban de cambiar.
    return {
      datos: { ...datos, datosRamo, datosRamoOrigen: origenesDelDocumento(datosRamo) },
      estado: 'leidos',
    }
  } catch (e) {
    // El JSON no parsea: se preguntó y no se sacó nada en claro. Es un «no lo
    // hemos podido leer», no un «no lo trae». Se registra la salida CRUDA
    // (acotada) porque sin ella este fallo es mudo: no hay forma de saber si la
    // IA devolvió texto envuelto, un JSON truncado, u otra cosa.
    console.warn('[portal] 2ª pasada (campos del ramo): la salida no parsea como JSON:', e, salida.slice(0, 500))
    return { datos, estado: 'no_leidos' }
  }
}

export async function extraerPoliza(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
  password?: string,
): Promise<ResultadoExtraccion> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    let motivoSinTexto: 'protegido' | 'contrasena_incorrecta' | undefined
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch (e) {
      if (esPasswordException(e)) {
        const resultado = await leerPdfConContrasena(buffer, password)
        if (resultado.ok) texto = resultado.texto
        else motivoSinTexto = resultado.motivo
      }
      console.warn('[portal] pdf-parse falló:', e)
    }
    if (!texto.trim()) return nadaLeido(motivoSinTexto)
    // Un fallo de IA es «no lo hemos podido mirar», no «no hay datos»: se degrada
    // a `none` y la póliza se guarda igual, para completarla a mano.
    let salida: string
    try {
      salida = await aiComplete(texto.slice(0, 20_000), { system: INSTRUCCION, maxTokens: 600 })
    } catch (e) {
      console.warn('[portal] aiComplete falló:', e)
      return nadaLeido()
    }
    // 🚨 El mismo presupuesto que la 1ª pasada (600), no 400. La 2ª pide MÁS
    // campos que la 1ª y su instrucción es más larga —lleva la etiqueta y la
    // ayuda de cada campo del catálogo—, así que quedarse corto la trunca; y una
    // respuesta truncada de OpenRouter no llega a medias: llega VACÍA
    // (`OpenRouter: respuesta vacía`, `openrouter.ts:134`), que es lo que se vio
    // el 07/09/2026 con toda la cadena de suplentes apagada. No es la causa
    // demostrada —solo hay una medición— pero es la única variable barata.
    const { datos, estado } = await leerDatosRamo(parsear(salida), (instruccion) =>
      aiComplete(texto.slice(0, 20_000), { system: instruccion, maxTokens: 600 }),
    )
    return { datos, fuente: 'texto', camposRamo: estado }
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
    const { datos, estado } = await leerDatosRamo(parsear(salida), (instruccion) =>
      openrouterVision(
        { apiKey },
        instruccion,
        [{ data: buffer.toString('base64'), mediaType: mimeType }],
        'Extrae los datos de esta póliza.',
      ),
    )
    return { datos, fuente: 'vision', camposRamo: estado }
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
  const tipoDocumento = normalizarTipoDocumento(
    bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>).tipoDocumento : null,
  )
  // Normalmente `null`: los campos del ramo los trae la 2ª pasada. Se mira
  // aquí igualmente porque un modelo puede devolverlos ya en la primera, y
  // tirarlos obligaría a preguntar otra vez por algo que ya está dicho.
  const datosRamo = normalizarDatosRamoLeidos(contrato.ramo, bruto)
  const o = bruto && typeof bruto === 'object' ? (bruto as Record<string, unknown>) : {}
  // 🚨 Un seguro es anual renovable: si el documento no trae un vencimiento
  // VIGENTE (el original de una póliza plurianual, por ejemplo, solo trae el
  // de su primer periodo) pero sí una fecha de EFECTO o emisión, el día y mes
  // de esa fecha SON los del próximo vencimiento — dictado de Alberto,
  // 19/09/2026. Solo se calcula cuando `fechaVencimiento` es `null`: si el
  // documento lo dice, ese manda siempre.
  const fechaVencimiento = contrato.fechaVencimiento ?? vencimientoDesdeEfecto(o.fechaEfecto, hoy)
  return {
    ...contrato,
    fechaVencimiento,
    // 🚨 La prima se ANULA cuando consta que el documento no es la póliza. El
    // importe de un suplemento o de un recibo es real, pero no es lo que se
    // paga al año, y guardarlo ahí no falla: sale un número plausible sobre el
    // que se decide si un seguro está caro. `null` es «no lo sabemos», que la
    // pantalla pinta «—» y la persona corrige; el error contrario no se corrige
    // porque nadie se entera. Con `otro` o sin respuesta NO se toca.
    primaAnual: importeEsPrimaAnual(tipoDocumento) ? contrato.primaAnual : null,
    tipoDocumento,
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
