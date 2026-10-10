// VEHÍCULO canónico (10/10/2026). PURO: ni BD, ni red. Bloque reutilizable por los robots de AUTO/MOTO de cualquier
// compañía: el robot teclea la matrícula DENTRO de la tarificación real, el portal consulta su fichero de vehículos y
// rellena marca/modelo/versión/fecha…; el robot LEE eso y lo vuelca aquí. Ningún valor se inventa: lo que el portal no
// da queda `null` («no consta»), nunca un valor por defecto.
//
// Versión: si el portal ofrece VARIAS versiones candidatas y no hay una elección explícita (código de catálogo o
// etiqueta EXACTA que una persona eligió en la bandeja), el resultado es `ambigua` con las opciones → el robot para con
// `requiere_humano` (prefijo PREFIJO_ELECCION_VERSION). Nunca se elige «la más parecida».
//
// 🚨 La matrícula es dato personal (identifica al titular): `Vehiculo` NO la guarda. Solo vive en el formulario de
// entrada del robot y nunca se escribe en logs, trazas ni mensajes de error.

export const COMBUSTIBLES = ['gasolina', 'diesel', 'electrico', 'hibrido', 'hibrido_enchufable', 'glp', 'gnc', 'hidrogeno'] as const
export type Combustible = (typeof COMBUSTIBLES)[number]

export type Vehiculo = {
  marca: string
  modelo: string
  /** Versión/acabado tal como la nombra el catálogo del portal. */
  version: string
  /** `null` = el portal no lo dice (no se deduce del nombre de la versión). */
  combustible: Combustible | null
  /** Potencia en CV (si el portal la da en kW se convierte: 1 kW = 1,35962 CV, redondeo a entero). */
  potenciaCv: number | null
  /** ISO AAAA-MM-DD. */
  fechaMatriculacion: string | null
  /** Código del vehículo en el catálogo de la compañía (p. ej. el hidden `mobileCode` de Allianz). */
  codigoCatalogo: string | null
}

/** Una opción de versión que ofrece el portal tras la consulta. */
export type CandidatoVersion = { etiqueta: string; codigo: string | null }

/** Elección explícita (de la bandeja o del formulario): por código de catálogo o por etiqueta EXACTA. */
export type EleccionVersion = { codigo?: string | null; etiqueta?: string | null }

export type ResolucionVersion =
  | { tipo: 'unica'; candidato: CandidatoVersion }
  | { tipo: 'ambigua'; opciones: CandidatoVersion[] }
  | { tipo: 'ninguna' }

/** Prefijo del mensaje de error que lleva a `requiere_humano` para elegir versión (lo lee `motivoLegible`). */
export const PREFIJO_ELECCION_VERSION = 'requiere_eleccion_version:'
/** Tope de opciones que se listan en el mensaje (el resto se cuenta). */
export const MAX_OPCIONES_VERSION = 12

