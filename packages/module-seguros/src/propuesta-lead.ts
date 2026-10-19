// F4 de la correduría (19/10/2026, spec docs/superpowers/specs/2026-10-19-correduria-lead-a-propuesta-automatica-design.md
// §F4 y §3.4): de los precios de un lead a la PROPUESTA que Alberto aprueba con un botón. PURO: ni red, ni BD, ni env.
//
// Tres piezas, las tres con test al lado:
//   1. NECESIDADES IDD (art. 175.1 RDL 3/2020) a partir de lo que el CLIENTE ha contestado en su hilo. Las preguntas son
//      las de `preguntasNecesidades(ramo)` (necesidades-idd.ts); sus respuestas se leen del correo igual que el contrato
//      de datos, con la clave `idd_<id>` (`camposIdd`, que `respuesta-lead.ts` añade a lo que la IA puede leer).
//      🚨 Lo que no ha contestado NO se inventa: falta una → `completas: false` → no hay botón Enviar y se le repregunta.
//      Por eso NO se usa `deducirNecesidades()`: aquella rellena lo que no sabe con el valor «neutro» («le es
//      indiferente», «un equilibrio»), que es justo inventar la respuesta del cliente. Aquí solo se deduce lo que su
//      propio dato del contrato dice SIN ambigüedad (régimen y uso de la vivienda, continente + contenido), y se marca.
//   2. ENCAJE y RECOMENDACIÓN: cada precio contra esas necesidades, con las coberturas del CATÁLOGO (`clasificarCoberturas`,
//      por clave). Una cobertura que no consta no cuenta como incluida (tres estados): no encaja. La recomendada es la
//      mejor de las que encajan según la prioridad que DIJO el cliente; nada de IA decidiendo precios ni coberturas.
//   3. INFORMACIÓN PREVIA del mediador (art. 173 RDL 3/2020) que va SIEMPRE en el correo de la propuesta, desde `MEDIADOR`.

import { preguntasNecesidades, textoNecesidades, validarRespuestasNecesidades, type PreguntaNecesidad } from './necesidades-idd.ts'
import { CATALOGO_GARANTIAS, ramoDeCatalogo, type EstadoGarantia } from './catalogo-garantias.ts'
import { MEDIADOR, PUNTOS_PRECONTRACTUALES, NO_EXCLUSIVIDAD } from './mediador.ts'
import type { CampoContrato } from './contrato-datos.ts'

// ─── 1. Necesidades IDD leídas del hilo ───────────────────────────────────────────────────────────────────────────

export const PREFIJO_IDD = 'idd_'
export const claveIdd = (id: string): string => `${PREFIJO_IDD}${id}`
export const esClaveIdd = (clave: string): boolean => clave.startsWith(PREFIJO_IDD) && clave.length > PREFIJO_IDD.length

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Palabras que la CITA del correo tiene que contener para que una respuesta a esa pregunta exista: un «sí» suelto no
 * dice a qué. Sin una de estas en la cita, la respuesta no se da por leída (no es «no», es «no se sabe»).
 */
const TEMA_IDD: Readonly<Record<string, RegExp>> = {
  prioridad: /precio|barat|economic|cobertur|equilibr|calidad|complet/,
  franquicia: /franquicia/,
  uso: /particular|profesional|trabajo|empresa|personal|privado/,
  conductores: /conduc|hij[oa]|joven|solo yo|unico|ocasional|carne/,
  modalidad: /tercero|todo riesgo|ampliad|basic/,
  lunas: /luna|cristal/,
  asistencia: /asistencia|grua|km/,
  sustitucion: /sustituci|cortesia|reemplazo/,
  regimen: /propietari|inquilin|alquil|dueñ|duen|mia|mio|en propiedad/,
  vivienda: /habitual|segunda|alquil|vivo|veraneo/,
  que_asegura: /continente|contenido|ambos|muebles|edificio|construccion|todo/,
  hipoteca: /hipotec|banco|prestamo/,
  objetos_valor: /joya|valor|reloj|arte|cuadro/,
}

/** La pregunta IDD de una clave `idd_<id>` (de cualquier ramo). `null` = no es una clave IDD conocida. PURA. */
export function preguntaIdd(clave: string): PreguntaNecesidad | null {
  if (!esClaveIdd(clave)) return null
  const id = clave.slice(PREFIJO_IDD.length)
  for (const ramo of ['auto', 'hogar', 'otros']) {
    const p = preguntasNecesidades(ramo).find((x) => x.id === id)
    if (p) return p
  }
  return null
}

