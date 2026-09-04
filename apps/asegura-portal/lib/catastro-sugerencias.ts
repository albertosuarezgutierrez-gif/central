// El ÚLTIMO recurso antes de que la persona teclee su casa entera a mano.
//
// `POST /api/catastro` ya ha dicho `no_encontrado` con la dirección tal cual la
// escribió. Casi siempre eso no significa que su casa no esté en el Catastro:
// significa que está escrita de otra manera («C/» por «CALLE», el piso pegado
// al número, «Avda.», una vía con dos nombres). Aquí se prueban otras formas de
// escribirla y se devuelve **lo que el Catastro confirme**, para que elija ella.
//
// ─── El orden, que es lo que hace esto barato y seguro ──────────────────────
//  1. `variantesDireccion()` de `@central/module-seguros-portal`: DETERMINISTA,
//     gratis y testeable. No se inventa nada. La mayoría de los fallos se
//     arreglan aquí.
//  2. Solo si ninguna resuelve, UNA llamada a la IA pidiéndole reescrituras.
//  3. Cada propuesta de la IA se vuelve a consultar al Catastro. **Lo que el
//     Catastro no confirme NO sale de aquí.** Nunca se le enseña a nadie texto
//     suelto de un modelo como si fuera una dirección real.
//
// ─── 🚨 La regla que sostiene todo esto ─────────────────────────────────────
// **La IA propone, el Catastro confirma y la PERSONA decide.** Este fichero no
// elige nunca, ni siquiera cuando queda un solo candidato: devuelve la lista y
// la pantalla pide confirmación. Quedarse con «la que más se parece» mete los
// metros, el año y el código postal de OTRA vivienda en su póliza de hogar. Eso
// no da error, no se ve, y en un siniestro se paga como infraseguro. Es el
// mismo criterio que la fecha estimada desde la matrícula: se enseña, no se
// guarda.
//
// Por eso cada candidato viaja diciendo **de dónde salió** (`determinista` |
// `ia`): que una máquina haya sugerido ese texto es información que la persona
// merece tener delante antes de aceptarlo.
//
// ─── Lo que este fichero NO hace ────────────────────────────────────────────
//  - **No escribe en la BD.** Ni una fila, ni `prisma` importado.
//  - **No registra la dirección en ningún log.** Es dato personal. Se loguea el
//    MOTIVO, y del fallo de la IA solo el NOMBRE del error: el mensaje de un
//    proveedor puede devolver el prompt de vuelta, y el prompt es la dirección.
//  - **No manda a la IA nada que identifique a la persona.** Solo el texto de
//    la dirección con su municipio y su provincia —que son parte de la propia
//    dirección, no de quién vive en ella—. Ni nombre, ni email, ni identidad,
//    ni número de póliza. La IA no ve quién pregunta.
//  - **No reintenta la dirección original**: quien llama ya la ha probado, y
//    `variantesDireccion()` la excluye a propósito.
//
// ─── Por qué los estados están separados ────────────────────────────────────
// La regla de la casa: «dato que NO hay ≠ dato que NO se ha mirado». Si la IA
// no está configurada o revienta, eso NO es «no hemos encontrado nada»: es que
// no se ha podido mirar. Son cosas distintas y la pantalla tiene que poder
// decir cuál pasó — el mismo criterio que separa `503 canal_no_disponible` de
// `502 envio_fallido` en `app/api/acceso/solicitar/route.ts`.
//
//   candidatos           200  hay al menos uno que el Catastro confirma.
//   sin_candidatos       404  se probó todo y el Catastro no confirmó ninguno.
//   direccion_ilegible   422  ni una sola forma llegó a ser consultable.
//   catastro_no_responde 502  el servicio se cayó: no se pudo confirmar NADA.
//   ia_no_disponible     503  hacía falta la IA y no la hubo. NO es «no hay».

import { MAX_DIRECCION, MAX_VARIANTES, variantesDireccion } from '@central/module-seguros-portal'