const espacios = (s: string) => s.replace(/\s+/g, ' ').trim()
const clave = (s: string) => espacios(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Opciones «vacías» de un desplegable («Seleccione…», «--», «»): no son candidatas. */
export function esOpcionVacia(etiqueta: string): boolean {
  const k = clave(etiqueta)
  return k === '' || /^[-=.\s]*$/.test(k) || /^(SELECCION|ELIJA|ELEGIR|ESCOJA|ESCOGER|--)/.test(k)
}

/**
 * Decide la versión SIN adivinar. Se descartan las opciones vacías y los duplicados exactos. Con una sola candidata →
 * `unica`. Con varias: solo si la elección casa con EXACTAMENTE una (código idéntico, o etiqueta igual salvo
 * mayúsculas/tildes/espacios) → `unica`; si no → `ambigua` con todas. Sin candidatas → `ninguna`.
 */
export function resolverVersion(candidatos: readonly CandidatoVersion[], eleccion: EleccionVersion | null = null): ResolucionVersion {
  const vistos = new Set<string>()
  const limpios: CandidatoVersion[] = []
  for (const c of candidatos) {
    const etiqueta = espacios(String(c?.etiqueta ?? ''))
    if (esOpcionVacia(etiqueta)) continue
    const codigo = c?.codigo == null || String(c.codigo).trim() === '' ? null : String(c.codigo).trim()
    const k = `${codigo ?? ''}|${clave(etiqueta)}`
    if (vistos.has(k)) continue
    vistos.add(k)
    limpios.push({ etiqueta, codigo })
  }
  if (limpios.length === 0) return { tipo: 'ninguna' }
  if (limpios.length === 1) return { tipo: 'unica', candidato: limpios[0] }
  const cod = eleccion?.codigo?.trim() || null
  const eti = eleccion?.etiqueta ? clave(eleccion.etiqueta) : null
  if (cod || eti) {
    const casan = limpios.filter((c) => (cod !== null && c.codigo === cod) || (cod === null && eti !== null && clave(c.etiqueta) === eti))
    if (casan.length === 1) return { tipo: 'unica', candidato: casan[0] }
  }
  return { tipo: 'ambigua', opciones: limpios }
}

/** Mensaje para la bandeja (sin datos personales: solo nombres de catálogo). */
export function mensajeEleccionVersion(opciones: readonly CandidatoVersion[]): string {
  const lista = opciones.slice(0, MAX_OPCIONES_VERSION).map((o) => (o.codigo ? `${o.etiqueta} [${o.codigo}]` : o.etiqueta))
  const resto = opciones.length - lista.length
  return `${PREFIJO_ELECCION_VERSION} el catálogo ofrece ${opciones.length} versiones para este vehículo; elige una en la bandeja y reintenta: ${lista.join(' · ')}${resto > 0 ? ` (+${resto} más)` : ''}`
}

/** Normaliza el combustible que escribe un portal. Lo que no se reconoce → `null` (no se fuerza a un valor). */
export function normalizarCombustible(texto: string | null | undefined): Combustible | null {
  if (typeof texto !== 'string') return null
  const k = clave(texto)
  if (k === '') return null
  if (/ENCHUF|PLUG|PHEV/.test(k)) return 'hibrido_enchufable'
  if (/HIBRID|HYBRID|HEV/.test(k)) return 'hibrido'
  if (/ELECTR|^BEV$|^EV$/.test(k)) return 'electrico'
  if (/DIESEL|GASOIL|GASOLEO|^D$/.test(k)) return 'diesel'
  if (/GASOLINA|^G$|NAFTA|PETROL/.test(k)) return 'gasolina'
  if (/GLP|AUTOGAS|LPG/.test(k)) return 'glp'
  if (/GNC|CNG|GAS NATURAL/.test(k)) return 'gnc'
  if (/HIDROG|HYDROG/.test(k)) return 'hidrogeno'
  return null
}

/** «110 CV», «110cv», «81 kW», «110» (se asume CV solo si `unidadPorDefecto` lo dice) → CV enteros, o `null`. */
export function potenciaCvDesdeTexto(texto: string | null | undefined, unidadPorDefecto: 'cv' | 'kw' | null = null): number | null {
  if (typeof texto !== 'string') return null
  const m = /^\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(cv|c\.v\.|hp|kw)?\s*$/i.exec(texto)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!(n > 0)) return null
  const unidad = m[2] ? (/kw/i.test(m[2]) ? 'kw' : 'cv') : unidadPorDefecto
  if (unidad === null) return null
  const cv = unidad === 'kw' ? n * 1.35962 : n
  const r = Math.round(cv)
  return r > 0 && r <= 2000 ? r : null
}

