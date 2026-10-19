// Generali (portal del corredor) · Turismos — REGLAS PURAS (18/10/2026). Sin Playwright, sin red: `npm test`.
// Mapa de pantallas: services/tarificador-rpa/docs/generali-mapa-capturas.md. Reglas de Alberto (18/10/2026):
//   1. Matrícula con ASTERISCO entre cifras y letras («1234*BCD»), siempre, y el campo de VERIFICACIÓN igual.
//   2. Generali NO saca marca/modelo/versión por matrícula: los busca en sus desplegables con el vehículo que confirmó
//      Allianz o Mapfre en la misma oportunidad (lo inyecta asegura). Casado exacto normalizado → contención por palabra
//      entera → EXACTAMENTE un candidato; 0 o >1 = atasco con las opciones (nunca a ciegas). Por similitud = aviso.
//   3. Tomador, conductor y antecedentes como en las demás compañías; antecedentes sin dato = supuesto favorable DECLARADO.
// 🚨 Sin datos personales en mensajes: ni matrícula, ni nombres de mediador (solo cuentas y el código propio).

import { supuestoConductorTomador, type FormularioAuto } from '@central/module-tarificacion'

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

/** Opción del «Uso del Vehículo» para el uso del riesgo (hoy solo particular; otro uso = sin mapa). PURA. */
export function elegirUsoGenerali(opciones: readonly string[], uso: string | null | undefined): EleccionCatalogo {
  if ((uso ?? 'particular') !== 'particular') return { tipo: 'ninguna' }
  const ix = opciones.flatMap((o, i) => (!esOpcionVaciaCatalogo(o) && /\bPARTICULAR\b/.test(normalizarCatalogo(o)) && !/\b(ALQUILER|TAXI|AUTOESCUELA|EMPRESA|PROFESIONAL|COMERCIAL)\b/.test(normalizarCatalogo(o)) ? [i] : []))
  return ix.length === 1 ? { tipo: 'unica', indice: ix[0]!, porSimilitud: false } : ix.length === 0 ? { tipo: 'ninguna' } : { tipo: 'varias', indices: ix }
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
  fechaNacimiento: ['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'F NACIMIENTO'],
  fechaCarne: ['FECHA DE CARNE', 'FECHA CARNE', 'FECHA DE CARNET', 'FECHA CARNET', 'FECHA EXPEDICION CARNE', 'FECHA EXPEDICION CARNET', 'FECHA DE EXPEDICION DEL CARNE', 'FECHA DE EXPEDICION DEL CARNET', 'FECHA EXPEDICION PERMISO', 'FECHA DE EXPEDICION DEL PERMISO'],
  codigoPostal: ['CODIGO POSTAL', 'C P', 'CP'],
  aniosAsegurado: ['ANOS ASEGURADO', 'ANOS ASEGURADOS', 'ANOS DE ASEGURAMIENTO', 'ANOS ASEGURADO ANTERIOR', 'ANOS EN LA COMPANIA ANTERIOR'],
  siniestros: ['SINIESTROS ULTIMOS 5 ANOS', 'N SINIESTROS ULTIMOS 5 ANOS', 'NUMERO DE SINIESTROS', 'SINIESTROS CON CULPA ULTIMOS 5 ANOS'],
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
const RE_LINEA_PRECIO = /\b(PRIMA|PRECIO|IMPORTE|TOTAL|A PAGAR)\b/
const RE_LINEA_TOTAL = /\bTOTAL\b/
/** Líneas con importes que NO son el precio (capitales, franquicias, valores del vehículo, límites). */
const RE_LINEA_NO_PRECIO = /\b(FRANQUICIA|CAPITAL|SUMA ASEGURADA|LIMITE|VALOR|ACCESORIOS|INDEMNIZACION|KM|KILOMETROS)\b/
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
  | { tipo: 'unico'; eur: number; linea: string }
  | { tipo: 'ninguno' }
  | { tipo: 'varios'; candidatos: { eur: number; linea: string }[] }

/**
 * Lector TOLERANTE del precio en el texto visible de «Garantías y Resultados» (sin captura de esa pantalla, v0.2.0). Busca
 * líneas con «prima/precio/importe/total/a pagar» (no franquicias, capitales ni valores) y su importe en formato español, en
 * la MISMA línea o en la siguiente (etiqueta y valor en celdas distintas). Manda «total» si lo hay. Un único importe distinto
 * dentro de la horquilla → ese; varios → `varios` (el adaptador PARA con la lista: nunca elige uno); ninguno → `ninguno`.
 * `ignorar`: importes que ya estaban en la pantalla ANTES de pulsar la subpestaña (no son el precio). PURA.
 */
export function leerPrecioGenerali(texto: string, ignorar: readonly number[] = []): LecturaPrecioGenerali {
  const lineas = String(texto ?? '').replace(/ /g, ' ').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
  const importesDe = (l: string) => [...l.matchAll(RE_IMPORTE_EN_LINEA)].map((m) => importeEspanolEur(m[0])).filter((n): n is number => n !== null)
  const total: { eur: number; linea: string }[] = []
  const otros: { eur: number; linea: string }[] = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!
    const n = normalizarCatalogo(l)
    if (!RE_LINEA_PRECIO.test(n) || RE_LINEA_NO_PRECIO.test(n)) continue
    let imps = importesDe(l)
    let linea = l
    const sig = lineas[i + 1]
    if (imps.length === 0 && sig && sig.length <= 30 && !RE_LINEA_PRECIO.test(normalizarCatalogo(sig))) {
      imps = importesDe(sig)
      linea = `${l} ${sig}`
    }
    for (const eur of imps) {
      if (eur < PRIMA_MIN_GENERALI_EUR || eur > PRIMA_MAX_GENERALI_EUR || ignorar.includes(eur)) continue
      ;(RE_LINEA_TOTAL.test(n) ? total : otros).push({ eur, linea: linea.slice(0, 120) })
    }
  }
  const base = total.length > 0 ? total : otros
  const distintos = [...new Map(base.map((c) => [c.eur, c])).values()]
  if (distintos.length === 0) return { tipo: 'ninguno' }
  if (distintos.length === 1) return { tipo: 'unico', eur: distintos[0]!.eur, linea: distintos[0]!.linea }
  return { tipo: 'varios', candidatos: distintos.slice(0, 12) }
}