/**
 * Los campos IDD que la lectura de la respuesta (F2) puede extraer, con la misma forma que el contrato. Son OPCIONALES y
 * no se piden de entrada: no cambian la petición de datos (F1) ni el «datos completos» (F3); solo dejan que una respuesta
 * del cliente sobre lo que quiere quede guardada. PURA.
 */
export function camposIdd(ramo: string | null | undefined): CampoContrato[] {
  return preguntasNecesidades(ramo).map((p) => ({
    clave: claveIdd(p.id), etiqueta: p.etiqueta.toLowerCase(), pregunta: p.texto, origen: 'cliente', obligatorio: 'opcional',
  }))
}

/** Lo que la IA tiene que devolver para una clave IDD: una de estas palabras. Para el prompt. PURA. */
export function opcionesIdd(clave: string): string[] {
  return preguntaIdd(clave)?.opciones.map((o) => o.valor) ?? []
}

/**
 * Valor leído → la opción de la pregunta (por su `valor` o por su texto). Sí/no en booleano vale para las de sí/no.
 * Lo que no es una opción = `null` («no se sabe»: ni válido ni inválido; se volverá a preguntar). PURA.
 */
export function opcionIdd(clave: string, valor: unknown): string | null {
  const p = preguntaIdd(clave)
  if (!p) return null
  const valores = p.opciones.map((o) => o.valor)
  if (typeof valor === 'boolean') {
    const v = valor ? 'si' : 'no'
    return valores.includes(v) ? v : null
  }
  if (typeof valor !== 'string') return null
  const s = norm(valor).replace(/^sí$/, 'si')
  const porValor = p.opciones.find((o) => o.valor === s || norm(o.valor.replace(/_/g, ' ')) === s)
  if (porValor) return porValor.valor
  const porTexto = p.opciones.find((o) => norm(o.texto) === s)
  return porTexto?.valor ?? null
}

/** ¿La cita del correo habla de ESA pregunta? PURA. */
export function citaHablaDeIdd(clave: string, cita: string): boolean {
  const p = preguntaIdd(clave)
  if (!p) return false
  const tema = TEMA_IDD[p.id]
  return !!tema && tema.test(norm(cita))
}

export type FuenteNecesidad = 'respuesta' | 'deducida'
export type NecesidadLeida = { id: string; etiqueta: string; valor: string; texto: string; fuente: FuenteNecesidad; de: string | null }
export type NecesidadFalta = { id: string; etiqueta: string; pregunta: string; opciones: string[] }
export type NecesidadesLead = {
  completas: boolean
  total: number
  respondidas: NecesidadLeida[]
  faltan: NecesidadFalta[]
  /** Solo lo respondido o deducido, listo para `textoNecesidades` (vacío si no hay nada). */
  respuestas: Record<string, string>
}

const numPositivo = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? norm(v) : null)

/**
 * Solo lo que un dato del contrato dice SIN ambigüedad. Cada deducción dice de qué dato sale. PURA.
 *   · régimen ← «propietario o inquilino» (`uso`) que nombra solo una de las dos, o «propietario = tomador» = sí;
 *   · vivienda ← «uso de la vivienda» (`ocupacion`) que nombra solo una opción;
 *   · qué asegura ← capital de continente Y de contenido dados (los dos > 0) = «continente y contenido».
 * Un capital solo NO dice «solo continente»: puede que el otro aún no lo haya dado.
 */
function deduccionesHogar(valores: Readonly<Record<string, unknown>>): Record<string, { valor: string; de: string }> {
  const out: Record<string, { valor: string; de: string }> = {}
  const uso = texto(valores.uso)
  if (uso) {
    const prop = /propietari|en propiedad|es mia|es mio|dueñ|duen/.test(uso)
    const inq = /inquilin|de alquiler|alquilad[oa] por mi|vivo de alquiler/.test(uso)
    if (prop !== inq) out.regimen = { valor: prop ? 'propietario' : 'inquilino', de: 'propietario o inquilino' }
  }
  if (!out.regimen && valores.propietarioEsTomador === true) out.regimen = { valor: 'propietario', de: 'propietario = tomador' }
  const ocu = texto(valores.ocupacion)
  if (ocu) {
    const hits = [
      /habitual/.test(ocu) ? 'habitual' : null,
      /segunda|veraneo/.test(ocu) ? 'segunda' : null,
      /alquilad[oa] a otros|la alquilo|se la alquilo|alquilada a terceros/.test(ocu) ? 'alquilada' : null,
    ].filter((x): x is string => x !== null)
    if (hits.length === 1) out.vivienda = { valor: hits[0], de: 'uso de la vivienda' }
  }
  if (numPositivo(valores.capitalContinente) && numPositivo(valores.capitalContenido)) {
    out.que_asegura = { valor: 'ambos', de: 'capitales de continente y contenido' }
  }
  return out
}

