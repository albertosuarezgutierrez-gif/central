// Generali (portal del corredor) · Turismos — REGLAS PURAS (18/10/2026). Sin Playwright, sin red: `npm test`.
// Mapa de pantallas: services/tarificador-rpa/docs/generali-mapa-capturas.md. Reglas de Alberto (18/10/2026):
//   1. Matrícula con ASTERISCO entre cifras y letras («1234*BCD»), siempre, y el campo de VERIFICACIÓN igual.
//   2. Generali NO saca marca/modelo/versión por matrícula: los busca en sus desplegables con el vehículo que confirmó
//      Allianz o Mapfre en la misma oportunidad (lo inyecta asegura). Casado exacto normalizado → contención por palabra
//      entera → EXACTAMENTE un candidato; 0 o >1 = atasco con las opciones (nunca a ciegas). Por similitud = aviso.
//   3. Tomador, conductor y antecedentes como en las demás compañías; antecedentes sin dato = supuesto favorable DECLARADO.
// 🚨 Sin datos personales en mensajes: ni matrícula, ni nombres de mediador (solo cuentas y el código propio).

import {
  datosEquivalenciaDesdeEtiqueta,
  normalizarCombustible,
  supuestoConductorTomador,
  supuestoVersionAutomatica,
  type Combustible,
  type FormularioAuto,
} from '@central/module-tarificacion'
import { CONCEPTOS_LECTURA, regexPalabras, terminosDe, textosMayus, type Concepto } from '../../vocabulario.ts'

/**
 * Código del MEDIADOR que se elige en la cascada de «Seleccionar mediador» (Alberto, 18/10/2026). Es el código de la
 * correduría en Generali (no un dato de cliente). Se casa EXACTO por código; si no aparece, o aparece más de una vez, el bot
 * PARA (atasco): nunca se elige otro mediador. Única fuente: no repetir el literal en otro sitio.
 */
export const MEDIADOR_GENERALI = '65792'

// ───────────────────────── matrícula con asterisco ─────────────────────────

/** Letras de la matrícula actual (desde 2000): consonantes sin Ñ ni Q. */
const CONSONANTES = 'BCDFGHJKLMNPRSTVWXYZ'
const RE_ACTUAL = new RegExp(`^(\\d{4})([${CONSONANTES}]{3})$`)
/** Provincial (hasta 2000): código de provincia de 1-2 letras + 4 cifras + 0-2 letras. */
const RE_PROVINCIAL = /^([A-Z]{1,2})(\d{4})([A-Z]{0,2})$/
/**
 * Códigos provinciales de las matrículas antiguas (incluidos los históricos GE, LR, OU, PM, IB). Cerrado: un prefijo que no
 * está aquí NO es una matrícula provincial (p. ej. la «C» sola SÍ es A Coruña; «C» + 4 cifras + 3 consonantes es ciclomotor).
 */
export const PROVINCIAS_MATRICULA = Object.freeze([
  'A', 'AB', 'AL', 'AV', 'B', 'BA', 'BI', 'BU', 'C', 'CA', 'CC', 'CE', 'CO', 'CR', 'CS', 'CU', 'GC', 'GE', 'GI', 'GR', 'GU', 'H',
  'HU', 'IB', 'J', 'L', 'LE', 'LO', 'LR', 'LU', 'M', 'MA', 'ML', 'MU', 'NA', 'O', 'OR', 'OU', 'P', 'PM', 'PO', 'S', 'SA', 'SE', 'SG',
  'SO', 'SS', 'T', 'TE', 'TF', 'TO', 'V', 'VA', 'VI', 'Z', 'ZA',
])

export type MatriculaGenerali =
  /** `provincial` = formato antiguo: el asterisco en cada cambio cifra/letra es la regla de Alberto aplicada (sin captura que lo confirme). */
  | { ok: true; valor: string; formato: 'actual' | 'provincial' }
  | { ok: false; motivo: string }

/**
 * Matrícula del riesgo → como la teclea Generali: «1234BCD» → «1234*BCD» (regla de Alberto, 18/10/2026). PURA.
 * Decisión documentada para los formatos ANTIGUOS provinciales («SE1234AB», «M1234Z», «B1234»): la misma regla literal, un
 * asterisco en CADA cambio entre letras y cifras («SE*1234*AB», «M*1234*Z», «B*1234»), y `formato: 'provincial'` para que el
 * adaptador lo DECLARE (no hay captura de Generali con una provincial). Cualquier otra forma (ciclomotor C1234BCD, las de 6
 * cifras anteriores a 1971, diplomáticas, históricas, temporales, con vocales…) → error de DATOS: no se inventa.
 * El motivo nunca repite la matrícula.
 */
export function matriculaGenerali(m: string): MatriculaGenerali {
  const s = String(m ?? '').toUpperCase().replace(/[\s.\-*]/g, '')
  if (s === '') return { ok: false, motivo: 'generali: falta la matrícula' }
  const a = RE_ACTUAL.exec(s)
  if (a) return { ok: true, valor: `${a[1]}*${a[2]}`, formato: 'actual' }
  const p = RE_PROVINCIAL.exec(s)
  if (p && PROVINCIAS_MATRICULA.includes(p[1]!)) {
    return { ok: true, valor: [p[1], p[2], p[3]].filter((x) => x !== '').join('*'), formato: 'provincial' }
  }
  return { ok: false, motivo: 'generali: la matrícula no tiene un formato que Generali admita con asterisco (actual 1234*BCD o provincial antigua); revísala en el riesgo' }
}

/** Aviso (sin la matrícula) de una matrícula provincial escrita con la regla literal. */
export const AVISO_MATRICULA_PROVINCIAL = 'matrícula de formato provincial escrita con un asterisco en cada cambio cifra/letra (formato supuesto: sin captura de Generali que lo confirme)'

// ───────────────────────── mediador ─────────────────────────

export type OpcionLista = { valor: string; texto: string }
export type ResultadoMediador = { tipo: 'unica'; indice: number } | { tipo: 'ninguna' } | { tipo: 'varias'; n: number }

/**
 * La opción del desplegable «Mediador» que es la de `codigo`: valor EXACTO igual al código, o texto que EMPIEZA por el código
 * seguido de algo que no es una cifra («65792 - …»). Una sola → esa; 0 o varias → no se elige (atasco). PURA.
 */
export function opcionMediadorGenerali(opciones: readonly OpcionLista[], codigo: string = MEDIADOR_GENERALI): ResultadoMediador {
  const c = codigo.trim()
  if (!/^\d+$/.test(c)) return { tipo: 'ninguna' }
  const re = new RegExp(`^0*${c}(?!\\d)`)
  const ix = opciones.flatMap((o, i) => ((o.valor ?? '').trim() === c || re.test((o.texto ?? '').trim()) ? [i] : []))
  if (ix.length === 1) return { tipo: 'unica', indice: ix[0]! }
  return ix.length === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', n: ix.length }
}

/** ¿La URL del portal ya es la del mediador correcto (`CorredorPortal.po?mediatorCode=<codigo>`)? PURA. */
export function urlConMediador(url: string, codigo: string = MEDIADOR_GENERALI): boolean | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const m = u.searchParams.get('mediatorCode')
  return m === null ? null : m.trim() === codigo
}

// ─────────── «Seleccionar mediador» en un MARCO sin etiquetas (prueba real b41be722, 19/10/2026, v0.2.2) ───────────
// La cascada vive en un marco de Genernet (`seleccionAmbito.do`) con 5 campos SIN etiqueta: el desplegable del mediador se
// identifica por su OPCIÓN (la del código de la correduría), en todos los marcos de la página.

/** Un control de formulario leído de un marco (solo estructura y opciones; nunca el valor tecleado). */
export type ControlMediador = {
  /** `select`, `input:text`, `combobox`, `listbox`… */
  tipo: string
  name: string
  id: string
  /** Nativo `<select>`: se puede elegir con `selectOption`. Uno ARIA (combobox/listbox) solo se inventaría. */
  nativo: boolean
  /** Posición entre los `<select>` del marco (-1 si no es un select). */
  indiceSelect: number
  opciones: OpcionLista[]
  seleccionada: OpcionLista | null
}
export type MarcoMediador = { ruta: string; controles: ControlMediador[] }
export type DecisionMediador =
  | { tipo: 'unica'; marco: number; control: number; indice: number; nativo: boolean; puesto: boolean }
  | { tipo: 'ninguna' }
  | { tipo: 'varias'; n: number }

/**
 * ¿Qué control de qué marco es el «Mediador»? El ÚNICO (en todos los marcos) con EXACTAMENTE una opción del código de la
 * correduría (`opcionMediadorGenerali`). Un control con dos opciones que casan, o dos controles, = `varias` (no se elige).
 * `puesto` = esa opción ya está seleccionada. PURA.
 */
export function decidirMediadorGenerali(marcos: readonly MarcoMediador[], codigo: string = MEDIADOR_GENERALI): DecisionMediador {
  const hallados: { marco: number; control: number; indice: number; nativo: boolean; puesto: boolean }[] = []
  let ambiguos = 0
  marcos.forEach((m, mi) =>
    m.controles.forEach((c, ci) => {
      const r = opcionMediadorGenerali(c.opciones, codigo)
      if (r.tipo === 'varias') ambiguos += r.n
      if (r.tipo !== 'unica') return
      const puesto = c.seleccionada !== null && opcionMediadorGenerali([c.seleccionada], codigo).tipo === 'unica'
      hallados.push({ marco: mi, control: ci, indice: r.indice, nativo: c.nativo, puesto })
    }),
  )
  if (hallados.length === 1 && ambiguos === 0) return { tipo: 'unica', ...hallados[0]! }
  const n = hallados.length + ambiguos
  return n === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', n }
}

/**
 * Texto de una opción SIN datos personales (las del mediador llevan nombres): «08 - SUROESTE» → «08 - …»; un marcador
 * («Seleccionar...») tal cual; un código suelto tal cual; cualquier otro texto → «[texto]». PURA.
 */
export function opcionSinDatosGenerali(texto: string): string {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return '(vacía)'
  if (/^(selecciona|seleccione|elija|escoja|todos|todas|ninguno|-{2,})/i.test(t)) return t.slice(0, 30)
  const m = /^([A-Za-z0-9]{1,8})\s*[-–]\s*\S/.exec(t)
  if (m) return `${m[1]} - …`
  if (/^[A-Za-z0-9]{1,8}$/.test(t)) return t
  return '[texto]'
}

/** Ruta de una URL sin query ni fragmento (las del portal llevan `mediatorCode` y sesión). PURA. */
export function rutaSinQuery(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return '(url ilegible)'
  }
}

/**
 * Inventario de «Seleccionar mediador» para mapear (tipo, name/id, nº de opciones y sus textos SIN datos personales), marco a
 * marco. Solo marcos con controles. PURA.
 */
export function inventarioMediadorGenerali(marcos: readonly MarcoMediador[], max = 1500): string {
  const partes = marcos
    .filter((m) => m.controles.length > 0)
    .map((m) => {
      const cs = m.controles.map((c) => {
        const ops = c.opciones.length > 0 ? `: ${c.opciones.slice(0, 12).map((o) => opcionSinDatosGenerali(o.texto)).join(' | ')}${c.opciones.length > 12 ? ' | …' : ''}` : ''
        return `${c.tipo} name=${c.name.slice(0, 40) || '-'} id=${c.id.slice(0, 40) || '-'} (${c.opciones.length} opciones${ops})`
      })
      return `marco ${m.ruta}: ${cs.join(' ; ')}`
    })
  return (partes.length > 0 ? partes.join(' ‖ ') : 'ningún campo visible en ningún marco').slice(0, max)
}

// ───────────────────────── vehículo: casado de catálogo ─────────────────────────