import {
  consultarCatastroHogar,
  type ConsultaCatastro,
  type RespuestaCatastro,
} from './catastro.ts'

// ── Topes ───────────────────────────────────────────────────────────────────

/**
 * Cuántas propuestas de la IA se llegan a consultar. Tope DURO: cada una es una
 * petición a un servicio público que no es nuestro y que corta la conexión
 * cuando se le pide mucho seguido (medido el 04/09/2026).
 */
export const MAX_PROPUESTAS_IA = 3

/**
 * Con cuántos candidatos confirmados se para de buscar. No es un límite de
 * calidad: es que el objetivo es que la persona reconozca su casa en una lista
 * corta, y cada candidato de más son consultas de más al Catastro.
 */
export const MAX_CANDIDATOS = 3

/** Tope de tokens de la única llamada a la IA. Se le piden 3 líneas, no un ensayo. */
const MAX_TOKENS_IA = 300

// ── Lo que sale de aquí ─────────────────────────────────────────────────────

/** De dónde salió el texto de un candidato. Viaja SIEMPRE con él. */
export type OrigenCandidato = 'determinista' | 'ia'

/**
 * Una dirección que el Catastro HA CONFIRMADO. `resultado` es la respuesta
 * entera de `/api/catastro` para ese texto:
 *  - `ok`     → un inmueble, con su sugerencia y su contexto para reconocerlo.
 *  - `elegir` → la dirección existe y tiene varios pisos: sigue eligiendo ella.
 * Nunca es un estado de fallo: lo que no confirma el Catastro no llega a ser
 * candidato.
 */
export type CandidatoDireccion = {
  /** El texto EXACTO que se consultó. Es lo que la pantalla enseña. */
  direccion: string
  origen: OrigenCandidato
  resultado: Extract<RespuestaCatastro, { estado: 'ok' } | { estado: 'elegir' }>
}

export type ResultadoSugerencias =
  | {
      estado: 'candidatos'
      candidatos: CandidatoDireccion[]
      /** ¿Se llegó a gastar la llamada a la IA? La pantalla lo dice; no se esconde. */
      iaConsultada: boolean
      /** Consultas al Catastro gastadas. Para poder vigilar el gasto de verdad. */
      consultasCatastro: number
      /**
       * `true` = el Catastro dejó de responder ANTES de terminar de probar. Los
       * candidatos que hay son buenos, pero la lista NO está completa, y decir
       * lo contrario invita a la persona a descartar su propia casa.
       */
      busquedaIncompleta: boolean
    }
  | { estado: 'sin_candidatos'; iaConsultada: boolean; consultasCatastro: number }
  | { estado: 'direccion_ilegible'; iaConsultada: boolean; consultasCatastro: number }
  | { estado: 'catastro_no_responde'; iaConsultada: boolean; consultasCatastro: number }
  | { estado: 'ia_no_disponible'; consultasCatastro: number }

export type EstadoSugerencias = ResultadoSugerencias['estado']

/**
 * Código HTTP de cada estado. Vive junto a los estados para que añadir uno sin
 * código sea un error de tipos y no un 200 por descuido. La pantalla mira
 * `estado`, no el número.
 */
export const HTTP_POR_ESTADO_SUGERENCIA: Record<EstadoSugerencias, number> = {
  candidatos: 200,
  sin_candidatos: 404,
  direccion_ilegible: 422,
  catastro_no_responde: 502,
  ia_no_disponible: 503,
}

// ── El puerto: la red, inyectable ───────────────────────────────────────────

export type PuertoSugerencias = {
  /** Una consulta al Catastro por dirección. */
  consultarCatastro: (c: ConsultaCatastro) => Promise<RespuestaCatastro>
  /** ¿Hay algún proveedor de IA enchufado? `false` ⇒ ni se intenta. */
  iaConfigurada: () => boolean
  /** El texto CRUDO del modelo. Lanza si falla: quien llama lo degrada. */
  pedirAIa: (instruccion: string, prompt: string) => Promise<string>
}