/** «05/10/2026» o «2026-10-05» → «2026-10-05» si es una fecha real; si no, `null`. */
export function fechaIsoDesdeTexto(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim()
  let a: number, m: number, d: number
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (r) [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1900) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Matrícula española normalizada (mayúsculas, sin espacios ni guiones). */
export function normalizarMatricula(m: string): string {
  return m.toUpperCase().replace(/[\s.\-]/g, '')
}

/**
 * ¿Matrícula española plausible? Actual (desde 2000: 4 dígitos + 3 consonantes sin vocales, Ñ ni Q), provincial
 * antigua (1-2 letras + 4 dígitos + 0-2 letras) y ciclomotor (C + 4 dígitos + 3 consonantes).
 */
export function esMatriculaEspanola(m: string): boolean {
  const s = normalizarMatricula(m)
  return /^\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(s) || /^C\d{4}[BCDFGHJKLMNPRSTVWXYZ]{3}$/.test(s) || /^[A-Z]{1,2}\d{4}[A-Z]{0,2}$/.test(s)
}

/** Lo que el robot lee del portal tras la consulta por matrícula (textos crudos; `null` = el campo no está). */
export type LecturaVehiculoPortal = {
  marca: string | null
  modelo: string | null
  /** Versión ya fijada por el portal (opción seleccionada), si la hay. */
  versionSeleccionada: CandidatoVersion | null
  /** Todas las opciones del desplegable de versión. */
  versiones: readonly CandidatoVersion[]
  combustible: string | null
  potencia: string | null
  unidadPotencia: 'cv' | 'kw' | null
  fechaMatriculacion: string | null
  codigoCatalogo: string | null
}

export type ResultadoVehiculo =
  | { tipo: 'ok'; vehiculo: Vehiculo; /** Opción del desplegable que hay que dejar FIJADA en el portal. */ opcion: CandidatoVersion }
  | { tipo: 'ambigua'; opciones: CandidatoVersion[] }
  | { tipo: 'incompleto'; faltan: string[] }

/**
 * Lectura del portal → `Vehiculo`. Marca y modelo obligatorios (sin ellos la consulta no ha devuelto nada:
 * `incompleto`). La versión la decide SIEMPRE `resolverVersion` sobre las opciones del desplegable: que el portal
 * traiga una preseleccionada NO cuenta como elección (un `<select>` sin opción vacía siempre tiene la primera puesta),
 * así que con 2+ candidatas y sin elección explícita → `ambigua`. Solo si el desplegable no lista opciones se usa la
 * preseleccionada como única candidata.
 *
 * `codigoCatalogo`: con elección explícita es el código de la OPCIÓN elegida (el hidden del portal refleja lo que el
 * portal tenía puesto ANTES y no vale); sin elección, el hidden del portal y, si falta, el de la opción.
 */
export function vehiculoDesdeLectura(l: LecturaVehiculoPortal, eleccion: EleccionVersion | null = null): ResultadoVehiculo {
  const marca = l.marca && !esOpcionVacia(l.marca) ? espacios(l.marca) : null
  const modelo = l.modelo && !esOpcionVacia(l.modelo) ? espacios(l.modelo) : null
  const faltan = [marca ? null : 'marca', modelo ? null : 'modelo'].filter((x): x is string => x !== null)
  if (faltan.length) return { tipo: 'incompleto', faltan }
  const sel = l.versionSeleccionada && !esOpcionVacia(l.versionSeleccionada.etiqueta) ? l.versionSeleccionada : null
  const hayEleccion = Boolean(eleccion?.codigo?.trim() || eleccion?.etiqueta?.trim())
  const r = resolverVersion(l.versiones.length ? l.versiones : sel ? [sel] : [], hayEleccion ? eleccion : null)
  if (r.tipo === 'ambigua') return r
  if (r.tipo === 'ninguna') return { tipo: 'incompleto', faltan: ['version'] }
  const version = r.candidato
  // Una elección que NO casa con la única candidata no se ignora: se pregunta (nunca «la que había»).
  if (hayEleccion && !casaEleccion(version, eleccion!)) return { tipo: 'ambigua', opciones: [version] }
  const codigoPortal = l.codigoCatalogo?.trim() || null
  return {
    tipo: 'ok',
    vehiculo: {
      marca: marca!,
      modelo: modelo!,
      version: version.etiqueta,
      combustible: normalizarCombustible(l.combustible),
      potenciaCv: potenciaCvDesdeTexto(l.potencia, l.unidadPotencia),
      fechaMatriculacion: fechaIsoDesdeTexto(l.fechaMatriculacion),
      codigoCatalogo: hayEleccion ? version.codigo : codigoPortal || version.codigo || null,
    },
    opcion: version,
  }
}

function casaEleccion(c: CandidatoVersion, e: EleccionVersion): boolean {
  const cod = e.codigo?.trim() || null
  if (cod !== null) return c.codigo === cod
  return Boolean(e.etiqueta?.trim()) && clave(c.etiqueta) === clave(e.etiqueta!)
}