/**
 * Las necesidades del lead a partir de los valores guardados de su hilo (`info_riesgo.datosContrato.valores`, en claro).
 * Lo respondido manda sobre lo deducido. Lo que falta sale con su pregunta y sus opciones para la repregunta. PURA.
 */
export function deducirNecesidadesLead(ramo: string | null | undefined, valores: Readonly<Record<string, unknown>>): NecesidadesLead {
  const preguntas = preguntasNecesidades(ramo)
  const deducidas = (ramo ?? '').toLowerCase() === 'hogar' ? deduccionesHogar(valores) : {}
  const respondidas: NecesidadLeida[] = []
  const faltan: NecesidadFalta[] = []
  const respuestas: Record<string, string> = {}
  for (const p of preguntas) {
    const dicho = opcionIdd(claveIdd(p.id), valores[claveIdd(p.id)])
    const ded = deducidas[p.id]
    const valor = dicho ?? ded?.valor ?? null
    const opcion = valor ? p.opciones.find((o) => o.valor === valor) : undefined
    if (!valor || !opcion) {
      faltan.push({ id: p.id, etiqueta: p.etiqueta, pregunta: p.texto, opciones: p.opciones.map((o) => o.texto) })
      continue
    }
    respuestas[p.id] = valor
    respondidas.push({ id: p.id, etiqueta: p.etiqueta, valor, texto: opcion.texto, fuente: dicho ? 'respuesta' : 'deducida', de: dicho ? null : ded!.de })
  }
  const completas = faltan.length === 0 && validarRespuestasNecesidades(ramo, respuestas).ok
  return { completas, total: preguntas.length, respondidas, faltan, respuestas }
}

/**
 * La declaración que se guarda en el presupuesto y que el cliente firma. Solo con las necesidades COMPLETAS (si no,
 * `null`: no hay declaración que firmar). Dice de dónde sale, para que nadie la lea como algo que no dijo. PURA.
 */
export function declaracionNecesidadesLead(ramo: string | null | undefined, n: NecesidadesLead): string | null {
  if (!n.completas) return null
  const deducidas = n.respondidas.filter((r) => r.fuente === 'deducida')
  const otras = deducidas.length
    ? `Según lo que nos contó por correo; ${deducidas.map((d) => `${d.etiqueta.toLowerCase()} deducido de su dato «${d.de}»`).join('; ')}.`
    : 'Según lo que nos contó por correo.'
  return textoNecesidades(ramo, n.respuestas, otras)
}

// ─── 2. Encaje y recomendación ────────────────────────────────────────────────────────────────────────────────────

export type OrigenPrecio = 'rpa' | 'avant2'

/** Un precio de la comparativa, tal como sale de la BD (sin datos personales). */
export type OpcionComparada = {
  /** Identidad ESTABLE del precio: el id de la oferta (RPA) o `cds:<id del precio>` (Avant2). */
  clave: string
  origen: OrigenPrecio
  compania: string
  producto: string | null
  primaEur: number
  /** `null` = no consta (≠ 0 «sin franquicia»). */
  franquiciaEur: number | null
  firmeza: string
  /** Garantías del catálogo por clave. `null` = no se pudieron leer (todo «no consta»). */
  garantias: Readonly<Record<string, EstadoGarantia>> | null
  /** Motivo del bloqueo que la compañía YA anuncia (`bloqueoCompania`); `''` sin motivo; `null` = no hay. */
  bloqueo: string | null
  caducada: boolean
}

export type Encaje = { encaja: boolean; falla: string[] }

const est = (o: OpcionComparada, clave: string): EstadoGarantia => o.garantias?.[clave] ?? 'no_consta'
const etiquetaGarantia = (ramo: string | null | undefined, clave: string): string => {
  const r = ramoDeCatalogo(ramo)
  return (r ? CATALOGO_GARANTIAS[r].find((g) => g.clave === clave)?.etiqueta : null) ?? clave
}
function exige(o: OpcionComparada, ramo: string | null | undefined, clave: string, falla: string[]): void {
  const e = est(o, clave)
  if (e === 'si') return
  falla.push(e === 'no' ? `no incluye ${etiquetaGarantia(ramo, clave).toLowerCase()}` : `no consta ${etiquetaGarantia(ramo, clave).toLowerCase()}`)
}