/**
 * ¿Hay IA? Se mira ANTES de gastar la llamada porque «no está configurada» y
 * «ha fallado» acaban en el mismo estado para el usuario (`ia_no_disponible`),
 * pero solo una de las dos merece pagar un timeout. Los nombres de las envs son
 * los de la cadena de `@central/core-ai`; aquí solo se comprueba que existan
 * —nunca se leen valores ni se cae a un literal—.
 */
export function iaConfiguradaPorEnv(): boolean {
  return Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.CEREBRAS_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      (process.env.NVIDIA_TEXTO === '1' && process.env.NVIDIA_API_KEY && process.env.NVIDIA_BRAIN_MODEL) ||
      (process.env.GEMINI_TEXTO === '1' && process.env.GEMINI_API_KEY),
  )
}

/**
 * ⚠️ `@central/core-ai` entra por un `import()` DINÁMICO, y no es un capricho:
 * su `src/index.ts` reexporta con rutas SIN extensión, así que el resolvedor
 * ESM de Node se cae con `ERR_MODULE_NOT_FOUND` al cargar el fichero — medido
 * ya en `lib/extraer-poliza.test.ts`. Con el import arriba, este módulo entero
 * quedaría fuera del alcance de `node --test` y toda la lógica de esta pieza se
 * quedaría SIN cepos. Dentro de la función, el bundler de Next lo resuelve en
 * producción y los tests nunca llegan a ejecutarlo (inyectan su puerto).
 *
 * `temperature: 0`: no se quiere creatividad, se quiere la MISMA reescritura
 * para la misma dirección. `cleanJSON` es el limpiador canónico del núcleo y se
 * aplica aquí, en el borde; la lógica de abajo vuelve a defenderse igual.
 */
const PUERTO_REAL: PuertoSugerencias = {
  consultarCatastro: (c) => consultarCatastroHogar(c),
  iaConfigurada: iaConfiguradaPorEnv,
  pedirAIa: async (instruccion, prompt) => {
    const { aiComplete, cleanJSON } = await import('@central/core-ai')
    return cleanJSON(await aiComplete(prompt, { system: instruccion, maxTokens: MAX_TOKENS_IA, temperature: 0 }))
  },
}

// ── La instrucción para la IA ───────────────────────────────────────────────

/**
 * Lo que se le pide al modelo: reescrituras de la MISMA dirección para el
 * callejero oficial del Catastro. Nada más. El municipio y la provincia van
 * como contexto y se le prohíbe tocarlos: la consulta al Catastro los usa tal
 * cual, así que un modelo que «corrigiera» el pueblo buscaría en otro sitio.
 */
export function instruccionSugerencias(): string {
  return `Eres un normalizador de direcciones postales españolas para el callejero oficial del CATASTRO.
Te doy una dirección que el Catastro NO ha encontrado. Devuelve hasta ${MAX_PROPUESTAS_IA} formas ALTERNATIVAS de escribir ESA MISMA dirección.
Devuelve SOLO un objeto JSON, sin texto alrededor: {"variantes":["...","..."]}
Reglas:
- Es la MISMA vivienda. NUNCA propongas otra calle, otro número ni otro municipio.
- NUNCA inventes un número de portal: si la dirección no lo trae, la variante tampoco.
- Usa el tipo de vía completo y en singular como lo escribe el Catastro: CALLE, AVENIDA, PLAZA, PASEO, CARRETERA, TRAVESIA, URBANIZACION, CAMINO, RONDA, GLORIETA.
- Desarrolla abreviaturas y quita el "nº". Quita planta, puerta, escalera y bloque: el Catastro busca por vía y número.
- Corrige solo faltas evidentes del NOMBRE de la vía (acentos, letras cambiadas) y prueba su forma oficial si la vía es conocida por dos nombres.
- Sin explicaciones, sin comentarios, sin la dirección original repetida.`
}

/** El cuerpo del mensaje. Solo la dirección: la IA no sabe quién pregunta. */
export function promptSugerencias(e: EntradaSugerencias): string {
  return `Dirección: ${e.direccion}\nMunicipio: ${e.municipio}\nProvincia: ${e.provincia}`
}