/** Mayúsculas, sin tildes, sin signos (salvo el punto decimal entre cifras), espacios colapsados. PURA. */
export function normalizarCatalogo(t: string): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1§$2')
    .replace(/[^A-Z0-9§]+/g, ' ')
    .replace(/§/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

const palabras = (t: string): string[] => normalizarCatalogo(t).split(' ').filter((w) => w !== '')

/** ¿Las palabras de `aguja` aparecen SEGUIDAS y enteras en `pajar`? (frase por palabra entera). PURA. */
export function contieneFrase(pajar: string, aguja: string): boolean {
  const p = palabras(pajar)
  const a = palabras(aguja)
  if (a.length === 0 || a.length > p.length) return false
  for (let i = 0; i + a.length <= p.length; i++) if (a.every((w, j) => p[i + j] === w)) return true
  return false
}

export type EleccionCatalogo =
  | { tipo: 'unica'; indice: number; porSimilitud: boolean }
  | { tipo: 'ninguna' }
  | { tipo: 'varias'; indices: number[] }

/** Opciones que no son catálogo («Seleccione una», vacías, guiones). */
export function esOpcionVaciaCatalogo(texto: string): boolean {
  const t = normalizarCatalogo(texto)
  return t === '' || /^(SELECCIONE|SELECCIONAR|ELIJA|ESCOJA|TODAS|TODOS)\b/.test(t)
}

/**
 * Elige UNA opción del desplegable de Generali para el dato buscado (marca, modelo o versión), regla de Alberto (18/10/2026):
 *   1. casado EXACTO normalizado (mayúsculas, sin tildes ni signos) → si hay exactamente uno, ese (dato);
 *   2. si no, contención por PALABRA ENTERA en cualquiera de los dos sentidos (la opción contiene la frase buscada o la frase
 *      buscada contiene la opción) → si hay exactamente uno, ese, POR SIMILITUD (el adaptador lo declara);
 *   3. 0 o varios → no se elige (atasco con las opciones). Nunca la primera, nunca «la más parecida». PURA.
 * `modo: 'denominacion'` (vehículo de Mapfre, un solo texto con marca+modelo+versión): solo vale «la denominación contiene la
 * opción», y siempre es por similitud.
 */
export function elegirOpcionCatalogo(opciones: readonly string[], buscado: string, modo: 'dato' | 'denominacion' = 'dato'): EleccionCatalogo {
  const b = normalizarCatalogo(buscado)
  if (b === '') return { tipo: 'ninguna' }
  const validas = opciones.map((o, i) => ({ o, i })).filter((x) => !esOpcionVaciaCatalogo(x.o))
  if (modo === 'dato') {
    const exactas = validas.filter((x) => normalizarCatalogo(x.o) === b)
    if (exactas.length === 1) return { tipo: 'unica', indice: exactas[0]!.i, porSimilitud: false }
    if (exactas.length > 1) return { tipo: 'varias', indices: exactas.map((x) => x.i) }
  }
  const contenidas = validas.filter((x) => contieneFrase(buscado, x.o) || (modo === 'dato' && contieneFrase(x.o, buscado)))
  if (contenidas.length === 1) return { tipo: 'unica', indice: contenidas[0]!.i, porSimilitud: true }
  return contenidas.length === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', indices: contenidas.map((x) => x.i) }
}

/** Aviso de una elección por similitud (Alberto: «versión elegida por similitud (supuesto)»). */
export const AVISO_SIMILITUD_GENERALI = 'versión elegida por similitud (supuesto)'

/**
 * Lo que se busca en los desplegables de Generali. `separado`: marca/modelo/versión sueltos (de `seleccionVehiculo`; la versión
 * es su `descripcion`, puede faltar). `denominacion`: el texto único de Mapfre (`vehiculoConfirmado.denominacion`). Si vienen
 * los dos, manda el separado (más preciso). `null` = no hay vehículo confirmado (el trabajo no debía llegar aquí). PURA.
 */
export type VehiculoBuscado =
  | { tipo: 'separado'; marca: string; modelo: string; version: string | null }
  | { tipo: 'denominacion'; denominacion: string }

export function vehiculoBuscadoGenerali(form: Pick<FormularioAuto, 'seleccionVehiculo' | 'vehiculoConfirmado'>): VehiculoBuscado | null {
  const sv = form.seleccionVehiculo
  if (sv && sv.marca?.trim() && sv.modelo?.trim()) {
    const v = typeof sv.descripcion === 'string' && sv.descripcion.trim() !== '' ? sv.descripcion.trim() : null
    return { tipo: 'separado', marca: sv.marca.trim(), modelo: sv.modelo.trim(), version: v }
  }
  const d = form.vehiculoConfirmado?.denominacion?.trim()
  return d ? { tipo: 'denominacion', denominacion: d } : null
}

/** Qué buscar en cada nivel del selector (`denominacion`: el mismo texto en los tres niveles, por contención). PURA. */
export function buscadoEnNivel(v: VehiculoBuscado, nivel: 'marca' | 'modelo' | 'version'): { texto: string; modo: 'dato' | 'denominacion' } | null {
  if (v.tipo === 'denominacion') return { texto: v.denominacion, modo: 'denominacion' }
  const t = nivel === 'marca' ? v.marca : nivel === 'modelo' ? v.modelo : v.version
  return t ? { texto: t, modo: 'dato' } : null
}

/** Mensaje de atasco de un nivel del selector: el dato buscado (catálogo, no personal) y las opciones vistas (tope). PURA. */
export function mensajeAtascoCatalogo(nivel: string, buscado: string, opciones: readonly string[], e: Exclude<EleccionCatalogo, { tipo: 'unica' }>): string {
  const lista = (e.tipo === 'varias' ? e.indices.map((i) => opciones[i]!) : opciones.filter((o) => !esOpcionVaciaCatalogo(o))).slice(0, 25)
  const que = e.tipo === 'varias' ? `${e.indices.length} opciones casan` : 'ninguna opción casa'
  return `el ${nivel} de Generali para «${buscado.slice(0, 120)}»: ${que} (una persona elige; nunca a ciegas). Opciones: ${lista.join(' | ').slice(0, 900)}`
}

/** Marca del «Selector de vehículos» (SelectOneMenu de PrimeFaces, v0.2.6): SOLO igualdad EXACTA normalizada; sin contención ni similitud. */
export type EleccionMarcaGenerali = { tipo: 'unica'; indice: number } | { tipo: 'ninguna' | 'varias'; cercanas: string[] }

/**
 * Elige la marca por coincidencia EXACTA del texto normalizado (mayúsculas, sin tildes ni espacios dobles). Una sola → esa.
 * 0 o varias → NO se elige; `cercanas` (tope 25) = las exactas repetidas o, si no hay, las que contienen la frase (o la frase las
 * contiene) o empiezan igual, para que una persona decida. Nunca la primera, nunca «la más parecida». PURA.
 */
export function elegirMarcaExactaGenerali(opciones: readonly string[], buscado: string): EleccionMarcaGenerali {
  const b = normalizarCatalogo(buscado)
  const validas = opciones.map((o, i) => ({ o, i })).filter((x) => !esOpcionVaciaCatalogo(x.o))
  if (b === '') return { tipo: 'ninguna', cercanas: [] }
  const exactas = validas.filter((x) => normalizarCatalogo(x.o) === b)
  if (exactas.length === 1) return { tipo: 'unica', indice: exactas[0]!.i }
  if (exactas.length > 1) return { tipo: 'varias', cercanas: exactas.map((x) => x.o).slice(0, 25) }
  const cerca = validas.filter((x) => contieneFrase(buscado, x.o) || contieneFrase(x.o, buscado) || normalizarCatalogo(x.o).startsWith(b.slice(0, 3)))
  return { tipo: 'ninguna', cercanas: cerca.map((x) => x.o).slice(0, 25) }
}

/** Opción de cierre de la lista de modelos del selector de Generali: empieza por «Otros» (real: «Otros modelos ...», v0.2.12). */
export const OPCION_OTROS_MODELO_GENERALI = 'OTROS'

/** Supuesto declarado cuando el modelo no figura en la lista y se elige «Otros» (el modelo es dato de catálogo, no personal). PURA. */
export function avisoModeloOtrosGenerali(modelo: string): string {
  return `modelo «${modelo.replace(/\s+/g, ' ').trim().slice(0, 60)}» no figura en la lista del selector de Generali: se eligió «Otros» (supuesto; revisar en la emisión)`
}

/**
 * Modelo del selector (mismo criterio que la marca: SOLO igualdad EXACTA normalizada). Una → esa. Repetida → `varias` (una persona
 * elige). Ninguna: si el dato es del riesgo (`dato`) y hay UNA opción «Otros» → `otros` con su supuesto; si el buscado es una
 * denominación completa (no es un modelo suelto) o no hay «Otros» único → `ninguna` con las cercanas. Nunca la primera ni la más
 * parecida. PURA.
 */
export type EleccionModeloGenerali =
  | { tipo: 'unica'; indice: number }
  | { tipo: 'otros'; indice: number; supuesto: string }
  | { tipo: 'ninguna'; cercanas: string[] }
  | { tipo: 'varias'; cercanas: string[] }

export function elegirModeloGenerali(opciones: readonly string[], buscado: string, modo: 'dato' | 'denominacion' = 'dato'): EleccionModeloGenerali {
  const e = elegirMarcaExactaGenerali(opciones, buscado)
  if (e.tipo !== 'ninguna' || normalizarCatalogo(buscado) === '') return e
  const esOtros = esOpcionOtrosModeloGenerali
  if (modo === 'denominacion') {
    // v0.2.12: la denominación completa contiene el modelo como palabra entera («… TUCSON 1.6 …»); se queda el más largo («I20 ACTIVE»
    // gana a «I20»). Uno → ese; varios distintos → una persona elige; ninguno → «Otros» como con un dato suelto.
    const casan = opciones.map((o, i) => ({ o, i })).filter((x) => !esOpcionVaciaCatalogo(x.o) && !esOtros(x.o) && contieneFrase(buscado, x.o))
    const maximas = casan.filter((x) => !casan.some((y) => y !== x && normalizarCatalogo(y.o).length > normalizarCatalogo(x.o).length && contieneFrase(y.o, x.o)))
    if (maximas.length === 1) return { tipo: 'unica', indice: maximas[0]!.i }
    if (maximas.length > 1) return { tipo: 'varias', cercanas: maximas.map((x) => x.o).slice(0, 25) }
  }
  const otros = opciones.flatMap((o, i) => (esOtros(o) ? [i] : []))
  if (otros.length === 1) return { tipo: 'otros', indice: otros[0]!, supuesto: avisoModeloOtrosGenerali(buscado) }
  return e
}

// ───────────── v0.2.16: «Otros modelos ...» y el emparejado opción ↔ `li` del SelectOneMenu ─────────────

/** ¿Es la opción de cierre «Otros…» de la lista de modelos («Otros modelos ...», «Otros modelos…», «OTROS»)? PURA. */
export function esOpcionOtrosModeloGenerali(texto: string): boolean {
  return !esOpcionVaciaCatalogo(texto) && normalizarCatalogo(texto).split(' ')[0] === OPCION_OTROS_MODELO_GENERALI
}

/**
 * La opción decidida está PUESTA en el `<select>` oculto cuando su valor Y el texto de la opción seleccionada son los de la elegida
 * (normalizados). Solo el valor no basta: si «Seleccione uno» y «Otros modelos ...» comparten valor, el valor «casa» sin elegir nada. PURA.
 */
export function opcionPuestaPrimeFaces(valorActual: string, textoActual: string, elegida: { valor: string; texto: string }): boolean {
  const e = normalizarCatalogo(elegida.texto)
  return valorActual === elegida.valor && e !== '' && normalizarCatalogo(textoActual) === e
}

/**
 * El `data-label` EXACTO del `li` que corresponde al texto de la opción del `<select>` oculto: el idéntico si existe; si no, el ÚNICO
 * que casa normalizado (elipsis «…» vs «...», espacios dobles o duros, mayúsculas). 0 o varios → `null` (no se pulsa nada). PURA.
 */
export function dataLabelDeOpcionGenerali(dataLabels: readonly string[], texto: string, repetidas = false): string | null {
  const identicas = dataLabels.filter((d) => d === texto).length
  if (identicas === 1 || (repetidas && identicas > 1)) return texto
  const n = normalizarCatalogo(texto)
  if (n === '') return null
  const casan = dataLabels.filter((d) => normalizarCatalogo(d) === n)
  // v0.2.17 (`repetidas`, solo la versión): varios `li` con el MISMO texto exacto cuentan como uno (la puerta pulsa el primero).
  const distintos = [...new Set(casan)]
  if (repetidas) return distintos.length === 1 ? distintos[0]! : null
  return casan.length === 1 ? casan[0]! : null
}

export type EstadoTrasOtrosGenerali =
  | { tipo: 'puesta' }
  | { tipo: 'esperar' }
  | { tipo: 'ampliada'; eleccion: EleccionModeloGenerali }

/**
 * Tras pulsar «Otros modelos ...» (prueba real 0.2.15: el desplegable volvió a «Seleccione uno»). El portal puede (a) dejar «Otros» puesto
 * (label E input lo dicen) → `puesta`; (b) RECARGAR la lista con más modelos (la opción con «...» es un «ver más») → `ampliada` con la
 * elección del modelo sobre la lista NUEVA por la misma regla; un «Otros» de la lista nueva NO se vuelve a elegir (sería un bucle): queda
 * `ninguna` con las cercanas; (c) nada de eso todavía → `esperar` (el AJAX no ha terminado). PURA.
 */
export function estadoTrasOtrosModeloGenerali(
  antes: readonly string[],
  ahora: readonly string[],
  otros: string,
  label: string,
  input: string,
  buscado: string,
  modo: 'dato' | 'denominacion' = 'dato',
): EstadoTrasOtrosGenerali {
  const o = normalizarCatalogo(otros)
  if (o !== '' && normalizarCatalogo(label) === o && normalizarCatalogo(input) === o) return { tipo: 'puesta' }
  const previas = new Set(antes.map(normalizarCatalogo))
  const nuevas = ahora.filter((x) => !esOpcionVaciaCatalogo(x) && !previas.has(normalizarCatalogo(x)))
  if (nuevas.length === 0) return { tipo: 'esperar' }
  const e = elegirModeloGenerali(ahora, buscado, modo)
  if (e.tipo !== 'otros') return { tipo: 'ampliada', eleccion: e }
  const reales = ahora.filter((x) => !esOpcionVaciaCatalogo(x) && !esOpcionOtrosModeloGenerali(x))
  const b = normalizarCatalogo(buscado)
  const cerca = reales.filter((x) => contieneFrase(buscado, x) || contieneFrase(x, buscado) || normalizarCatalogo(x).startsWith(b.slice(0, 3)))
  return { tipo: 'ampliada', eleccion: { tipo: 'ninguna', cercanas: cerca.slice(0, 25) } }
}

/** Un control del selector de vehículos leído de la página (solo lectura): etiqueta, tipo y sus opciones (catálogo). */
export type CampoSelectorGenerali = { clave: string; etiqueta: string; tipo: string; opciones: string[]; total: number }

/** Los campos que NO estaban antes de elegir marca/modelo (por `clave`) y que no son los menús que el bot maneja. PURA. */
export function camposNuevosSelectorGenerali(antes: readonly string[], ahora: readonly CampoSelectorGenerali[], ignorar: readonly string[] = []): CampoSelectorGenerali[] {
  const vistos = new Set([...antes, ...ignorar])
  return ahora.filter((c) => !vistos.has(c.clave))
}

/** «Etiqueta [tipo]: op1 | op2 …» de cada campo nuevo, para el hueco (con tope). PURA. */
export function resumenCamposSelectorGenerali(campos: readonly CampoSelectorGenerali[], max = 1500): string {
  const t = campos.map((c) => `«${c.etiqueta || '(sin etiqueta)'}» [${c.tipo}]${c.opciones.length ? ` (${c.total}): ${c.opciones.join(' | ')}` : ''}`).join(' ; ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ───────────── v0.2.38: estado del selector ANTES de «Confirmar» (prueba real 27/10/2026 con 0.2.37: «Confirmar» sin validar y sin mensajes) ─────────────

/** Un control visible del selector con su estado, SIN valores (solo etiquetas): `vacio` = sin elección/texto; `requerido` = marcado como obligatorio por el portal. */
export type EstadoControlSelectorGenerali = { clave: string; etiqueta: string; tipo: string; vacio: boolean; requerido: boolean }
export type EstadoSelectorGenerali = { controles: EstadoControlSelectorGenerali[]; filas: number; filasSeleccionadas: number }

/**
 * Lo que impide pulsar «Confirmar» con sentido: un grupo que el bot rellenó (combustible / potencia) que quedó SIN marcar (el AJAX de la versión
 * lo repintó), el desplegable «Versión» vuelto a «Seleccione una», o una tabla de versiones sin fila seleccionada. `claves` = campos que el bot explicó.
 * Devuelve las etiquetas (sin valores). Los demás vacíos solo van al diagnóstico. PURA.
 */
export function vaciosAntesDeConfirmarGenerali(estado: EstadoSelectorGenerali, claves: ReadonlySet<string>): string[] {
  const out = estado.controles.filter((c) => c.vacio && claves.has(c.clave)).map((c) => `${c.etiqueta || '(sin etiqueta)'} [${c.tipo}]`)
  if (estado.filas > 0 && estado.filasSeleccionadas === 0) out.push('fila de la tabla de versiones [sin seleccionar]')
  return out
}

/** «vacíos/obligatorios: «X» [tipo] vacío·obligatorio …; versión: elegida|SIN elegir|no hay desplegable; tabla: n filas (m marcadas)». Solo etiquetas. PURA. */
export function resumenEstadoSelectorGenerali(estado: EstadoSelectorGenerali, max = 700): string {
  const lista = estado.controles.filter((c) => c.vacio || c.requerido).map((c) => `«${c.etiqueta || '(sin etiqueta)'}» [${c.tipo}] ${c.vacio ? 'vacío' : 'relleno'}${c.requerido ? '·obligatorio' : ''}`)
  const ver = estado.controles.find((c) => c.tipo === 'desplegable' && /^versi[oó]n(es)?\s*:?\s*$/i.test(c.etiqueta.trim()))
  const v = ver ? (ver.vacio ? 'SIN elegir' : 'elegida') : 'no hay desplegable'
  const t = `campos vacíos/obligatorios: ${lista.length ? lista.join(' ; ') : '(ninguno)'}; versión: ${v}; tabla de versiones: ${estado.filas} filas (${estado.filasSeleccionadas} marcadas)`
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ───────────── v0.2.14: ficha de versión del selector (Potencia · Versión · tabla Código | Modelo | Versión · Resumen) ─────────────

/** Una fila de la tabla de versiones (catálogo, sin datos personales). */
export type FilaVersionGenerali = { codigo: string; modelo: string; version: string; seleccionada: boolean }
/** Lo que el selector enseña tras el modelo (solo lectura). `resumen` = texto tras «Código y descripción» del bloque «Resumen». */
export type FichaVersionGenerali = { filas: FilaVersionGenerali[]; resumen: string }

/** «116.0 CV» → 116; `null` si la etiqueta no trae un número seguido de CV. PURA. */
export function cvDePotenciaGenerali(etiqueta: string): number | null {
  const m = /(\d{2,4}(?:[.,]\d+)?)\s*CV\b/i.exec(etiqueta)
  if (!m) return null
  const n = Number(m[1]!.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * El grupo de opciones «Potencia» entre los controles del selector: no es «Placas especiales» y TODAS sus opciones son «NNN CV» o
 * (v0.2.17) «No lo sé», con al menos una «NNN CV». `null` si no hay (o hay varios). PURA.
 */
export function grupoPotenciaGenerali(campos: readonly CampoSelectorGenerali[]): { grupo: string; opciones: string[] } | null {
  const hallados = campos.filter(
    (c) =>
      c.tipo === 'grupo' && c.clave.startsWith('grupo|') && !/^placaesp/i.test(c.clave.slice(6)) && c.opciones.length > 0 && c.opciones.length === c.total &&
      c.opciones.every((o) => cvDePotenciaGenerali(o) !== null || esOpcionNoLoSeGenerali(o)) && c.opciones.some((o) => cvDePotenciaGenerali(o) !== null),
  )
  return hallados.length === 1 ? { grupo: hallados[0]!.clave.slice(6), opciones: hallados[0]!.opciones } : null
}

// ───────────── v0.2.17: combustible · potencia exacta · versión del desplegable (con textos repetidos) ─────────────
// Prueba real (22/10/2026): tras «Otros modelos ...» el selector enseña «combustible» [grupo] (Diésel | Gasolina | No lo sé), «potencia»
// [grupo] («163.0 CV»… | No lo sé) y «Versión» [desplegable] con opciones REPETIDAS. Orden: combustible → potencia → (recarga) → versión.

/** ¿Es la opción «No lo sé» de los grupos del selector? PURA. */
export function esOpcionNoLoSeGenerali(texto: string): boolean {
  return normalizarCatalogo(texto) === 'NO LO SE'
}

/**
 * El grupo «combustible» del selector: un grupo (no «Placas especiales») cuyo nombre dice combustible/carburante, o cuyas opciones son
 * todas combustibles reconocibles o «No lo sé» (al menos un combustible). `null` si no hay o hay varios. PURA.
 */
export function grupoCombustibleGenerali(campos: readonly CampoSelectorGenerali[]): { grupo: string; opciones: string[] } | null {
  const hallados = campos.filter((c) => {
    if (c.tipo !== 'grupo' || !c.clave.startsWith('grupo|') || /^placaesp/i.test(c.clave.slice(6)) || c.opciones.length === 0 || c.opciones.length !== c.total) return false
    if (/combust|carbur/i.test(c.clave.slice(6)) || /combust|carbur/i.test(c.etiqueta)) return true
    return c.opciones.every((o) => normalizarCombustible(o) !== null || esOpcionNoLoSeGenerali(o)) && c.opciones.some((o) => normalizarCombustible(o) !== null)
  })
  return hallados.length === 1 ? { grupo: hallados[0]!.clave.slice(6), opciones: hallados[0]!.opciones } : null
}

type FormVehiculoRiesgo = Pick<FormularioAuto, 'vehiculoConfirmado' | 'seleccionVehiculo'>

/** Texto de la versión del riesgo (descripción de la selección o denominación confirmada), o `null`. PURA. */
function textoVersionRiesgo(form: FormVehiculoRiesgo): string | null {
  const d = form.seleccionVehiculo?.descripcion?.trim() || form.vehiculoConfirmado?.denominacion?.trim() || ''
  return d === '' ? null : d
}

/**
 * Combustible del riesgo: el del vehículo confirmado (Mapfre); si no consta, el que DIGA el texto de la versión (descripción o
 * denominación: «GASOLINA», «DIESEL»…). Nada → `null` (no consta; nunca se deduce de siglas de motor). PURA.
 */
export function combustibleRiesgoGenerali(form: FormVehiculoRiesgo): Combustible | null {
  const vc = form.vehiculoConfirmado?.combustible ?? null
  if (vc) return vc
  const t = textoVersionRiesgo(form)
  return t ? (datosEquivalenciaDesdeEtiqueta(t).combustible ?? null) : null
}

/** CV del riesgo (enteros): los del vehículo confirmado; si no constan, los «NNN CV» del texto de la versión. `null` = no consta. PURA. */
export function cvRiesgoGenerali(form: FormVehiculoRiesgo): number | null {
  const vc = form.vehiculoConfirmado?.cv
  if (typeof vc === 'number' && Number.isFinite(vc) && vc > 0) return Math.round(vc)
  const t = textoVersionRiesgo(form)
  const cv = t ? datosEquivalenciaDesdeEtiqueta(t).cv : null
  return typeof cv === 'number' && cv > 0 ? Math.round(cv) : null
}

const ETIQUETA_COMBUSTIBLE: Record<Combustible, string> = {
  gasolina: 'gasolina', diesel: 'diésel', electrico: 'eléctrico', hibrido: 'híbrido', hibrido_enchufable: 'híbrido enchufable', glp: 'GLP', gnc: 'GNC', hidrogeno: 'hidrógeno',
}

export type DecisionGrupoGenerali = { tipo: 'opcion'; texto: string; supuesto: string | null } | { tipo: 'sin_opcion'; motivo: string }

/**
 * Combustible del selector: la opción cuyo texto normalizado es el combustible del riesgo («Diésel» ↔ diesel). Sin dato o sin opción
 * que case → «No lo sé» con supuesto SOLO si el portal lo ofrece; si no, `sin_opcion` (nunca se inventa). Varias que casan → `sin_opcion`. PURA.
 */
export function decidirCombustibleGenerali(opciones: readonly string[], combustible: Combustible | null): DecisionGrupoGenerali {
  if (combustible) {
    const casan = opciones.filter((o) => !esOpcionNoLoSeGenerali(o) && normalizarCombustible(o) === combustible)
    if (casan.length === 1) return { tipo: 'opcion', texto: casan[0]!, supuesto: null }
    if (casan.length > 1) return { tipo: 'sin_opcion', motivo: `el combustible ${ETIQUETA_COMBUSTIBLE[combustible]} casa con ${casan.length} opciones (${opciones.join(' | ').slice(0, 200)})` }
  }
  const noLoSe = opciones.find(esOpcionNoLoSeGenerali)
  const que = combustible ? `el combustible del riesgo (${ETIQUETA_COMBUSTIBLE[combustible]}) no figura entre las opciones del selector de Generali` : 'el combustible del vehículo no consta en el riesgo'
  if (noLoSe) return { tipo: 'opcion', texto: noLoSe, supuesto: `${que}: se marcó «${noLoSe}» (supuesto; revisar en la emisión)` }
  return { tipo: 'sin_opcion', motivo: `${que} y el selector no ofrece «No lo sé» (opciones: ${opciones.join(' | ').slice(0, 200)})` }
}

/**
 * Potencia del selector por CV ENTERO EXACTO del riesgo (163 ↔ «163.0 CV»). Sin coincidencia o sin dato → «No lo sé» con supuesto si el
 * portal lo ofrece; si no, `sin_exacta` (decide la regla de 0.2.14 con tolerancia o pregunta). PURA.
 */
export function potenciaExactaGenerali(
  opciones: readonly string[],
  cv: number | null,
): { tipo: 'exacta'; texto: string } | { tipo: 'no_lo_se'; texto: string; supuesto: string } | { tipo: 'sin_exacta' } {
  if (cv !== null) {
    const exactas = opciones.filter((o) => {
      const n = cvDePotenciaGenerali(o)
      return n !== null && Math.round(n) === Math.round(cv)
    })
    if (exactas.length >= 1 && exactas.every((o) => normalizarCatalogo(o) === normalizarCatalogo(exactas[0]!))) return { tipo: 'exacta', texto: exactas[0]! }
  }
  const noLoSe = opciones.find(esOpcionNoLoSeGenerali)
  if (!noLoSe) return { tipo: 'sin_exacta' }
  const que = cv === null ? 'la potencia del vehículo no consta en el riesgo' : `la potencia del riesgo (${Math.round(cv)} CV) no figura entre las opciones del selector de Generali`
  return { tipo: 'no_lo_se', texto: noLoSe, supuesto: `${que}: se marcó «${noLoSe}» (supuesto; revisar en la emisión)` }
}

// ───────────── v0.2.36: combustible y potencia DEDUCIDOS del texto de la versión (hipótesis: sin ellos Generali no calcula) ─────────────

/** Texto de la versión del riesgo (descripción de la selección o denominación confirmada), o `null`. PURA. */
export function textoVersionRiesgoGenerali(form: FormVehiculoRiesgo): string | null {
  return textoVersionRiesgo(form)
}

const RE_DIESEL_MOTOR = regexPalabras(terminosDe(CONCEPTOS_LECTURA.combustible_motor as Concepto, { grupos: ['diesel'] }), { mayus: true })
const RE_GASOLINA_MOTOR = regexPalabras(terminosDe(CONCEPTOS_LECTURA.combustible_motor as Concepto, { grupos: ['gasolina'] }), { mayus: true })

/** Combustible por las siglas de motor de la versión («2.9 CRDI 163 FULL» → diésel). Solo si UNA familia casa; mezcla o nada → `null`. PURA. */
export function combustibleDeVersionGenerali(texto: string | null | undefined): Combustible | null {
  const n = normalizarCatalogo(texto ?? '')
  if (n === '') return null
  const d = RE_DIESEL_MOTOR.test(n)
  const g = RE_GASOLINA_MOTOR.test(n)
  return d === g ? null : d ? 'diesel' : 'gasolina'
}

/**
 * CV de la versión: «NNN CV» explícito (único), o exactamente UN entero de 40–700 suelto («2.9 CRDI 163 FULL» → 163; la cilindrada «2.9» y los
 * decimales no cuentan). Dos o más candidatos, o ninguno → `null`. PURA.
 */
export function potenciaDeVersionGenerali(texto: string | null | undefined): number | null {
  const n = normalizarCatalogo(texto ?? '')
  if (n === '') return null
  const explicitos = new Set([...n.matchAll(/(?<![0-9.])(\d{2,3})\s*CV\b/g)].map((m) => Number(m[1])))
  if (explicitos.size > 0) {
    const v = [...explicitos].filter((x) => x >= 40 && x <= 700)
    return v.length === 1 && explicitos.size === 1 ? v[0]! : null
  }
  const sueltos = new Set([...n.matchAll(/(?<![0-9.])(\d{2,3})(?![0-9.])(?!\s*(?:CC|KG|KW|L|V|P)\b)/g)].map((m) => Number(m[1])).filter((x) => x >= 40 && x <= 700))
  return sueltos.size === 1 ? [...sueltos][0]! : null
}

/** Aviso de supuesto cuando se rellenaron combustible y/o potencia a partir de la versión. PURA. */
export function avisoDeducidoDeVersionGenerali(version: string, combustible: boolean, potencia: boolean): string {
  const que = combustible && potencia ? 'combustible/potencia deducidos' : combustible ? 'combustible deducido' : 'potencia deducida'
  return `${que} de la versión «${version.slice(0, 80)}» (supuesto; revisar en la emisión)`
}

/**
 * Combustible deducido de la versión: SOLO si existe UNA opción del portal que casa exacta con el combustible deducido (no «No lo sé»).
 * Si no, `null` (se mantiene la decisión de siempre). PURA.
 */
export function opcionCombustibleDeVersionGenerali(opciones: readonly string[], version: string | null): string | null {
  const c = combustibleDeVersionGenerali(version)
  if (!c) return null
  const casan = opciones.filter((o) => !esOpcionNoLoSeGenerali(o) && normalizarCombustible(o) === c)
  return casan.length === 1 ? casan[0]! : null
}

/** Potencia deducida de la versión: SOLO la opción «NNN CV» cuyo valor entero es EXACTAMENTE el deducido (nunca la parecida). `null` si no. PURA. */
export function opcionPotenciaDeVersionGenerali(opciones: readonly string[], version: string | null): string | null {
  const cv = potenciaDeVersionGenerali(version)
  if (cv === null) return null
  const r = potenciaExactaGenerali(opciones, cv)
  return r.tipo === 'exacta' ? r.texto : null
}

/** ¿Se rellenaron combustible y potencia con datos (ninguno quedó en «No lo sé»)? Se mira en los avisos de supuesto. PURA. */
export function combustiblePotenciaRellenosGenerali(avisos: readonly string[]): boolean {
  return !avisos.some((a) => /«No lo sé»/.test(a) && /combustible|potencia/i.test(a))
}

/** Lo que se sabe del riesgo para elegir la versión del desplegable. `persona` = elección de la bandeja (manda). */
export type ReferenciaVersionDesplegable = { persona: string | null; buscado: string | null; cv: number | null; combustible: Combustible | null }
export type EleccionVersionDesplegable = { tipo: 'opcion'; indice: number; supuesto: string | null } | { tipo: 'preguntar'; candidatas: string[] }

/**
 * Versión del desplegable «Versión» (v0.2.17; el portal REPITE textos, p. ej. «2.9 CRDI 163 FULL» dos veces). Índices sobre `opciones`.
 *   1. elección de una persona: exacta normalizada (repetida → la primera, declarada); no casa → preguntar;
 *   2. versión del riesgo: exacta normalizada; si no, contención por palabra entera (en cualquier sentido), filtrada por CV/combustible
 *      si eso deja alguna; idénticas o varias → la PRIMERA, declarada («Versión elegida automáticamente: …; revisar en la emisión»);
 *   3. sin dato o sin casar: filtro por potencia (el número de CV como palabra entera) y combustible (descarta las que dicen otro).
 *      Una → esa; varias → la primera, declarada; ninguna, o sin ningún dato con varias → preguntar con todas. PURA.
 */
export function elegirVersionDesplegableGenerali(opciones: readonly string[], ref: ReferenciaVersionDesplegable): EleccionVersionDesplegable {
  const validas = opciones.map((o, i) => ({ o, i, n: normalizarCatalogo(o) })).filter((x) => !esOpcionVaciaCatalogo(x.o))
  const preguntar: EleccionVersionDesplegable = { tipo: 'preguntar', candidatas: validas.map((x) => x.o) }
  if (validas.length === 0) return preguntar
  const primera = (xs: typeof validas, declarar: boolean): EleccionVersionDesplegable => ({
    tipo: 'opcion',
    indice: xs[0]!.i,
    supuesto: declarar || xs.length > 1 ? supuestoVersionAutomatica(xs[0]!.o, xs.length) : null,
  })
  const persona = ref.persona?.trim() ? normalizarCatalogo(ref.persona) : ''
  if (persona !== '') {
    const casan = validas.filter((x) => x.n === persona)
    return casan.length > 0 ? primera(casan, false) : preguntar
  }
  if (validas.length === 1) return { tipo: 'opcion', indice: validas[0]!.i, supuesto: null }
  const compatible = (x: (typeof validas)[number]): boolean => {
    if (ref.cv !== null && !x.n.split(' ').includes(String(Math.round(ref.cv))) && datosEquivalenciaDesdeEtiqueta(x.o).cv !== Math.round(ref.cv)) return false
    const c = datosEquivalenciaDesdeEtiqueta(x.o).combustible ?? null
    return !(ref.combustible && c && c !== ref.combustible)
  }
  const b = ref.buscado?.trim() ? normalizarCatalogo(ref.buscado) : ''
  if (b !== '') {
    const exactas = validas.filter((x) => x.n === b)
    if (exactas.length > 0) return primera(exactas, false)
    const contenidas = validas.filter((x) => contieneFrase(ref.buscado!, x.o) || contieneFrase(x.o, ref.buscado!))
    if (contenidas.length > 0) {
      const filtradas = contenidas.filter(compatible)
      return primera(filtradas.length > 0 ? filtradas : contenidas, true)
    }
  }
  if (ref.cv === null && ref.combustible === null) return preguntar
  const filtradas = validas.filter(compatible)
  if (filtradas.length === 0) return preguntar
  return filtradas.length === 1 ? { tipo: 'opcion', indice: filtradas[0]!.i, supuesto: null } : primera(filtradas, true)
}

/** El desplegable «Versión» del selector (PrimeFaces o nativo), si lo hay y es único. PURA. */
export function desplegableVersionGenerali(campos: readonly CampoSelectorGenerali[]): CampoSelectorGenerali | null {
  const hallados = campos.filter((c) => (c.tipo === 'desplegable' || c.tipo === 'select') && /^versi[oó]n(es)?\s*:?\s*$/i.test(c.etiqueta.trim()))
  return hallados.length === 1 ? hallados[0]! : null
}

/**
 * ¿El «Resumen» corresponde a la fila elegida? Con código: el código tiene que aparecer como palabra entera en el resumen (la descripción
 * puede venir recortada con «…»). Sin código: la versión entera (normalizada) tiene que estar contenida. Resumen vacío → no. PURA.
 */
export function resumenCoincideConFilaGenerali(resumen: string, fila: Pick<FilaVersionGenerali, 'codigo' | 'version'>): boolean {
  const r = normalizarCatalogo(resumen)
  if (r === '') return false
  const c = normalizarCatalogo(fila.codigo)
  if (c !== '') return ` ${r} `.includes(` ${c} `)
  const v = normalizarCatalogo(fila.version)
  return v !== '' && r.includes(v)
}

// ───────────────────────── «Datos de Valoración» (captura 6) ─────────────────────────

/** Etiquetas EXACTAS de la captura 6 (sección «Identificación del vehículo» y «Roles»). */
export const ETIQUETAS_VALORACION = Object.freeze({
  matricula: 'Matrícula',
  uso: 'Uso del Vehículo',
  garaje: 'Garaje',
  fechaPrimeraMatriculacion: 'Fecha 1ª matriculación',
  kmAnuales: 'KM anuales declarados',
  primerConductor: 'El primer conductor coincide con',
})

/** El campo de VERIFICACIÓN de la matrícula (Alberto): etiqueta con «matrícula» y «verific/confirm/repet». PURA. */
export function esEtiquetaVerificacionMatricula(etiqueta: string): boolean {
  const t = normalizarCatalogo(etiqueta)
  return /MATRICULA/.test(t) && /(VERIFIC|CONFIRM|REPET|REPIT|COMPROB)/.test(t)
}

/** Supuesto declarado cuando el uso particular no distingue ocasional/diario y el portal ofrece las dos (v0.2.18). */
export const SUPUESTO_USO_PARTICULAR_DIARIO = 'Uso del vehículo: Particular Diario (por defecto; revisar si es ocasional)'

/**
 * Opción del «Uso del Vehículo» para el uso del riesgo (hoy solo particular; otro uso = sin mapa). v0.2.18: el portal separa
 * «Particular Ocasional (…)» y «Particular Diario (…)»: manda `usoFrecuencia` del riesgo (ocasional → Ocasional; diario/laboral → Diario);
 * sin dato, «Particular Diario» (uso particular estándar y conservador en precio) y `supuesto` lo declara. PURA.
 */
export function decidirUsoGenerali(
  opciones: readonly string[],
  uso: string | null | undefined,
  frecuencia?: string | null,
): { eleccion: EleccionCatalogo; supuesto: string | null } {
  if ((uso ?? 'particular') !== 'particular') return { eleccion: { tipo: 'ninguna' }, supuesto: null }
  const ix = opciones.flatMap((o, i) => (!esOpcionVaciaCatalogo(o) && /\bPARTICULAR\b/.test(normalizarCatalogo(o)) && !/\b(ALQUILER|TAXI|AUTOESCUELA|EMPRESA|PROFESIONAL|COMERCIAL)\b/.test(normalizarCatalogo(o)) ? [i] : []))
  if (ix.length === 1) return { eleccion: { tipo: 'unica', indice: ix[0]!, porSimilitud: false }, supuesto: null }
  if (ix.length === 0) return { eleccion: { tipo: 'ninguna' }, supuesto: null }
  const con = (re: RegExp): number[] => ix.filter((i) => re.test(normalizarCatalogo(opciones[i]!)))
  const oca = con(/\bOCASIONAL\b/)
  const dia = con(/\bDIARIO\b/)
  if (ix.length === oca.length + dia.length && oca.length === 1 && dia.length === 1) {
    if (frecuencia === 'ocasional') return { eleccion: { tipo: 'unica', indice: oca[0]!, porSimilitud: false }, supuesto: null }
    if (frecuencia === 'diario' || frecuencia === 'laboral') return { eleccion: { tipo: 'unica', indice: dia[0]!, porSimilitud: false }, supuesto: null }
    return { eleccion: { tipo: 'unica', indice: dia[0]!, porSimilitud: false }, supuesto: SUPUESTO_USO_PARTICULAR_DIARIO }
  }
  return { eleccion: { tipo: 'varias', indices: ix }, supuesto: null }
}

/** Compatibilidad: solo la elección (sin supuesto). PURA. */
export function elegirUsoGenerali(opciones: readonly string[], uso: string | null | undefined, frecuencia?: string | null): EleccionCatalogo {
  return decidirUsoGenerali(opciones, uso, frecuencia).eleccion
}

/** Opción de «Garaje» para el tipo del riesgo/supuesto (`calle` · `colectivo` · `individual`). PURA. */
export function elegirGarajeGenerali(opciones: readonly string[], tipo: 'calle' | 'colectivo' | 'individual'): EleccionCatalogo {
  const re = tipo === 'colectivo' ? /\bCOLECTIVO\b|\bCOMUNITARIO\b/ : tipo === 'individual' ? /\bINDIVIDUAL\b|\bPARTICULAR\b|\bPRIVADO\b/ : /\bCALLE\b|\bSIN GARAJE\b|\bVIA PUBLICA\b/
  const ix = opciones.flatMap((o, i) => (!esOpcionVaciaCatalogo(o) && re.test(normalizarCatalogo(o)) ? [i] : []))
  return ix.length === 1 ? { tipo: 'unica', indice: ix[0]!, porSimilitud: false } : ix.length === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', indices: ix }
}

/** «AAAA-MM-DD» → «dd/mm/aaaa» (las fechas de la captura 6). `null` si no es ISO. PURA. */
export function fechaGenerali(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/**
 * Roles de «Personas que intervienen» (captura 6): el portal viene con «propietario = tomador: Sí», «conductores identificados:
 * Sí» y «primer conductor = TOMADOR». Solo se deja así si el riesgo lo dice o no lo dice (entonces SUPUESTO declarado); si el
 * riesgo dice que NO, es un hueco de mapa (esa variante no tiene captura). PURA.
 */
export function rolesGenerali(form: Pick<FormularioAuto, 'tomadorEsPropietario' | 'tomadorEsConductor'>): { ok: true; supuestos: string[] } | { ok: false; hueco: string } {
  if (form.tomadorEsPropietario === false) return { ok: false, hueco: 'propietario distinto del tomador (variante sin captura)' }
  if (form.tomadorEsConductor === false) return { ok: false, hueco: 'conductor habitual distinto del tomador (variante sin captura)' }
  const supuestos: string[] = []
  if (form.tomadorEsPropietario == null) supuestos.push('el tomador es el propietario')
  const conductor = supuestoConductorTomador(form)
  if (conductor) supuestos.push(conductor)
  return { ok: true, supuestos }
}

// ───────────────────────── v0.2.0 (19/10/2026): verificación opcional, registro de pantalla, precio ─────────────────────────

/**
 * Campo de VERIFICACIÓN de la matrícula (regla de Alberto: «si el portal pide verificación, la misma otra vez»). La captura 6
 * enseña UN solo campo «Matrícula»: la verificación es OPCIONAL. 0 candidatos → se sigue; 1 → se rellena igual; >1 → PARA
 * (no se elige a ciegas). PURA.
 */
export type DecisionVerificacion = { tipo: 'ninguna' } | { tipo: 'rellenar' } | { tipo: 'parar'; motivo: string }
export function decidirVerificacionMatricula(candidatos: number): DecisionVerificacion {
  if (!Number.isInteger(candidatos) || candidatos < 0) return { tipo: 'parar', motivo: 'el campo de VERIFICACIÓN de la matrícula (recuento ilegible)' }
  if (candidatos === 0) return { tipo: 'ninguna' }
  if (candidatos === 1) return { tipo: 'rellenar' }
  return { tipo: 'parar', motivo: `el campo de VERIFICACIÓN de la matrícula: hay ${candidatos} candidatos y no se elige a ciegas` }
}

/** Un control visible de la pantalla, LEÍDO (nunca el valor de un campo de texto: solo si tiene o no). */
export type CampoPantalla = { etiqueta: string; tipo: string; obligatorio: boolean; valor: string }
export type PantallaLeida = { campos: CampoPantalla[]; botones: string[]; avisos: string[] }

/**
 * Resumen corto de una pantalla para el mensaje del hueco (va al `error` del trabajo, redactado por el runner): campos
 * («Etiqueta [tipo*] = valor», `*` = obligatorio), botones y avisos visibles, con tope. PURA.
 */
export function resumenPantallaGenerali(p: PantallaLeida, max = 1400): string {
  const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
  const campos = p.campos.map((c) => `${corta(c.etiqueta || '(sin etiqueta)', 60)} [${c.tipo}${c.obligatorio ? '*' : ''}] = ${corta(c.valor, 40)}`)
  const vacios = p.campos.filter((c) => c.obligatorio && c.valor === 'vacío').length
  const partes = [
    `${p.campos.length} campos${vacios ? ` (${vacios} obligatorios vacíos)` : ''}: ${campos.join('; ')}`,
    `botones: ${p.botones.map((b) => corta(b, 40)).join(' · ') || '(ninguno)'}`,
    ...(p.avisos.length ? [`avisos: ${p.avisos.map((a) => corta(a, 160)).join(' · ')}`] : []),
  ]
  return corta(partes.join(' | '), max)
}

/**
 * Campos de tomador/conductor/antecedentes que el bot RELLENA en «Datos de Valoración» si aparecen con una de estas etiquetas
 * EXACTAS (normalizadas con `normalizarCatalogo`, sin «:» ni «*»). Mapa PROVISIONAL (sin captura de esa parte): solo un campo
 * de TEXTO vacío y único por etiqueta; lo demás se registra y no se toca.
 */
export const ETIQUETAS_RIESGO_GENERALI = Object.freeze({
  // 26/10/2026: los sinónimos salen de `vocabulario.ts` (conceptos de lectura `fecha_nacimiento`, `fecha_carne`, `codigo_postal`, `anios_asegurado`,
  // `siniestros_5_anios`): lo que se aprenda ahí vale para los demás bots. Aquí solo en MAYÚSCULAS, como las compara `claveEtiquetaRiesgoGenerali`.
  fechaNacimiento: textosMayus(CONCEPTOS_LECTURA.fecha_nacimiento as Concepto, 'etiqueta_exacta'),
  fechaCarne: textosMayus(CONCEPTOS_LECTURA.fecha_carne as Concepto, 'etiqueta_exacta'),
  codigoPostal: textosMayus(CONCEPTOS_LECTURA.codigo_postal as Concepto, 'etiqueta_exacta'),
  aniosAsegurado: textosMayus(CONCEPTOS_LECTURA.anios_asegurado as Concepto, 'etiqueta_exacta'),
  siniestros: textosMayus(CONCEPTOS_LECTURA.siniestros_5_anios as Concepto, 'etiqueta_exacta'),
} as const)
export type ClaveRiesgoGenerali = keyof typeof ETIQUETAS_RIESGO_GENERALI

/** La clave del mapa provisional para una etiqueta de la pantalla, o `null`. PURA. */
export function claveEtiquetaRiesgoGenerali(etiqueta: string): ClaveRiesgoGenerali | null {
  const t = normalizarCatalogo(String(etiqueta ?? '').replace(/[:*]+\s*$/, ''))
  for (const [k, lista] of Object.entries(ETIQUETAS_RIESGO_GENERALI) as [ClaveRiesgoGenerali, readonly string[]][]) if (lista.includes(t)) return k
  return null
}

/**
 * Valor a teclear para una clave del mapa provisional, con los antecedentes YA resueltos (dato o supuesto favorable de
 * `conAntecedentesFavorables`, que el adaptador declara aparte). `null` = el riesgo no lo trae en un formato válido (no se
 * inventa). PURA.
 */
export function valorRiesgoGenerali(
  clave: ClaveRiesgoGenerali,
  form: Pick<FormularioAuto, 'conductor' | 'codigoPostal'> & { aniosAseguradoAnterior: number; siniestrosUltimos5Anios: number },
): string | null {
  switch (clave) {
    case 'fechaNacimiento':
      return fechaGenerali(form.conductor?.fechaNacimiento)
    case 'fechaCarne':
      return fechaGenerali(form.conductor?.fechaCarne)
    case 'codigoPostal':
      return /^\d{5}$/.test(String(form.codigoPostal ?? '')) ? form.codigoPostal : null
    case 'aniosAsegurado':
      return Number.isInteger(form.aniosAseguradoAnterior) && form.aniosAseguradoAnterior >= 0 ? String(form.aniosAseguradoAnterior) : null
    case 'siniestros':
      return Number.isInteger(form.siniestrosUltimos5Anios) && form.siniestrosUltimos5Anios >= 0 ? String(form.siniestrosUltimos5Anios) : null
  }
}

// ───────────────────────── lector TOLERANTE del precio («Garantías y Resultados», sin captura) ─────────────────────────

/** Importes en formato español (1.234,56 € · 1234,56€ · € 1.234,56 · 1.234 €), dentro de una línea. */
const RE_IMPORTE_EN_LINEA = /(?:€\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*(?:€|eur(?:os)?\b)?|(?:€\s*)?\d+(?:,\d{1,2})\s*(?:€|eur(?:os)?\b)?|(?:€\s*)?\d+\s*(?:€|eur(?:os)?\b)|€\s*\d+/gi
// 26/10/2026: los rótulos de precio salen de `vocabulario.ts` (conceptos de lectura `precio`, `precio_total`, `importe_ajeno`…), con su origen. El texto
// de aquí está en MAYÚSCULAS sin tildes (`normalizarCatalogo`): `mayus` construye los mismos patrones que antes.
const MAYUS = { mayus: true } as const
const RE_LINEA_PRECIO = regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio), MAYUS)
const RE_LINEA_TOTAL = regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_total), MAYUS)
/** Líneas con importes que NO son el precio (capitales, franquicias, valores del vehículo, límites). */
const RE_LINEA_NO_PRECIO = regexPalabras(terminosDe(CONCEPTOS_LECTURA.importe_ajeno), MAYUS)
/** Horquilla sensata de una prima anual de turismo: fuera de ella no se cree el número. */
export const PRIMA_MIN_GENERALI_EUR = 30
export const PRIMA_MAX_GENERALI_EUR = 20_000

/** «1.234,56 €» → 1234.56 (formato español; con € o con decimales). `null` si no es un importe. PURA. */
export function importeEspanolEur(texto: string): number | null {
  const t = String(texto ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const m = /^(?:€\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:€|eur(?:os)?)?$/i.exec(t)
  if (!m || !(/€|eur/i.test(t) || /,\d{1,2}$/.test(m[1]!))) return null
  const n = Number(m[1]!.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export type LecturaPrecioGenerali =
  | { tipo: 'unico'; eur: number; linea: string; avisos?: string[] }
  | { tipo: 'ninguno' }
  | { tipo: 'varios'; candidatos: { eur: number; linea: string }[] }

/** v0.2.30: encabezado de la pantalla de `emiAutosGenB028.do` que sigue a «Valoración Riesgo» (prueba real con 0.2.29). */
export const ENCABEZADO_GARANTIAS_CAPITALES_GENERALI = 'GARANTIAS Y CAPITALES OPCIONALES'
/** v0.2.30: ¿el texto visible es la pantalla «Garantías y Capitales opcionales»? PURA. */
export function esPantallaGarantiasCapitalesGenerali(texto: string): boolean {
  return normalizarCatalogo(String(texto ?? '').replace(/\s+/g, ' ')).includes(ENCABEZADO_GARANTIAS_CAPITALES_GENERALI)
}
/** v0.2.30: marca que `JS_IMPORTES_TABLA` pone delante de la etiqueta de una fila marcada/seleccionada. */
export const MARCA_FILA_SELECCIONADA_GENERALI = '[SEL]'
/** v0.2.30: etiquetas extra (solo en la pantalla de garantías): cuota. «Prima neta/total», «recibo», «anual», «a pagar» ya contaban. */
const RE_LINEA_PRECIO_GARANTIAS = regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_cuota), MAYUS)
/** v0.2.30: línea de prima total anual (la que se elige si hay varias). */
const RE_LINEA_TOTAL_ANUAL = regexPalabras(terminosDe(CONCEPTOS_LECTURA.precio_total_anual), MAYUS)

/**
 * Lector TOLERANTE del precio en el texto visible de «Garantías y Resultados» (sin captura de esa pantalla, v0.2.0). Busca
 * líneas con «prima/precio/importe/total/a pagar» (no franquicias, capitales ni valores) y su importe en formato español, en
 * la MISMA línea o en la siguiente (etiqueta y valor en celdas distintas). Manda «total» si lo hay. Un único importe distinto
 * dentro de la horquilla → ese; varios → `varios` (el adaptador PARA con la lista: nunca elige uno); ninguno → `ninguno`.
 * `ignorar`: importes que ya estaban en la pantalla ANTES de pulsar la subpestaña (no son el precio). PURA.
 *
 * v0.2.30: SOLO si el texto es la pantalla «Garantías y Capitales opcionales» (emiAutosGenB028) se acepta además «cuota»; con varios
 * importes se prefiere la línea de prima TOTAL ANUAL y, si aún hay varios, la de la modalidad marcada (`[SEL]`): ese es el precio y
 * las demás van en `avisos`. Fuera de esa pantalla el comportamiento es el de siempre.
 */
export function leerPrecioGenerali(texto: string, ignorar: readonly number[] = []): LecturaPrecioGenerali {
  const garantias = esPantallaGarantiasCapitalesGenerali(texto)
  const lineas = String(texto ?? '').replace(/ /g, ' ').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
  const importesDe = (l: string) => [...l.matchAll(RE_IMPORTE_EN_LINEA)].map((m) => importeEspanolEur(m[0])).filter((n): n is number => n !== null)
  const esLineaPrecio = (n: string) => RE_LINEA_PRECIO.test(n) || (garantias && RE_LINEA_PRECIO_GARANTIAS.test(n))
  const total: { eur: number; linea: string }[] = []
  const otros: { eur: number; linea: string }[] = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!
    const n = normalizarCatalogo(l)
    if (!esLineaPrecio(n) || RE_LINEA_NO_PRECIO.test(n)) continue
    let imps = importesDe(l)
    let linea = l
    // Etiqueta y valor en celdas distintas (v0.2.19): el importe puede estar en una de las 2 líneas siguientes.
    for (let k = 1; k <= 2 && imps.length === 0; k++) {
      const sig = lineas[i + k]
      if (!sig || sig.length > 30 || esLineaPrecio(normalizarCatalogo(sig))) break
      imps = importesDe(sig)
      if (imps.length > 0) linea = `${l} ${sig}`
    }
    for (const eur of imps) {
      if (eur < PRIMA_MIN_GENERALI_EUR || eur > PRIMA_MAX_GENERALI_EUR || ignorar.includes(eur)) continue
      ;(RE_LINEA_TOTAL.test(n) ? total : otros).push({ eur, linea: linea.slice(0, 120) })
    }
  }
  const base = total.length > 0 ? total : otros
  const distintos = [...new Map(base.map((c) => [c.eur, c])).values()]
  if (distintos.length === 0) return { tipo: 'ninguno' }
  if (distintos.length === 1) return { tipo: 'unico', eur: distintos[0]!.eur, linea: distintos[0]!.linea.replace(MARCA_FILA_SELECCIONADA_GENERALI, '').trim() }
  if (garantias) {
    const resumen = (c: { eur: number; linea: string }) => `${c.eur} € («${c.linea.replace(MARCA_FILA_SELECCIONADA_GENERALI, '').trim().slice(0, 50)}»)`
    const elegir = (cs: { eur: number; linea: string }[], motivo: string): LecturaPrecioGenerali | null => {
      const eurs = [...new Set(cs.map((c) => c.eur))]
      if (eurs.length !== 1) return null
      const el = cs[0]!
      const otrosC = distintos.filter((c) => c.eur !== el.eur)
      return { tipo: 'unico', eur: el.eur, linea: el.linea.replace(MARCA_FILA_SELECCIONADA_GENERALI, '').trim(), avisos: [`Varios importes en la pantalla de garantías; elegido ${motivo}. Otros: ${otrosC.map(resumen).join(' · ')}`] }
    }
    const anuales = distintos.filter((c) => RE_LINEA_TOTAL_ANUAL.test(normalizarCatalogo(c.linea)))
    const porAnual = elegir(anuales, 'el de la prima total anual')
    if (porAnual) return porAnual
    const marcados = (anuales.length > 0 ? anuales : distintos).filter((c) => c.linea.includes(MARCA_FILA_SELECCIONADA_GENERALI))
    const porMarca = elegir(marcados, 'el de la modalidad marcada')
    if (porMarca) return porMarca
  }
  return { tipo: 'varios', candidatos: distintos.slice(0, 12) }
}

/**
 * ¿La URL es la llegada al portal del corredor (`CorredorPortal.po`, prueba real 31e76085, v0.2.4)? Tras «ENTRAR» el portal
 * real NO lleva `mediatorCode` en la URL hasta más tarde. FAIL-CLOSED: https, origen EXACTO `www.generali.es`, ruta EXACTA
 * `/arq_genernetPortalFormWeb/CorredorPortal.po`, y si trae `mediatorCode` tiene que ser el de la correduría. PURA.
 */
export function esPortalCorredorGenerali(url: string, codigo: string = MEDIADOR_GENERALI): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.origin !== 'https://www.generali.es' || u.username || u.password) return false
  if (u.pathname !== '/arq_genernetPortalFormWeb/CorredorPortal.po') return false
  return urlConMediador(url, codigo) !== false
}

// ───────────────────────── v0.2.19 · tomador («Interesado / Tomador») + diagnóstico de la pantalla de resultados ─────────────────────────

/** Prefijo de los ids reales del bloque «Interesado / Tomador» de «Datos de Valoración» (inventario del trabajo 304ac3a2). */
export const PREFIJO_ID_INTERESADO_GENERALI = 'reg1063A_personas_interesado_'
/** Campo de texto del «Interesado / Tomador» → sufijo del id real. */
export type CampoInteresadoGenerali = 'nifcif' | 'nombre' | 'papell' | 'sapell' | 'ffnain' | 'ffcain'

/**
 * Qué teclear en el «Interesado / Tomador» (persona FÍSICA). Sin tomador en el portal, «Garantías y Resultados» se queda con el
 * aviso «Es obligatorio informar el tomador» y no hay precio. Solo datos que el riesgo trae (nada se inventa); jurídica → `[]`
 * (sin captura de esa variante: hueco). El NIF va primero (el portal puede autorrellenar al salir del campo). PURA.
 */
export function camposInteresadoGenerali(form: {
  documentoTomador?: string | null
  tomador?: { tipo?: string | null; nombre?: string | null; apellido1?: string | null; apellido2?: string | null; documentoIdentidad?: string | null; fechaNacimiento?: string | null } | null
  datosTomador?: { tipo: string; nombre?: string; apellido1?: string; apellido2?: string | null; fechaNacimiento?: string } | null
  fichaTomador?: { documento?: string | null; fechaNacimiento?: string | null; fechaCarnet?: string | null } | null
  conductor?: { fechaNacimiento?: string | null; fechaCarne?: string | null } | null
}): { campo: CampoInteresadoGenerali; valor: string }[] {
  const dt = form.datosTomador?.tipo === 'fisica' ? form.datosTomador : null
  const t = form.tomador && form.tomador.tipo !== 'juridica' ? form.tomador : null
  if (form.datosTomador?.tipo === 'juridica' || form.tomador?.tipo === 'juridica') return []
  const limpio = (x: string | null | undefined) => {
    const v = String(x ?? '').replace(/\s+/g, ' ').trim()
    return v === '' ? null : v
  }
  const doc = limpio(form.documentoTomador ?? form.tomador?.documentoIdentidad ?? form.fichaTomador?.documento)
  const nac = fechaGenerali(dt?.fechaNacimiento ?? t?.fechaNacimiento ?? form.fichaTomador?.fechaNacimiento ?? form.conductor?.fechaNacimiento)
  const out: { campo: CampoInteresadoGenerali; valor: string | null }[] = [
    { campo: 'nifcif', valor: doc },
    { campo: 'nombre', valor: limpio(dt?.nombre ?? t?.nombre) },
    { campo: 'papell', valor: limpio(dt?.apellido1 ?? t?.apellido1) },
    { campo: 'sapell', valor: limpio(dt?.apellido2 ?? t?.apellido2) },
    { campo: 'ffnain', valor: nac },
    { campo: 'ffcain', valor: fechaGenerali(form.fichaTomador?.fechaCarnet ?? form.conductor?.fechaCarne) },
  ]
  return out.filter((c): c is { campo: CampoInteresadoGenerali; valor: string } => c.valor !== null)
}

/** Avisos de validación del portal («Es obligatorio informar el tomador»…) en el texto visible: líneas «Es obligatorio…». PURA. */
export function avisosObligatorioGenerali(texto: string): string[] {
  const vistos = new Set<string>()
  for (const l of String(texto ?? '').split(/\r?\n/)) {
    const t = l.replace(/\s+/g, ' ').trim()
    if (/^(es obligatori[oa]|falta|debe (informar|indicar)|campo obligatorio)/i.test(t) && t.length <= 120) vistos.add(t)
  }
  return [...vistos].slice(0, 8)
}

/**
 * v0.2.42: estado del cálculo en el marco de «Valoración Riesgo» (`emiAutosGenB028.do`), SIN valores de campos: avisos del bloque `#areaErrores`
 * de Genernet, campos marcados obligatorios («*») que siguen vacíos, botones/enlaces visibles y si el marco seguía cargando.
 */
export interface EstadoCalculoGenerali {
  /** Textos de `#areaErrores li` (p. ej. «El paso anterior no tiene los datos completos», «No se puede calcular con datos incompletos»). */
  avisos: string[]
  /** Etiquetas de los campos obligatorios vacíos del marco a la vista (sin valores). */
  obligatoriosVacios: string[]
  /** `name` de los controles de esos obligatorios vacíos (sin valores): para saber cuáles son decisión de Alberto. */
  nombresVacios?: string[]
  /** Botones/enlaces visibles del marco (rótulos). */
  botones: string[]
  /** ¿Algún marco seguía cargando (`loading.html` visible o `document.readyState` ≠ complete)? null = no se pudo saber. */
  cargando: boolean | null
}

/** v0.2.42: opciones de «Forma de pago a contratar» que el robot puede pedir (texto EXACTO del portal). */
export const FORMAS_PAGO_GENERALI = ['Anual', 'Semestral', 'Trimestral'] as const

/**
 * v0.2.42 (decisión de Alberto, 27/10/2026): forma de pago a elegir. ANUAL por defecto; si el riesgo trae una explícita (`formaPago` o
 * `fraccionamiento`), esa, si es exactamente anual/semestral/trimestral (sin mayúsculas/tildes); otra cosa → `error` (no se adivina). PURA.
 */
export function formaPagoPedidaGenerali(form: unknown): { etiqueta: (typeof FORMAS_PAGO_GENERALI)[number]; porDefecto: boolean } | { error: string } {
  const f = (form ?? {}) as { formaPago?: unknown; fraccionamiento?: unknown }
  const bruto = f.formaPago ?? f.fraccionamiento
  if (bruto === null || bruto === undefined || String(bruto).trim() === '') return { etiqueta: 'Anual', porDefecto: true }
  const t = String(bruto).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const e = FORMAS_PAGO_GENERALI.find((x) => x.toLowerCase() === t)
  return e ? { etiqueta: e, porDefecto: false } : { error: `la forma de pago del riesgo «${String(bruto).slice(0, 30)}» no es ${FORMAS_PAGO_GENERALI.join('/')}` }
}

/** v0.2.42: índice de la opción cuyo texto es EXACTAMENTE `etiqueta` (solo se recortan espacios); -1 si no hay exactamente una. PURA. */
export function opcionExactaGenerali(opciones: readonly string[], etiqueta: string): number {
  const i = opciones.map((o) => String(o ?? '').replace(/\s+/g, ' ').trim()).flatMap((o, k) => (o === etiqueta ? [k] : []))
  return i.length === 1 ? i[0]! : -1
}

/**
 * v0.2.42 (decisión de Alberto): obligatorios de «Garantías y Resultados» que el robot NO decide (por el `name` del control): «Envío e-mail»
 * (`opcEnvio`) y «Verificación del riesgo» (`verifRiesgo`). PURA.
 */
export function decisionesPendientesGenerali(nombres: readonly string[]): string[] {
  const out: string[] = []
  if (nombres.some((n) => /opcEnvio|opcenv/i.test(n))) out.push('Envío e-mail')
  if (nombres.some((n) => /verifRiesgo|zvriep/i.test(n))) out.push('Verificación del riesgo')
  return out
}

/** v0.2.42: ¿los avisos del portal dicen que faltan datos («datos incompletos», «no tiene los datos completos»)? Entonces Generali NO calcula. PURA. */
export function portalDatosIncompletosGenerali(avisos: readonly string[]): boolean {
  return avisos.some((a) => /datos\s+incompletos|no\s+tiene\s+los\s+datos\s+completos|paso\s+anterior\s+no\s+tiene/i.test(a))
}

/** v0.2.42: etiquetas de los campos obligatorios VACÍOS de una pantalla leída (sin «*», saneadas, sin repetir, máx. 12). PURA. */
export function obligatoriosVaciosGenerali(campos: readonly { etiqueta: string; obligatorio: boolean; valor: string }[]): string[] {
  const out: string[] = []
  for (const c of campos) {
    // v0.2.44: un desplegable que sigue en «Seleccione…» está VACÍO (antes contaba como relleno).
    if (!c.obligatorio || (c.valor !== 'vacío' && !/^seleccione\b/i.test(c.valor))) continue
    const e = sanearFragmentoGenerali(String(c.etiqueta ?? '').replace(/\*\s*$/, '')).trim().slice(0, 60)
    if (e && !out.includes(e)) out.push(e)
    if (out.length >= 12) break
  }
  return out
}

/**
 * v0.2.42: bloque del atasco con el estado del cálculo (va JUSTO tras «Recalcular», el runner corta a 2000). Avisos y etiquetas pasan por
 * `sanearFragmentoGenerali`; nunca hay valores de campos. `vaciosValoracion` = obligatorios vacíos de «Datos de Valoración» al salir de ella. PURA.
 */
export function resumenEstadoCalculoGenerali(e: EstadoCalculoGenerali | null, vaciosValoracion: readonly string[], max = 600, avisosValoracion: readonly string[] = []): string {
  const s = (x: string, n: number) => sanearFragmentoGenerali(x).trim().slice(0, n)
  const avisos = [...new Set((e?.avisos ?? []).map((a) => s(a, 120)).filter(Boolean))].slice(0, 6)
  const partes: string[] = []
  partes.push(`Avisos del portal (areaErrores): ${avisos.length ? avisos.map((a) => `«${a}»`).join(' · ') : '(ninguno visible)'}`)
  if (portalDatosIncompletosGenerali(avisos)) partes.push('el portal da los datos por INCOMPLETOS y no calcula hasta completarlos')
  partes.push(`obligatorios vacíos en «Datos de Valoración»: ${vaciosValoracion.length ? vaciosValoracion.map((x) => s(x, 60)).join(' · ') : '(ninguno detectado)'}`)
  // v0.2.44: avisos que el portal pintaba en «Datos de Valoración» al salir de ella (solo textos de la interfaz).
  const avV = [...new Set(avisosValoracion.map((a) => s(a, 100)).filter(Boolean))].slice(0, 4)
  if (avV.length) partes.push(`avisos en «Datos de Valoración»: ${avV.map((a) => `«${a}»`).join(' · ')}`)
  const vacios = (e?.obligatoriosVacios ?? []).map((x) => s(x, 60)).filter(Boolean)
  partes.push(`obligatorios vacíos en «Garantías y Resultados»: ${vacios.length ? vacios.join(' · ') : '(ninguno detectado)'}`)
  partes.push(`cargando: ${e?.cargando === true ? 'sí' : e?.cargando === false ? 'no' : '¿?'}`)
  const botones = (e?.botones ?? []).map((x) => s(x, 30)).filter(Boolean)
  partes.push(`botones/enlaces del marco: ${botones.length ? botones.join(' · ') : '(ninguno)'}`)
  return `Estado del cálculo: ${partes.join('; ')}`.slice(0, max)
}

/** Quita lo que puede ser dato personal de un fragmento de texto (NIF/NIE/CIF, fechas, correos, teléfonos, matrículas, CP). PURA. */
export function sanearFragmentoGenerali(t: string): string {
  return String(t ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]')
    .replace(/\b[XYZ]?\d{7,8}[A-Z]\b/gi, '[doc]')
    .replace(/\b[A-Z]\d{7}[A-Z0-9]\b/gi, '[doc]')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, '[fecha]')
    .replace(/\b\d{4}\s?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi, '[mat]')
    .replace(/\b[6-9]\d{8}\b/g, '[tel]')
    .replace(/\b\d{5}\b(?![.,]\d)/g, '[n]')
}

/**
 * Fragmentos del texto visible alrededor de cada importe «€» (±45 caracteres, saneados, sin repetir, máx. `max`): para que el
 * atasco diga QUÉ hay en la pantalla de resultados sin volcar datos personales. PURA.
 */
export function fragmentosImportesGenerali(texto: string, max = 8): string[] {
  const t = String(texto ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ')
  const out: string[] = []
  for (const m of t.matchAll(/€|\beur(?:os)?\b/gi)) {
    const f = sanearFragmentoGenerali(t.slice(Math.max(0, (m.index ?? 0) - 45), (m.index ?? 0) + 8)).trim()
    if (f && !out.includes(f)) out.push(f)
    if (out.length >= max) break
  }
  return out
}

// ───────────────────────── v0.2.27 · volcado de «Garantías y Resultados» (pestañas, tablas con «€», botones) ─────────────────────────

/** Volcado SANEADO de un marco tras pulsar «Garantías y Resultados»: pestañas (¿marcada?), tablas (cabeceras + filas con «€») y botones. */
export type VolcadoMarcoResultadosGenerali = {
  ruta: string
  pestanas: { texto: string; marcada: boolean }[]
  tablas: { cabeceras: string[]; filas: number; filasEuro: string[][] }[]
  botones: string[]
}

/** Pestañas del bloque «Valoración Riesgo» cuyo estado interesa al diagnóstico. */
export const PESTANAS_VALORACION_GENERALI = Object.freeze(['Valoración Riesgo', 'Datos de Valoración', 'Garantías y Resultados'] as const)

/**
 * Resumen de una línea del volcado (saneado, sin datos personales): «ruta · pestañas(*=marcada) · tablas[cabeceras | filas con €] ·
 * botones». Dice si el clic en «Garantías y Resultados» cambió la pantalla o no. PURA.
 */
export function resumenVolcadoResultadosGenerali(v: readonly VolcadoMarcoResultadosGenerali[], max = 600): string {
  const partes = v.map((m) => {
    const pest = m.pestanas.map((p) => `${sanearFragmentoGenerali(p.texto)}${p.marcada ? '*' : ''}`).join(',')
    const tabs = m.tablas.map((t) => `[${t.cabeceras.map(sanearFragmentoGenerali).join('|')}] ${t.filas}f${t.filasEuro.length ? ` €: ${t.filasEuro.map((f) => f.map(sanearFragmentoGenerali).join('|')).join(' ; ')}` : ''}`).join(' ')
    const bot = m.botones.map(sanearFragmentoGenerali).join(',')
    return `${m.ruta.split(';')[0]!.split('/').slice(-1)[0]} · pestañas ${pest || '—'} · tablas ${tabs || 'ninguna'} · botones ${bot || '—'}`
  })
  const t = partes.join(' || ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ───────────────────────── v0.2.30 · diagnóstico de tablas e importes del marco (sin datos personales) ─────────────────────────

/** Lo que lee el navegador de un marco: cabeceras de las tablas visibles e importes con su etiqueta de fila/celda. */
export type DiagnosticoImportesMarcoGenerali = { cabeceras: string[][]; importes: { etiqueta: string; importe: string }[] }
/** Vocabulario de etiquetas de dinero/garantías que SÍ se enseñan; cualquier otra etiqueta (podría ser un nombre) sale como «(otra)». */
// 26/10/2026: la lista blanca sale de `vocabulario.ts` (concepto de lectura `dinero_diagnostico`).
const RE_VOCABULARIO_IMPORTE_GENERALI = regexPalabras(terminosDe(CONCEPTOS_LECTURA.dinero_diagnostico), { mayus: true })
const RE_ETIQUETA_LIMPIA_GENERALI = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .\/()%-]{1,40}$/

/** Etiqueta saneada: solo letras, corta y del vocabulario de dinero/garantías; si no, «(otra)». PURA. */
export function etiquetaImporteSegura(t: string): string {
  const x = String(t ?? '').replace(/[ \s]+/g, ' ').trim()
  return RE_ETIQUETA_LIMPIA_GENERALI.test(x) && RE_VOCABULARIO_IMPORTE_GENERALI.test(normalizarCatalogo(x)) ? x : '(otra)'
}

/**
 * Resumen de una línea de las tablas (cabeceras) y de los textos con importe del marco: «Tablas: [Cab|Cab] · Importes: Etiqueta 1.234,56 € ; …».
 * Máx. `maxEntradas` importes, etiquetas SOLO del vocabulario de dinero (nunca nombres, NIF, matrículas ni fechas: las cabeceras/etiquetas con
 * cifras o fuera del vocabulario salen como «(otra)») y el importe solo si tiene forma de importe. Truncado a `max`. PURA.
 */
export function resumenDiagnosticoImportesGenerali(d: readonly DiagnosticoImportesMarcoGenerali[], max = 450, maxEntradas = 10): string {
  const tablas = d.flatMap((m) => m.cabeceras).slice(0, 4).map((c) => `[${c.slice(0, 8).map(etiquetaImporteSegura).join('|')}]`)
  const vistos = new Set<string>()
  const imps: string[] = []
  for (const m of d) {
    for (const i of m.importes) {
      const importe = String(i.importe ?? '').replace(/[ \s]+/g, ' ').trim()
      if (!/^€?\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s?€?$|^€?\s?\d+(?:,\d{1,2})?\s?€?$/.test(importe) || !/[,€]/.test(importe)) continue
      const e = `${etiquetaImporteSegura(i.etiqueta)} ${importe}`
      if (vistos.has(e)) continue
      vistos.add(e)
      imps.push(e)
      if (imps.length >= maxEntradas) break
    }
    if (imps.length >= maxEntradas) break
  }
  const t = `Tablas: ${tablas.join(' ') || 'ninguna'} · Importes: ${imps.join(' ; ') || 'ninguno'}`
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ───────────────────────── v0.2.31 · tabla «Modalidades de Seguro» (Recibo Anual / Prima Anualidad) ─────────────────────────

/** Fila de la tabla de modalidades: nombre de producto, ¿marcada?, y los valores crudos (texto de celda primero, luego value de inputs/selects). */
/** `porFila` (v0.2.34): la tabla no dejó localizar las columnas; `recibo` trae las cifras con forma de importe de la fila, de izquierda a derecha. */
export type FilaModalidadGenerali = { modalidad: string; marcada: boolean; recibo: string[]; prima: string[]; porFila?: boolean }
/** Lo que lee el navegador de la tabla de modalidades de un marco (más los botones del marco, para el diagnóstico). */
export type VolcadoModalidadesGenerali = { encontrada: boolean; filas: FilaModalidadGenerali[]; botones: { texto: string; id: string; value: string }[]; /** v0.2.34: forma de la tabla (nº de celdas y tipo de cada una, sin textos). */ forma?: string }

/** «1.234,56» · «1234,56» · «1234.56» · «1,234.56» (con o sin «€») → número. Un entero solo cuenta con «€». `null` si no es un importe. PURA. */
export function importeFlexibleEur(texto: string): number | null {
  const t = String(texto ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const m = /^(?:€\s*)?([\d.,]+)\s*(€|eur(?:os)?)?$/i.exec(t)
  if (!m) return null
  const num = m[1]!
  const conEuro = /€|eur/i.test(t)
  let n: string | null = null
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(num)) n = num.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(num)) n = num.replace(/,/g, '')
  else if (/^\d+[,.]\d{1,2}$/.test(num)) n = num.replace(',', '.')
  else if (/^\d+$/.test(num) && conEuro) n = num
  if (n === null) return null
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

/** 1234.5 → «1.234,50 €». PURA. */
export function formatoEurGenerali(eur: number): string {
  const [e, d] = eur.toFixed(2).split('.')
  return `${e!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`
}

/** v0.2.34: aviso cuando el importe sale de la primera cifra de la fila y no de la columna «Recibo Anual» localizada. */
const AVISO_POR_FILA_GENERALI = 'Importe tomado de la primera cifra de la fila de la modalidad (columnas de la tabla no localizadas): revisar en la emisión'

/**
 * Precio desde la tabla de modalidades: «Recibo Anual» de la modalidad MARCADA; sin marcada y con varias filas con importe, la más
 * barata y las demás como aviso «Otras modalidades: X 1.234,56 €; …». Importes fuera de la horquilla de una prima (o en `ignorar`)
 * no cuentan; todas vacías → `ninguno`. Dos marcadas con importes distintos → `varios` (no se elige a ciegas). PURA.
 */
export function leerModalidadesGenerali(filas: readonly FilaModalidadGenerali[], ignorar: readonly number[] = []): LecturaPrecioGenerali {
  const nombre = (f: FilaModalidadGenerali) => sanearFragmentoGenerali(f.modalidad).slice(0, 40) || '(sin nombre)'
  const cands: { eur: number; modalidad: string; marcada: boolean; porFila: boolean }[] = []
  for (const f of filas) {
    let eur: number | null = null
    for (const v of f.recibo) {
      const x = importeFlexibleEur(v)
      if (x !== null && x >= PRIMA_MIN_GENERALI_EUR && x <= PRIMA_MAX_GENERALI_EUR && !ignorar.includes(x)) {
        eur = x
        break
      }
    }
    if (eur !== null) cands.push({ eur, modalidad: nombre(f), marcada: f.marcada, porFila: f.porFila === true })
  }
  if (cands.length === 0) return { tipo: 'ninguno' }
  const marcadas = cands.filter((c) => c.marcada)
  if (marcadas.length > 0) {
    const eurs = [...new Set(marcadas.map((c) => c.eur))]
    if (eurs.length > 1) return { tipo: 'varios', candidatos: marcadas.map((c) => ({ eur: c.eur, linea: `${c.modalidad} Recibo Anual` })) }
    return { tipo: 'unico', eur: marcadas[0]!.eur, linea: `${marcadas[0]!.modalidad} Recibo Anual`, ...(marcadas[0]!.porFila ? { avisos: [AVISO_POR_FILA_GENERALI] } : {}) }
  }
  const orden = [...cands].sort((a, b) => a.eur - b.eur)
  const el = orden[0]!
  const otras = orden.slice(1).filter((c) => c.eur !== el.eur || c.modalidad !== el.modalidad)
  const avisos = [`Modalidad no marcada en la tabla: se toma la más barata (${el.modalidad})`]
  if (el.porFila) avisos.push(AVISO_POR_FILA_GENERALI)
  if (otras.length > 0) avisos.push(`Otras modalidades: ${otras.map((c) => `${c.modalidad} ${formatoEurGenerali(c.eur)}`).join('; ')}`)
  return { tipo: 'unico', eur: el.eur, linea: `${el.modalidad} Recibo Anual`, avisos }
}

/** Contenido crudo de una celda de importe, saneado: solo dígitos/separadores/€ (máx. 20); con letras «(texto)»; vacío «∅». PURA. */
export function crudoImporteSeguroGenerali(valores: readonly string[]): string {
  const vistos: string[] = []
  for (const v of valores) {
    const x = String(v ?? '').replace(/[ \s]+/g, ' ').trim()
    const s = x === '' ? '∅' : /^[\d.,\s€]*(?:eur(?:os)?)?$/i.test(x) ? x.slice(0, 20) : '(texto)'
    if (!vistos.includes(s)) vistos.push(s)
  }
  const sin = vistos.length > 1 ? vistos.filter((s) => s !== '∅') : vistos
  return sin.join('+') || '∅'
}

/**
 * Diagnóstico de la tabla de modalidades: por fila nombre (saneado), ¿marcada? y el crudo de «Recibo Anual» (RA) y «Prima Anualidad» (PA),
 * más los botones del marco (texto/id/value). Sin datos personales. Truncado a `max`. PURA.
 */
export function resumenModalidadesGenerali(v: VolcadoModalidadesGenerali | null, max = 600): string {
  if (!v || !v.encontrada) return 'Modalidades: tabla no localizada'
  const filas = v.filas.slice(0, 8).map((f) => `«${sanearFragmentoGenerali(f.modalidad).slice(0, 30) || '(sin nombre)'}»${f.marcada ? '[marcada]' : ''} RA=${crudoImporteSeguroGenerali(f.recibo)} PA=${crudoImporteSeguroGenerali(f.prima)}`)
  const botones = v.botones.slice(0, 10).map((b) => {
    const t = sanearFragmentoGenerali(b.texto).slice(0, 20)
    const id = sanearFragmentoGenerali(b.id).slice(0, 24)
    const val = sanearFragmentoGenerali(b.value).slice(0, 20)
    return [t, id && `#${id}`, val && val !== t ? `v=${val}` : ''].filter(Boolean).join(' ')
  })
  const base = `Modalidades (${v.filas.length}f): ${filas.join(' ; ') || `sin filas${v.forma ? ` [forma: ${v.forma.replace(/[^\w\s:;,\[\]]/g, '').slice(0, 160)}]` : ''}`}`
  const bot = ` · Botones: ${botones.join(', ') || '—'}`
  const t = base + bot
  if (t.length <= max) return t
  // Si no cabe, se recortan primero los botones y después las filas.
  const rec = base.length >= max ? base : `${base}${bot}`
  return `${rec.slice(0, max - 1)}…`
}

/** v0.2.35: por marco, URL sin query, nº de tablas, cuántas contienen «Recibo Anual»/«Prima Anualidad» y la estructura saneada de la tabla de modalidades. */
export type DiagnosticoModalidadesMarcoGenerali = {
  url: string; tablas: number; conRecibo: number; estructura: string
  /** v0.2.37: segunda tabla del marco (clase, filas del primer tbody, filas totales, celdas de las primeras filas, celdas con forma de importe). */
  segunda?: { clase: string; filasTbody: number; filas: number; celdas: string; importes: number } | null
  /** v0.2.37: nº de tr/tbody con id «gridmodseg» fuera del thead, y los primeros ids. */
  gridFuera?: number; gridIds?: string
}

/** Resumen del diagnóstico ampliado de modalidades: «Marcos N: [i] ruta tablas=T recibo=R estructura: …». Saneado y truncado a `max`. PURA. */
export function resumenDiagnosticoModalidadesGenerali(d: readonly DiagnosticoModalidadesMarcoGenerali[], max = 700): string {
  const base = d.map((m, i) => {
    const ruta = sanearFragmentoGenerali(String(m.url ?? '').split(/[?#;]/)[0]!.replace(/^https?:\/\/[^/]+/, '')).slice(-60)
    const seg = m.segunda ? ` 2ª[${sanearFragmentoGenerali(m.segunda.clase).slice(0, 20) || 'sin-clase'} tbody=${m.segunda.filasTbody} filas=${m.segunda.filas} celdas=${sanearFragmentoGenerali(m.segunda.celdas).slice(0, 14)} imp=${m.segunda.importes}]` : ''
    const grid = (m.gridFuera ?? 0) > 0 ? ` gridmodseg-fuera=${m.gridFuera}${m.gridIds ? `(${sanearFragmentoGenerali(m.gridIds).slice(0, 40)})` : ''}` : ''
    return { cab: `[${i}] ${ruta || '/'} tablas=${m.tablas} con-Recibo/Prima=${m.conRecibo}${seg}${grid}`, est: m.estructura ? sanearFragmentoGenerali(m.estructura).slice(0, 600) : '' }
  })
  const armar = (tope: number): string => `Marcos (${d.length}): ${base.map((b) => b.cab + (b.est && tope > 0 ? ` estructura: ${b.est.slice(0, tope)}` : '')).join(' | ') || 'ninguno'}`
  // v0.2.36: primero se recorta la ESTRUCTURA (lo menos importante); la lista de marcos con ruta y tablas va entera mientras quepa.
  for (const tope of [600, 400, 250, 120, 0]) {
    const t = armar(tope)
    if (t.length <= max) return t
  }
  const t = armar(0)
  return t.slice(0, Math.max(0, max - 1)) + '…'
}

// ───────────────────────── v0.2.28 · inventario de controles de navegación de TODOS los marcos ─────────────────────────

/** Control de navegación leído (botón/enlace/imagen con acción). Solo etiquetas y ids: nunca valores de campos de datos. */
export type ControlNavegacionGenerali = { tag: string; tipo: string; id: string; name: string; texto: string; visible: boolean }
/** Marco con sus controles de navegación y pestañas (`activa`: marcada como seleccionada). */
export type NavegacionMarcoGenerali = { marco: string; ruta: string; pestanas: { texto: string; activa: boolean }[]; controles: ControlNavegacionGenerali[] }

/**
 * Resumen saneado y truncado: «marco(ruta) · pestañas(*=activa) · tag:tipo#id/name «texto» (v|o)». PURA. `v` = visible, `o` = oculto.
 * Los controles visibles van primero (son los pulsables).
 */
export function resumenNavegacionGenerali(nav: readonly NavegacionMarcoGenerali[], max = 600): string {
  const partes = nav.map((m) => {
    const pest = m.pestanas.map((p) => `${sanearFragmentoGenerali(p.texto).slice(0, 40)}${p.activa ? '*' : ''}`).join(',')
    const ord = [...m.controles].sort((a, b) => Number(b.visible) - Number(a.visible))
    const ctl = ord.map((c) => `${c.tag}${c.tipo ? `:${c.tipo}` : ''}${c.id ? `#${c.id.slice(0, 30)}` : ''}${c.name && c.name !== c.id ? `/${c.name.slice(0, 20)}` : ''} «${sanearFragmentoGenerali(c.texto).slice(0, 30)}» ${c.visible ? 'v' : 'o'}`).join('; ')
    return `${sanearFragmentoGenerali(m.marco || '(sin nombre)').slice(0, 20)}(${m.ruta.split(/[?;]/)[0]!.split('/').slice(-1)[0]}) · pestañas ${pest || '—'} · ${ctl || 'sin controles'}`
  })
  const t = partes.join(' || ')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ───────────────────────── v0.2.20 · «Personas» (pestaña del tomador) + inventario saneado del bloque ─────────────────────────

/** Texto EXACTO de la pestaña (botón) que muestra «Personas que intervienen › Interesado / Tomador» (inventario del trabajo 304ac3a2). */
export const PESTANA_PERSONAS_GENERALI = 'Personas'
/** Prefijo de los ids de todo el bloque de personas (roles, interesado, domicilio). */
export const PREFIJO_ID_PERSONAS_GENERALI = 'reg1063A_personas_'

/** Estado de un control del bloque de personas (sin valores: solo si lo tiene). */
export type ControlPersonasGenerali = {
  id: string
  tag: string
  tipo: string
  visible: boolean
  habilitado: boolean
  editable: boolean
  vacio: boolean
  /** Solo botones/enlaces: su rótulo (saneado al resumir). */
  texto?: string
  /** v0.2.21 · opciones/casillas: ¿está marcado? (nunca su valor). */
  marcado?: boolean
  /** v0.2.21 · desplegables de `roles_*` (TOMADOR, NO HAY…): texto de la opción elegida (catálogo, no dato personal). */
  opcion?: string
}

/** Por qué un campo del tomador no se pudo rellenar (o `ok`). PURA. */
export function motivoCampoInteresadoGenerali(c: { existe: boolean; visible: boolean; habilitado: boolean; editable: boolean; vacio: boolean }): 'ok' | 'no_existe' | 'oculto' | 'deshabilitado' | 'solo_lectura' | 'con_valor' {
  if (!c.existe) return 'no_existe'
  if (!c.visible) return 'oculto'
  if (!c.habilitado) return 'deshabilitado'
  if (!c.editable) return 'solo_lectura'
  if (!c.vacio) return 'con_valor'
  return 'ok'
}

/**
 * Resumen del bloque de personas para el atasco: solo CONTROLES (los contenedores `div/fieldset` no cuentan: en 0.2.20 llenaban el tope y
 * los campos del interesado salían como «no_existe»), sufijo del id, tipo y banderas, nunca valores. Radios del mismo id se juntan
 * («×2, marcados 0»); en los desplegables de roles va la opción elegida; rótulos de botones saneados. PURA.
 */
export function resumenPersonasGenerali(els: readonly ControlPersonasGenerali[], max = 1_100): string {
  const controles = els.filter((e) => !/^(div|fieldset|span|label|td|tr|table|form)$/i.test(e.tag))
  if (controles.length === 0) return els.length === 0 ? 'ningún control con id reg1063A_personas_*' : 'solo contenedores, ningún control'
  const sufijoDe = (id: string) => (id.startsWith(PREFIJO_ID_PERSONAS_GENERALI) ? id.slice(PREFIJO_ID_PERSONAS_GENERALI.length) : id)
  const vistos = new Set<string>()
  const partes: string[] = []
  for (const e of controles) {
    if (e.marcado !== undefined) {
      if (vistos.has(e.id)) continue
      vistos.add(e.id)
      const grupo = controles.filter((x) => x.id === e.id)
      partes.push(`${sufijoDe(e.id)} [${e.tipo}×${grupo.length}, marcados ${grupo.filter((x) => x.marcado).length}${grupo.some((x) => !x.visible) ? ', oculto' : ''}${grupo.some((x) => !x.habilitado) ? ', deshab' : ''}]`)
      continue
    }
    const banderas = [e.visible ? null : 'oculto', e.habilitado ? null : 'deshab', e.editable ? null : 'ro'].filter((x) => x !== null).join(',')
    const rotulo = e.texto ? ` «${sanearFragmentoGenerali(e.texto).slice(0, 40)}»` : ''
    const opcion = e.opcion ? ` =«${sanearFragmentoGenerali(e.opcion).slice(0, 30)}»` : ''
    const estado = /button|submit|image/i.test(e.tipo) || e.tag.toLowerCase() === 'a' ? '' : e.vacio ? ' vacío' : ' con valor'
    partes.push(`${sufijoDe(e.id)} [${e.tag}/${e.tipo}${banderas ? `,${banderas}` : ''}]${rotulo}${opcion}${estado}`)
  }
  const t = partes.join('; ')
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Qué pasó con cada campo del tomador que el riesgo trae (`campo:motivo`, sin valores) cruzando con los controles leídos. PURA. */
export function motivosInteresadoGenerali(campos: readonly { campo: string }[], controles: readonly ControlPersonasGenerali[]): string {
  if (campos.length === 0) return 'el riesgo no trae datos del tomador (o es persona jurídica)'
  return campos
    .map(({ campo }) => {
      const c = controles.find((x) => x.id === `${PREFIJO_ID_INTERESADO_GENERALI}${campo}`)
      return `${campo}:${motivoCampoInteresadoGenerali({ existe: !!c, visible: !!c?.visible, habilitado: !!c?.habilitado, editable: !!c?.editable, vacio: !!c?.vacio })}`
    })
    .join(', ')
}

// ───────────────────────── v0.2.22 · botón «Personas» (buscador de personas) del tomador ─────────────────────────

/** Id real del botón «Personas» que abre el buscador de personas (inventario del trabajo 304ac3a2). */
export const ID_BOTON_PERSONAS_GENERALI = 'reg1063A_personas_roles_lnkPers'
/** Rótulo (normalizado) del botón que lanza la búsqueda dentro del buscador de personas. */
export const RE_BUSCAR_PERSONA_GENERALI = /^(buscar|consultar|buscar persona|consultar persona|buscar personas|consultar personas|busqueda|consulta|buscar cliente|buscar por documento|lupa)$/
/** Rótulos (normalizados) que delatan una pantalla de ALTA de persona: ahí no se crea nada. */
export const RE_ALTA_PERSONA_GENERALI = /^(alta|nuevo|nueva persona|nueva|crear|crear persona|dar de alta|alta de persona|alta persona|nuevo cliente)$/
/** Rótulos (normalizados) del control que elige una fila del resultado. */
export const RE_ELEGIR_FILA_GENERALI = /^(seleccionar|elegir|seleccion|sel|escoger|seleccionar persona)$/

/** Rótulo (normalizado) de la pestaña que lleva a la SELECCIÓN/búsqueda de personas dentro de la pantalla «Interesado / Tomador» (v0.2.23). */
export const RE_PESTANA_SELECCION_PERSONAS_GENERALI = /^seleccion personas( que intervienen)?$/

/** URL sin query, hash ni `;jsessionid` (nunca datos): `host/ruta`. `about:blank` se deja tal cual. PURA. */
export function urlSinDatosGenerali(url: string | null | undefined): string {
  const t = String(url ?? '')
  try {
    const u = new URL(t)
    if (!u.host) return t.split(/[?#]/)[0]!.slice(0, 90)
    return `${u.host}${u.pathname}`.replace(/;[^/]*/g, '').slice(0, 90)
  } catch {
    return t.split(/[?#]/)[0]!.replace(/;.*/, '').slice(0, 90)
  }
}

/** Índice compacto de TODOS los marcos vistos (rama, URL sin datos, nombre y nº de controles), sin vídeos. Tope `max` marcos. PURA. */
export function indiceMarcosGenerali(marcos: readonly { rama: string; url: string; nombre: string | null; controles: number }[], max = 8): string {
  const utiles = marcos.filter((m) => !/vimeo/i.test(m.url) && (m.controles > 0 || m.rama !== 'capa'))
  const partes = utiles.slice(0, max).map((m) => `${m.rama} ${urlSinDatosGenerali(m.url).replace(/^www\.generali\.es\//, '')}${m.nombre ? `#${sanearFragmentoGenerali(m.nombre).slice(0, 30)}` : ''} (${m.controles})`)
  return `${partes.join(' ; ') || 'sin marcos'}${utiles.length > max ? ` ; +${utiles.length - max}` : ''}`
}

/** Minúsculas, sin tildes ni espacios sobrantes. PURA. */
export function normalizarRotuloGenerali(t: string | null | undefined): string {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.:]+$/g, '').replace(/\s+/g, ' ').trim()
}

/** Documento comparable: mayúsculas, solo letras y dígitos. PURA. */
export function documentoNormalizadoGenerali(t: string | null | undefined): string {
  return String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** ¿Alguna celda de la fila ES exactamente el documento buscado? (igualdad de celda, no subcadena). PURA. */
export function filaCoincideDocumentoGenerali(celdas: readonly string[], documento: string): boolean {
  const d = documentoNormalizadoGenerali(documento)
  return d !== '' && celdas.some((c) => documentoNormalizadoGenerali(c) === d)
}

/** Control visible de la ventana/capa que abrió «Personas» (sin valores: solo tipo, id y rótulo de etiqueta/botón). */
export type ControlAbiertoGenerali = { tag: string; tipo: string; id: string; rotulo: string; ro: boolean }

/** Inventario compacto y SANEADO de lo que abrió «Personas»: etiquetas/ids/tipos, nunca valores. Primero lo pulsable y las cabeceras (lo que delata el buscador), después los campos. Tope `max`. PURA. */
export function resumenControlesAbiertoGenerali(controles: readonly ControlAbiertoGenerali[], filas: number, max = 650): string {
  const fmt = (c: ControlAbiertoGenerali) => {
    const id = c.id.startsWith(PREFIJO_ID_PERSONAS_GENERALI) ? c.id.slice(PREFIJO_ID_PERSONAS_GENERALI.length) : c.id
    const rot = c.rotulo ? ` «${sanearFragmentoGenerali(c.rotulo).slice(0, 60)}»` : ''
    return `${c.tag}/${c.tipo}${c.ro ? ',ro' : ''}${id ? `#${sanearFragmentoGenerali(id).slice(0, 40)}` : ''}${rot}`
  }
  const esAccion = (c: ControlAbiertoGenerali) => ['a', 'button', 'img', 'th'].includes(c.tag) || ['button', 'submit', 'image', 'reset'].includes(c.tipo)
  const partes = [...controles.filter(esAccion), ...controles.filter((c) => !esAccion(c))].map(fmt)
  const t = `${partes.join('; ') || 'sin controles visibles'}; filas:${filas}`
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ───────────────────────── v0.2.25 · «Interesado / Tomador › Datos personas» (emiAutosGenB028.do): alta del tomador ─────────────────────────
// Prueba real 0.2.24: «Personas» navega el marco `mainFrame` a `emiAutosGenB028.do`, pestaña «Datos personas», SIN buscador. Controles reales:
// select#personas_intere_ynidcl (tipo de documento), #personas_intere_nifcif, _nombre, _papell, _sapell, select _ysexo, _ffnain (nacimiento),
// _ffcain (carné), select _ycarnc (tipo de carné), select _pnacld (nacionalidad), _yemail, _movtom, «Volver» (#cancelar) y «Confirmar» (#confirmar).
// Alberto (26/10/2026) AUTORIZA rellenar los VACÍOS con los datos del riesgo y pulsar ESE «Confirmar» (puerta acotada en guard.ts). Nada más.

/** Último segmento EXACTO de la ruta del marco «Interesado / Tomador» (sin `;jsessionid`). */
export const PAGINA_DATOS_PERSONAS_GENERALI = 'emiAutosGenB028.do'
/** Prefijo de los ids de la pestaña «Datos personas». */
export const PREFIJO_ID_DATOS_PERSONAS_GENERALI = 'personas_intere_'
/** Id del único «Confirmar» autorizado (el de «Datos personas»). */
export const ID_CONFIRMAR_DATOS_PERSONAS_GENERALI = 'confirmar'
/** Texto EXACTO de la pestaña activa exigida. */
export const PESTANA_DATOS_PERSONAS_GENERALI = 'Datos personas'

/** ¿`url` es la del marco «Interesado / Tomador» de www.generali.es? Origen exacto y último segmento `emiAutosGenB028.do`. PURA. */
export function urlDatosPersonasGenerali(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url ?? ''))
    if (u.origin !== 'https://www.generali.es' || u.username || u.password) return false
    const ultimo = u.pathname.split('/').pop() ?? ''
    return ultimo.split(';')[0] === PAGINA_DATOS_PERSONAS_GENERALI
  } catch {
    return false
  }
}

/** Pestaña leída del DOM: `activa` = lleva marca explícita (aria-selected/aria-current o clase de activa/seleccionada en ella o en sus 2 ancestros); `false` = sin marca. */
export type PestanaPersonasLeida = { tipo: 'datos' | 'seleccion'; activa: boolean }

/** Rótulo de pestaña → tipo (texto EXACTO normalizado). PURA. */
export function tipoPestanaPersonasGenerali(rotulo: string | null | undefined): 'datos' | 'seleccion' | null {
  const t = normalizarRotuloGenerali(rotulo)
  if (t === normalizarRotuloGenerali(PESTANA_DATOS_PERSONAS_GENERALI)) return 'datos'
  if (RE_PESTANA_SELECCION_PERSONAS_GENERALI.test(t)) return 'seleccion'
  return null
}

/**
 * ¿La pestaña ACTIVA es «Datos personas»? PURA. Exige la pestaña «Datos personas» (exactamente una). Con marca explícita en alguna pestaña,
 * vale solo si la marcada es «Datos personas» (y ninguna «Selección…» lo está). Sin marca en ninguna (el portal no la pinta en el DOM),
 * se infiere del CONTENIDO: el campo NIF de «Datos personas» está visible. Cualquier otra cosa → no.
 */
export function pestanaDatosPersonasActivaGenerali(pestanas: readonly PestanaPersonasLeida[], nifVisible: boolean): { ok: true; por: 'marca' | 'contenido' } | { ok: false; motivo: string } {
  // v0.2.26: el portal real repite el enlace «Datos personas» (uno con `current` en su CONTENEDOR) y marca «Selección personas…» con `current`
  // en el propio enlace (nivel de menú, no subpestaña). Basta con que ALGÚN «Datos personas» esté marcado; la marca de «Selección» se ignora.
  const datos = pestanas.filter((p) => p.tipo === 'datos')
  if (datos.length === 0) return { ok: false, motivo: `pestañas «${PESTANA_DATOS_PERSONAS_GENERALI}» visibles: 0 (hace falta al menos una)` }
  if (datos.some((p) => p.activa)) return { ok: true, por: 'marca' }
  if (pestanas.some((p) => p.activa)) return { ok: false, motivo: 'la pestaña marcada como activa no es «Datos personas»' }
  return nifVisible ? { ok: true, por: 'contenido' } : { ok: false, motivo: 'sin pestaña marcada y sin el NIF de «Datos personas» visible' }
}

/** Documento → tipo para el desplegable: DNI (8 cifras + letra) = `nif`; NIE (X/Y/Z + 7 cifras + letra) = `nie`; otro (CIF, pasaporte) = `null`. PURA. */
export function tipoDocumentoGenerali(doc: string | null | undefined): 'nif' | 'nie' | null {
  const d = documentoNormalizadoGenerali(doc)
  if (/^\d{8}[A-Z]$/.test(d)) return 'nif'
  if (/^[XYZ]\d{7}[A-Z]$/.test(d)) return 'nie'
  return null
}

/** ¿La opción puesta de un `<select>` es «vacía» (sin valor o un rótulo de «seleccione»)? PURA. */
export function opcionSelectVaciaGenerali(o: { valor: string; texto: string } | null | undefined): boolean {
  if (!o) return true
  if (String(o.valor ?? '').trim() === '') return true
  const t = normalizarRotuloGenerali(o.texto)
  return t === '' || /^-+$/.test(t) || /^(seleccion[ae]|elija|elegir|escoja)\b/.test(t)
}

type Opcion = { valor: string; texto: string }
const unico = (idx: number[]): number | null => (idx.length === 1 ? idx[0]! : null)
const indicesDe = (ops: readonly Opcion[], f: (t: string, v: string) => boolean): number[] =>
  ops.map((o, i) => (!opcionSelectVaciaGenerali(o) && f(normalizarRotuloGenerali(o.texto), normalizarRotuloGenerali(o.valor)) ? i : -1)).filter((i) => i >= 0)

/**
 * Opción del «Tipo de documento» para un DNI (`nif`) o un NIE (`nie`). Vale la ÚNICA opción que nombra ese tipo (NIF/DNI o NIE) y no es de
 * empresa (CIF, jurídica); si hay varias, la única cuyo rótulo es EXACTAMENTE el tipo. Ninguna o ambigua → `null` (no se adivina). PURA.
 */
export function opcionTipoDocumentoGenerali(opciones: readonly Opcion[], tipo: 'nif' | 'nie'): number | null {
  const re = tipo === 'nif' ? /\b(nif|dni)\b/ : /\bnie\b/
  const c = indicesDe(opciones, (t) => re.test(t) && !/\bcif\b|juridic|empresa|sociedad/.test(t))
  if (c.length <= 1) return unico(c)
  const exactas = c.filter((i) => {
    const t = normalizarRotuloGenerali(opciones[i]!.texto)
    return tipo === 'nif' ? t === 'nif' || t === 'dni' : t === 'nie'
  })
  return unico(exactas)
}

/** Opción de «Sexo» (`hombre`/`mujer`): por rótulo (hombre/varón/masculino · mujer/femenino) o por valor H/V/M/F de una letra. Única o `null`. PURA. */
export function opcionSexoGenerali(opciones: readonly Opcion[], sexo: 'hombre' | 'mujer'): number | null {
  const reT = sexo === 'hombre' ? /^(hombre|varon|masculino)$/ : /^(mujer|femenino)$/
  const porTexto = indicesDe(opciones, (t) => reT.test(t))
  if (porTexto.length > 0) return unico(porTexto)
  const reV = sexo === 'hombre' ? /^(h|v)$/ : /^(m|f)$/
  // Por valor solo si las letras del select son inequívocas (no «M» de masculino frente a «F»: H/M o V/M o M/F se distinguen por el par).
  const valores = opciones.filter((o) => !opcionSelectVaciaGenerali(o)).map((o) => normalizarRotuloGenerali(o.valor))
  if (sexo === 'mujer' && valores.includes('m') && valores.includes('f')) return null
  return unico(indicesDe(opciones, (_t, v) => reV.test(v)))
}

/** Opción del «Tipo de carné» para la clase (`b`, `a2`…): rótulo o valor EXACTO, o rótulo que empieza por la clase seguida de espacio/guion/paréntesis. Única o `null`. PURA. */
export function opcionTipoCarneGenerali(opciones: readonly Opcion[], clase: string | null | undefined): number | null {
  const c = normalizarRotuloGenerali(clase)
  if (!/^[a-z][a-z0-9]{0,3}$/.test(c)) return null
  const exactas = indicesDe(opciones, (t, v) => t === c || v === c || t === `clase ${c}` || t === `permiso ${c}`)
  if (exactas.length > 0) return unico(exactas)
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return unico(indicesDe(opciones, (t) => new RegExp(`^${esc}(\\s*[-(:]|\\s)`).test(t)))
}

/** Opción «España» de la nacionalidad (rótulo exacto «España»/«Española», sin tildes). Única o `null`. PURA. */
export function opcionEspanaGenerali(opciones: readonly Opcion[]): number | null {
  return unico(indicesDe(opciones, (t) => t === 'espana' || t === 'espanola'))
}

/** Lo que el bot puede teclear en «Datos personas» (solo lo que trae el riesgo; nada inventado). */
export type PlanDatosPersonasGenerali = {
  documento: string
  tipoDocumento: 'nif' | 'nie'
  nombre: string | null
  apellido1: string | null
  apellido2: string | null
  /** dd/mm/aaaa */
  fechaNacimiento: string | null
  /** dd/mm/aaaa (ficha o conductor si el tomador ES el conductor). */
  fechaCarne: string | null
  tipoCarne: string | null
  sexo: 'hombre' | 'mujer' | null
  /** «España» por defecto solo con DNI español (y solo si el desplegable está vacío). */
  espana: boolean
  email: string | null
  movil: string | null
}

type FormDatosPersonas = {
  documentoTomador?: string | null
  tomadorEsConductor?: boolean | null
  clasePermiso?: string | null
  tomador?: { tipo?: string | null; nombre?: string | null; apellido1?: string | null; apellido2?: string | null; documentoIdentidad?: string | null; fechaNacimiento?: string | null; email?: string | null; telefono?: string | null } | null
  datosTomador?: { tipo: string; nombre?: string; apellido1?: string; apellido2?: string | null; fechaNacimiento?: string } | null
  fichaTomador?: { documento?: string | null; fechaNacimiento?: string | null; fechaCarnet?: string | null; tipoCarnet?: string | null; email?: string | null; telefono?: string | null } | null
  conductor?: { fechaNacimiento?: string | null; fechaCarne?: string | null; sexo?: string | null } | null
}

/**
 * Plan de «Datos personas» (persona FÍSICA con DNI/NIE). PURA. Nombre/apellidos/nacimiento: `datosTomador` (ficha) o el bloque `tomador`.
 * Del CONDUCTOR (nacimiento, carné, sexo y clase de permiso) solo si `tomadorEsConductor === true` (sin dato, no se supone que sea él).
 * Email/móvil solo si el riesgo los trae (`tomador` o `fichaTomador`). Empresa, CIF/pasaporte o sin documento → `{ error }` (sin valores).
 */
export function planDatosPersonasGenerali(form: FormDatosPersonas): PlanDatosPersonasGenerali | { error: string } {
  if (form.datosTomador?.tipo === 'juridica' || form.tomador?.tipo === 'juridica') return { error: 'el tomador es persona jurídica (la pestaña «Datos personas» no tiene mapa de empresa)' }
  const limpio = (x: string | null | undefined) => {
    const v = String(x ?? '').replace(/\s+/g, ' ').trim()
    return v === '' ? null : v
  }
  const documento = documentoNormalizadoGenerali(form.documentoTomador ?? form.tomador?.documentoIdentidad ?? form.fichaTomador?.documento)
  if (documento === '') return { error: 'el riesgo no trae el NIF/NIE del tomador' }
  const tipoDocumento = tipoDocumentoGenerali(documento)
  if (!tipoDocumento) return { error: 'el documento del tomador no es un DNI ni un NIE (CIF o pasaporte: sin mapa)' }
  const dt = form.datosTomador?.tipo === 'fisica' ? form.datosTomador : null
  const t = form.tomador ?? null
  const esConductor = form.tomadorEsConductor === true
  const cond = esConductor ? form.conductor ?? null : null
  const sexo = cond?.sexo === 'hombre' || cond?.sexo === 'mujer' ? cond.sexo : null
  const fechaCarneIso = form.fichaTomador?.fechaCarnet ?? cond?.fechaCarne ?? null
  return {
    documento,
    tipoDocumento,
    nombre: limpio(dt?.nombre ?? t?.nombre),
    apellido1: limpio(dt?.apellido1 ?? t?.apellido1),
    apellido2: limpio(dt?.apellido2 ?? t?.apellido2),
    fechaNacimiento: fechaGenerali(dt?.fechaNacimiento ?? t?.fechaNacimiento ?? form.fichaTomador?.fechaNacimiento ?? cond?.fechaNacimiento),
    fechaCarne: fechaGenerali(fechaCarneIso),
    // Clase del carné: la de la ficha o, si el tomador conduce, la del permiso del conductor; solo con fecha de carné.
    tipoCarne: fechaCarneIso ? limpio(form.fichaTomador?.tipoCarnet ?? (esConductor ? form.clasePermiso : null)) : null,
    sexo,
    espana: tipoDocumento === 'nif',
    email: limpio(t?.email ?? form.fichaTomador?.email),
    movil: limpio(t?.telefono ?? form.fichaTomador?.telefono),
  }
}

/** Mensajes de validación del portal tras «Confirmar», SANEADOS (sin documentos, fechas, correos ni teléfonos), sin repetir, ≤`max`. PURA. */
export function mensajesValidacionGenerali(textos: readonly string[], max = 6): string[] {
  const out: string[] = []
  for (const x of textos) {
    const t = sanearFragmentoGenerali(String(x ?? '')).trim().slice(0, 140)
    if (t.length < 3 || out.includes(t)) continue
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

// ─── v0.2.45 (28/10/2026, trabajo dbbd7ab5 con 0.2.44): «Datos de Valoración» deja vacíos «Tipo de vehículo» y «Compañía de procedencia» ───
// Las opciones reales de esos dos `<select>` no se han capturado nunca (los volcados son de «Garantías y Resultados»): se casan EN VIVO contra las
// opciones del portal, solo por igualdad EXACTA (sin tildes, mayúsculas ni espacios de más). Sin opción exacta → el bot para nombrando el campo y las
// opciones vistas; nunca elige otra clase de vehículo ni otra compañía.

export const ETIQUETA_TIPO_VEHICULO_GENERALI = 'Tipo de vehículo'
export const ETIQUETA_COMPANIA_PROCEDENCIA_GENERALI = 'Compañía de procedencia'
/** Ramo auto = turismo: la ÚNICA opción admitida (normalizada). */
export const OPCION_TIPO_VEHICULO_AUTO_GENERALI = 'Turismo'
/** Rótulos EXACTOS (normalizados) de «sin seguro anterior» que se aceptan SOLO si la ficha dice 0 años asegurado. */
export const OPCIONES_SIN_SEGURO_GENERALI: readonly string[] = Object.freeze(['sin seguro anterior', 'sin compania anterior', 'sin compania de procedencia', 'sin seguro previo', 'sin aseguramiento previo', 'no tenia seguro', 'no tenia seguro anterior'])

/** Texto de opción normalizado (sin tildes, minúsculas, espacios colapsados, sin punto final). PURA. */
export function normalizarOpcionGenerali(t: string | null | undefined): string {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase()
}

/** Índice de la ÚNICA opción cuyo texto normalizado es exactamente uno de `buscados`; -1 si ninguna o varias. PURA. */
export function indiceOpcionNormalizadaGenerali(opciones: readonly string[], buscados: readonly string[]): number {
  const b = buscados.map(normalizarOpcionGenerali)
  const ix = opciones.map((o, i) => (b.includes(normalizarOpcionGenerali(o)) ? i : -1)).filter((i) => i >= 0)
  return ix.length === 1 ? ix[0]! : -1
}

export type CompaniaProcedenciaPedida = { compania: string } | { sinSeguro: true } | { error: string }

/**
 * Qué poner en «Compañía de procedencia» según la FICHA (riesgo original, nunca el supuesto favorable): la compañía anterior/actual
 * (`companiaAnterior` → `companiaActual`); sin ella y con 0 años asegurado como DATO → «sin seguro anterior»; si no, error que nombra el campo. PURA.
 */
export function companiaProcedenciaPedidaGenerali(compania: string | null, aniosAseguradoAnterior: unknown): CompaniaProcedenciaPedida {
  if (compania && compania.trim() !== '') return { compania: compania.trim() }
  if (aniosAseguradoAnterior === 0) return { sinSeguro: true }
  return { error: `la ficha no trae la compañía anterior del vehículo (ni dice que no tuviera seguro): hace falta para «${ETIQUETA_COMPANIA_PROCEDENCIA_GENERALI}»` }
}

// ───────────────────────── 5 · selector de vehículos que tarda en pintarse (v0.2.46) ─────────────────────────

/** Estado de carga de un marco, SIN contenido: ruta saneada, `document.readyState`, nº de controles y de caracteres del `body`. */
export type MarcoCargaGenerali = { ruta: string; listo: string | null; controles: number | null; texto: number | null }

/** Ruta sin query, sin fragmento y sin `;jsessionid=…` (nunca viaja la sesión en un mensaje). PURA. */
export function rutaMarcoSaneadaGenerali(url: string): string {
  if (/^(about|data|blob):/i.test(url)) return url.split(/[?#,]/)[0]!
  return rutaSinQuery(url).replace(/;jsessionid=[^/?#]*/gi, '')
}

/** ¿Es el marco del «Selector de vehículos» (`mot_motorWeb/mvc/selVehiculo`)? PURA. */
export function esMarcoSelectorVehiculoGenerali(url: string): boolean {
  return /\/selVehiculo(?:[;/?#.]|$)/i.test(rutaMarcoSaneadaGenerali(url))
}

/**
 * Prueba real 28/10/2026 (trabajo bf5707a8, 0.2.45): tras «Vehículo» el `mainFrame` YA estaba en `selVehiculo` pero seguía
 * CARGANDO (solo `<head>`, sin `<body>`) a los 20 s. Eso no es una pantalla nueva: se espera más. Decide si se sigue
 * esperando (hay un marco del selector a medio cargar) o no (no hay ninguno: es otra cosa y se para). PURA.
 */
export function selectorVehiculoCargandoGenerali(marcos: readonly MarcoCargaGenerali[]): boolean {
  return marcos.some((m) => esMarcoSelectorVehiculoGenerali(m.ruta) && (m.listo !== 'complete' || !m.texto))
}

/** Mensaje (para `ErrorMapaIncompletoGenerali`) cuando el «Selector de vehículos» no se ve: inventario de marcos SIN valores. PURA. */
export function motivoSelectorVehiculoNoVistoGenerali(marcos: readonly MarcoCargaGenerali[], segundos: number, botones: readonly string[]): string {
  const selector = marcos.filter((m) => esMarcoSelectorVehiculoGenerali(m.ruta))
  const n = (x: number | null) => (x === null ? '?' : String(x))
  const inv = marcos
    .filter((m) => !/^about:|vimeo\.com/i.test(m.ruta))
    .map((m) => `${m.ruta || '(vacío)'} [${m.listo ?? '?'}; ${n(m.controles)} controles; ${n(m.texto)} caracteres]`)
    .join(' | ')
    .slice(0, 900)
  const b = [...new Set(botones)].join(' · ').slice(0, 400) || '(ninguno)'
  const que = selector.length === 0
    ? `ningún marco abrió «selVehiculo» en ${segundos} s`
    : selector.some((m) => m.listo !== 'complete' || !m.texto)
      ? `el marco «selVehiculo» seguía CARGANDO (sin cuerpo pintado) tras ${segundos} s`
      : `el marco «selVehiculo» cargó pero no muestra el texto «Selector de vehículos» tras ${segundos} s`
  return `la pantalla «Selector de vehículos» tras pulsar «Vehículo» (captura 5): ${que}. Marcos: ${inv || '(ninguno)'}. Botones vistos: ${b}`
}

// ───────────────────────── «Datos personas»: bloqueo del refresco del NIF (v0.2.47) ─────────────────────────

/** Control de «Datos personas» leído SIN valor: id sin prefijo, si está deshabilitado y su atributo `controlbloqueo` de Genernet. */
export type ControlBloqueoGenerali = { id: string; deshabilitado: boolean; bloqueo: string | null }

/**
 * Prueba real 28/10/2026 (trabajo ec49068b, 0.2.46): al salir del NIF, su `onchange` (`TratarDependiente(… '/refreshSelPersonas.do')`) lanza
 * un refresco y Genernet DESHABILITA todo el formulario marcando cada control con `controlbloqueo="1"` hasta que vuelve la respuesta (el volcado:
 * NIF, tipo de persona, nombre, apellidos, sexo, fechas… todos `disabled` con `controlbloqueo="1"`). El bot leyó a los 1,5 s y vio
 * «deshabilitado». Devuelve los controles que siguen BLOQUEADOS por ese refresco (deshabilitado + `controlbloqueo="1"`). PURA.
 */
export function bloqueadosDatosPersonasGenerali(controles: readonly ControlBloqueoGenerali[]): string[] {
  return controles.filter((c) => c.deshabilitado && String(c.bloqueo ?? '').trim() === '1').map((c) => c.id)
}

/**
 * Por qué falta un dato mínimo del tomador tras rellenar (nombre, primer apellido): el riesgo no lo trae (→ dato que pedir, nunca se
 * inventa) o el riesgo sí lo trae y el campo no se pudo escribir (motivo de `omitidos`). PURA, sin valores.
 */
export function motivoFaltaDatoPersonaGenerali(etiqueta: string, campo: string, enRiesgo: boolean, omitidos: readonly string[]): string {
  if (!enRiesgo) return `${etiqueta} (el riesgo no lo trae y el portal no lo puso; no se inventa)`
  const motivo = omitidos.find((o) => o.startsWith(`${campo}:`))?.slice(campo.length + 1)
  return `${etiqueta} (el riesgo lo trae pero el campo no se pudo escribir: ${motivo ?? 'sin motivo leído'})`
}