/**
 * ¿Este precio es coherente con lo que el cliente necesita (art. 175 RDL 3/2020)? Solo con respuestas COMPLETAS tiene
 * sentido; con alguna sin responder no se decide nada (`encaja: false`). Lo que no consta no cumple. PURA.
 */
export function encajeOpcion(ramo: string | null | undefined, o: OpcionComparada, n: Pick<NecesidadesLead, 'completas' | 'respuestas'>): Encaje {
  if (!n.completas) return { encaja: false, falla: ['faltan necesidades del cliente'] }
  const r = n.respuestas
  const falla: string[] = []
  if (o.bloqueo !== null) falla.push(`la compañía la dejará bloqueada${o.bloqueo ? ` (${o.bloqueo})` : ''}`)
  if (o.caducada) falla.push('la oferta ha caducado')
  const ramoN = (ramo ?? '').toLowerCase()
  const motor = ramoN === 'auto' || ramoN === 'moto'
  const todoRiesgo = est(o, 'danos_propios') === 'si'
  if (motor) {
    switch (r.modalidad) {
      case 'todo_riesgo':
        exige(o, ramo, 'danos_propios', falla)
        if (o.franquiciaEur === null) falla.push('no consta la franquicia')
        else if (o.franquiciaEur > 0) falla.push('lleva franquicia')
        break
      case 'todo_riesgo_franquicia':
        exige(o, ramo, 'danos_propios', falla)
        break
      case 'terceros_ampliado':
        if (!['robo', 'incendio', 'lunas'].some((k) => est(o, k) === 'si')) falla.push('no consta ni robo, ni incendio, ni lunas')
        break
    }
    if (r.lunas === 'si') exige(o, ramo, 'lunas', falla)
    if (r.asistencia === 'si') exige(o, ramo, 'asistencia_viaje', falla)
    if (r.sustitucion === 'si') exige(o, ramo, 'vehiculo_sustitucion', falla)
  } else if (ramoN === 'hogar') {
    if (r.que_asegura === 'ambos' || r.que_asegura === 'continente') exige(o, ramo, 'continente', falla)
    if (r.que_asegura === 'ambos' || r.que_asegura === 'contenido') exige(o, ramo, 'contenido', falla)
    if (r.objetos_valor === 'si') exige(o, ramo, 'joyas', falla)
  }
  // Sin franquicia: en motor solo importa si el precio la puede llevar (un terceros no tiene daños propios a los que aplicarla).
  if (r.franquicia === 'no' && (!motor || todoRiesgo)) {
    if (o.franquiciaEur === null) falla.push('no consta la franquicia')
    else if (o.franquiciaEur > 0) falla.push('lleva franquicia')
  }
  return { encaja: falla.length === 0, falla: [...new Set(falla)] }
}

/** Coberturas del catálogo que el precio INCLUYE (afirmadas), en el orden del catálogo. PURA. */
export function coberturasIncluidas(ramo: string | null | undefined, o: Pick<OpcionComparada, 'garantias'>): string[] {
  const r = ramoDeCatalogo(ramo)
  if (!r || !o.garantias) return []
  return CATALOGO_GARANTIAS[r].filter((g) => o.garantias![g.clave] === 'si').map((g) => g.etiqueta)
}

export type Recomendacion = { clave: string; justificacion: string } | null

const TEXTO_PRIORIDAD: Readonly<Record<string, string>> = {
  precio: 'le importa sobre todo el precio',
  coberturas: 'le importan sobre todo las coberturas',
  equilibrio: 'busca un equilibrio entre precio y coberturas',
}

/**
 * La recomendada: entre los precios ENVIABLES que encajan, según la prioridad que dijo el cliente:
 *   precio → el más barato · coberturas → el que más coberturas afirma (empate: el más barato) ·
 *   equilibrio → el más barato de los que afirman como mucho una cobertura menos que el más completo.
 * Sin necesidades completas o sin ninguno que encaje → `null` (no se recomienda nada). PURA.
 */