// ── Normalización de lo que devuelve la IA ──────────────────────────────────

/**
 * Clave de comparación de dos direcciones. Réplica local a propósito: el módulo
 * puro usa la suya para deduplicar sus variantes pero no la exporta, y hacerla
 * pública es tocar `packages/`. Si divergiera, lo único que pasaría es que se
 * consultara dos veces la misma dirección — nunca que saliera un candidato malo.
 */
function claveDireccion(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * El JSON del modelo, o `null`. En producción el texto llega ya pasado por
 * `cleanJSON` (ver `PUERTO_REAL`); esto vuelve a intentarlo por su cuenta
 * —quitando las vallas de markdown y quedándose con el primer corchete y el
 * último— porque un modelo que envuelve su respuesta en prosa no es un fallo
 * raro. Lo que NO hace es adivinar: si no sale un JSON, son cero propuestas.
 */
function parsearJson(bruto: string): unknown {
  const intentar = (v: string): unknown => {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  const directo = intentar(bruto)
  if (directo !== null) return directo

  const sinVallas = bruto.replace(/```[a-z]*/gi, '').trim()
  const inicio = sinVallas.search(/[[{]/)
  const fin = Math.max(sinVallas.lastIndexOf(']'), sinVallas.lastIndexOf('}'))
  if (inicio === -1 || fin <= inicio) return null
  return intentar(sinVallas.slice(inicio, fin + 1))
}

/** Los números de portal que aparecen en un texto. */
function numerosDe(v: string): Set<string> {
  return new Set((v.match(/\d+/g) ?? []).map((n) => String(Number(n))))
}

/**
 * De la respuesta cruda del modelo a propuestas utilizables. Aquí es donde se
 * le pone el cepo a lo único que la IA puede romper de verdad:
 *
 * 🚨 **Una propuesta NO puede traer un número que la original no tenía.** Que
 * el modelo «arregle» el 40 en un 4 es el fallo caro: el 4 de esa calle existe,
 * el Catastro lo CONFIRMA, y la persona ve un candidato plausible que no es su
 * casa. Quitar el número está permitido (es una búsqueda más amplia); cambiarlo
 * o inventarlo, no.
 *
 * Se descarta además lo vacío, lo larguísimo, lo repetido y lo que sea la misma
 * dirección que ya se probó. Un JSON que no parsea devuelve `[]`, nunca a medias.
 */
export function propuestasDeIa(
  bruto: string,
  original: string,
  yaProbadas: ReadonlySet<string> = new Set(),
): string[] {
  const datos = parsearJson(bruto)
  if (datos === null) return []

  // El modelo puede devolver el array pelado o envuelto: las dos formas valen,
  // porque perder la lectura entera por cómo decidió anidar el JSON es tirar
  // una llamada de IA por una llave.
  const lista = Array.isArray(datos)
    ? datos
    : datos && typeof datos === 'object' && Array.isArray((datos as { variantes?: unknown }).variantes)
      ? ((datos as { variantes: unknown[] }).variantes)
      : []

  const numerosOriginal = numerosDe(original)
  const vistas = new Set<string>([claveDireccion(original), ...yaProbadas])
  const salida: string[] = []

  for (const cruda of lista) {
    if (salida.length >= MAX_PROPUESTAS_IA) break
    if (typeof cruda !== 'string') continue
    const v = cruda.replace(/\s+/g, ' ').trim()
    if (v === '' || v.length > MAX_DIRECCION) continue
    const k = claveDireccion(v)
    if (k === '' || vistas.has(k)) continue
    // El cepo del número inventado.
    let numeroAjeno = false
    for (const n of numerosDe(v)) if (!numerosOriginal.has(n)) numeroAjeno = true
    if (numeroAjeno) continue
    vistas.add(k)
    salida.push(v)
  }

  return salida
}

// ── La búsqueda ─────────────────────────────────────────────────────────────

export type EntradaSugerencias = {
  direccion: string
  municipio: string
  provincia: string
}

/** Solo `ok` y `elegir` cuentan como confirmación del Catastro. */
function confirma(r: RespuestaCatastro): r is CandidatoDireccion['resultado'] {
  return r.estado === 'ok' || r.estado === 'elegir'
}

export async function sugerirDirecciones(
  entrada: EntradaSugerencias,
  puerto: PuertoSugerencias = PUERTO_REAL,
): Promise<ResultadoSugerencias> {
  const lugar = { municipio: entrada.municipio, provincia: entrada.provincia }
  const candidatos: CandidatoDireccion[] = []
  const probadas = new Set<string>([claveDireccion(entrada.direccion)])
  let consultasCatastro = 0
  let iaConsultada = false
  let catastroCaido = false
  let intentos = 0
  let ilegibles = 0

  /** Prueba UNA dirección contra el Catastro. `false` = hay que parar del todo. */
  const probar = async (direccion: string, origen: OrigenCandidato): Promise<boolean> => {
    probadas.add(claveDireccion(direccion))
    consultasCatastro += 1
    intentos += 1
    const r = await puerto.consultarCatastro({ por: 'direccion', direccion, ...lugar })
    if (r.estado === 'catastro_no_responde') {
      // 🚨 El servicio caído NO es «esa vivienda no existe». Seguir probando
      // variantes contra un Catastro que ya no contesta solo acumula fallos que
      // luego se leerían como «ninguna existe»: se para en seco.
      catastroCaido = true
      return false
    }
    if (r.estado === 'direccion_ilegible') ilegibles += 1
    if (confirma(r)) candidatos.push({ direccion, origen, resultado: r })
    return candidatos.length < MAX_CANDIDATOS
  }

  // 1. Deterministas. Gratis, no se inventan nada, y arreglan la mayoría.
  for (const v of variantesDireccion(entrada.direccion).slice(0, MAX_VARIANTES)) {
    if (!(await probar(v, 'determinista'))) break
  }

  if (candidatos.length > 0 || catastroCaido) {
    return salida()
  }

  // 2. La IA, y SOLO aquí: cuando lo barato ya ha fallado del todo.
  if (!puerto.iaConfigurada()) return { estado: 'ia_no_disponible', consultasCatastro }

  iaConsultada = true
  let bruto: string
  try {
    bruto = await puerto.pedirAIa(instruccionSugerencias(), promptSugerencias(entrada))
  } catch (e) {
    // Solo el NOMBRE del error: el mensaje de un proveedor de IA puede traer de
    // vuelta el prompt, y el prompt es la dirección de alguien.
    console.warn('[catastro-sugerir] la IA no respondió:', e instanceof Error ? e.name : 'desconocido')
    return { estado: 'ia_no_disponible', consultasCatastro }
  }

  const propuestas = propuestasDeIa(bruto, entrada.direccion, probadas)
  // Un modelo que contesta pero no propone nada utilizable es una IA que SÍ
  // estuvo disponible: se sigue hasta `sin_candidatos`, que es la verdad.

  // 3. Cada propuesta, al Catastro. Lo que no confirme, no sale.
  for (const p of propuestas) {
    if (!(await probar(p, 'ia'))) break
  }

  return salida()

  function salida(): ResultadoSugerencias {
    if (candidatos.length > 0) {
      return {
        estado: 'candidatos',
        candidatos,
        iaConsultada,
        consultasCatastro,
        busquedaIncompleta: catastroCaido,
      }
    }
    if (catastroCaido) return { estado: 'catastro_no_responde', iaConsultada, consultasCatastro }
    // Todas las formas probadas resultaron impronunciables para el callejero:
    // eso no es «tu casa no existe», es «así escrito no se puede ni buscar».
    if (intentos > 0 && ilegibles === intentos) {
      return { estado: 'direccion_ilegible', iaConsultada, consultasCatastro }
    }
    return { estado: 'sin_candidatos', iaConsultada, consultasCatastro }
  }
}