export function recomendarOpcion(
  ramo: string | null | undefined,
  opciones: readonly (OpcionComparada & { enviable: boolean })[],
  n: Pick<NecesidadesLead, 'completas' | 'respuestas' | 'respondidas'>,
): Recomendacion {
  if (!n.completas) return null
  const validas = opciones.filter((o) => o.enviable && encajeOpcion(ramo, o, n).encaja)
  if (!validas.length) return null
  const cuenta = (o: OpcionComparada) => coberturasIncluidas(ramo, o).length
  const barata = (xs: readonly OpcionComparada[]) => [...xs].sort((a, b) => a.primaEur - b.primaEur || a.clave.localeCompare(b.clave))[0]
  const prioridad = n.respuestas.prioridad ?? 'equilibrio'
  let elegida: OpcionComparada
  let porque: string
  if (prioridad === 'precio') {
    elegida = barata(validas)
    porque = validas.length > 1 ? `la más barata de las ${validas.length} que encajan` : 'la única que encaja'
  } else {
    const max = Math.max(...validas.map(cuenta))
    const umbral = prioridad === 'coberturas' ? max : max - 1
    const candidatas = validas.filter((o) => cuenta(o) >= umbral)
    elegida = barata(candidatas)
    porque = validas.length === 1
      ? 'la única que encaja'
      : prioridad === 'coberturas'
        ? `la más completa de las ${validas.length} que encajan (${cuenta(elegida)} coberturas afirmadas)`
        : `la más barata entre las más completas de las ${validas.length} que encajan`
  }
  const clave = (id: string) => n.respondidas.find((x) => x.id === id)
  const pide = ['modalidad', 'que_asegura', 'franquicia'].map(clave).filter((x): x is NecesidadLeida => !!x).map((x) => `${x.etiqueta.toLowerCase()}: ${x.texto}`)
  const justificacion = [
    `necesidad: ${TEXTO_PRIORIDAD[prioridad] ?? prioridad}`,
    ...(pide.length ? [pide.join(' · ')] : []),
    porque,
  ].join(' — ')
  return { clave: elegida.clave, justificacion }
}

// ─── Huella (¿han cambiado los precios o las necesidades?) ────────────────────────────────────────────────────────

/** FNV-1a de 32 bits en hex: estable entre ejecuciones y sin dependencias. No es criptográfico (no hace falta). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * La huella de una propuesta: los precios (clave + prima + franquicia + enviable + bloqueo) y las necesidades
 * respondidas. Cambia → el aviso de Telegram se ACTUALIZA (no se manda otro). Independiente del orden. PURA.
 */
export function huellaPropuesta(
  opciones: readonly Pick<OpcionComparada, 'clave' | 'primaEur' | 'franquiciaEur' | 'bloqueo' | 'caducada'>[],
  respuestas: Readonly<Record<string, string>>,
): string {
  const p = [...opciones].map((o) => `${o.clave}=${o.primaEur.toFixed(2)}/${o.franquiciaEur ?? 'x'}/${o.bloqueo ?? '-'}/${o.caducada ? 'c' : 'v'}`).sort()
  const n = Object.keys(respuestas).sort().map((k) => `${k}=${respuestas[k]}`)
  return fnv1a(`${p.join('|')}#${n.join('|')}`)
}

// ─── 3. Información previa del mediador (art. 173 RDL 3/2020) ─────────────────────────────────────────────────────

/** El bloque de información previa, desde `MEDIADOR` (nunca a mano). Va SIEMPRE en el correo de la propuesta. PURA. */
export function informacionPreviaMediador(): string {
  return [
    'Información previa sobre el mediador:',
    ...PUNTOS_PRECONTRACTUALES.map((p) => `- ${p.titulo}: ${p.cuerpo}`),
    `- Servicio de Atención al Cliente: ${MEDIADOR.identidad.email}.`,
  ].join('\n')
}

/** ¿El texto ya lleva la información previa ENTERA (registro DGSFP, independencia y remuneración)? PURA. */
export function llevaInformacionPrevia(t: string): boolean {
  return t.includes(MEDIADOR.identidad.claveDgsfp) && t.includes(NO_EXCLUSIVIDAD) && t.includes(MEDIADOR.remuneracion.resumen)
}

/** El texto con la información previa garantizada: si le falta algo, se le añade el bloque entero al final. PURA. */
export function conInformacionPrevia(t: string): string {
  const limpio = t.replace(/\r\n/g, '\n').trim()
  return llevaInformacionPrevia(limpio) ? limpio : `${limpio}\n\n${informacionPreviaMediador()}`
}
