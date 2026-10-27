// VOLCADO INICIAL SEMIAUTOMÁTICO (27/10/2026, hoja de ruta §7 punto 4) — reglas PURAS: sin BD, sin red, sin reloj.
//
// El cliente sube su Excel/CSV o su PDF/foto; la IA PROPONE una estructura (edificio y unidades o inmuebles sueltos,
// contratos con su inquilino, renta y fechas, gastos recurrentes); el cliente la CORRIGE en una pantalla de revisión y
// solo al confirmar se escribe (en una transacción, dentro de su titular). Aquí viven:
//   · `normalizarVolcadoLeido` — lo que devuelve la IA → propuesta. Lista BLANCA de claves: lo que la IA añada por su
//     cuenta (NIF, correo, teléfono, IBAN…) no entra; y en los textos que sí entran se BORRA cualquier cosa con forma de
//     NIF/NIE, correo, teléfono o IBAN (`sinIdentificadores`). Lo ilegible se queda en `null` (no se sabe), nunca 0 ni
//     un valor de cajón («N/A», «otro»).
//   · `validarPropuesta` — la propuesta REVISADA que manda la pantalla: forma estricta (tipos, longitudes, topes).
//   · `evaluarVolcado` — contra lo que el titular YA tiene: qué se crearía, qué ya existe y qué hay que corregir.
// El inquilino de la propuesta es SOLO nombre y tipo: su NIF, correo y teléfono no se leen del documento (el portal no
// puede cifrarlos); el propietario los añade después en el contrato, por el puente de siempre.
import { esCategoriaGasto, type CategoriaGasto, type Periodicidad } from './tipos.ts'
import { esFecha } from './fechas.ts'
import { MAX_UNIDADES_EDIFICIO } from './edificio.ts'
import {
  USOS_IMPORTABLES,
  clavesDeInmueble,
  componerDireccion,
  leerCategoria,
  leerFecha,
  leerImporte,
  leerUso,
  normalizarTexto,
  type Celda,
} from './importacion.ts'

// ─── Topes ────────────────────────────────────────────────────────────────────────────────────────────────
/** Elementos (inmuebles + contratos + gastos) por volcado: el CHECK `filas_total BETWEEN 1 AND 500` de la BD. */
export const MAX_ELEMENTOS_VOLCADO = 500
const MAX_TEXTO = 200

export const USOS_VOLCADO = [...USOS_IMPORTABLES, 'edificio'] as const
export type UsoVolcado = (typeof USOS_VOLCADO)[number]
export const PERIODICIDADES_VOLCADO: readonly Periodicidad[] = ['mensual', 'trimestral', 'semestral', 'anual']

// ─── Tipos ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Referencia a un inmueble desde otro elemento: `ref` de un inmueble de ESTA propuesta, o el `id` (uuid) de uno que el
 * titular ya tiene. Un uuid se busca DENTRO de los inmuebles del titular (`ctx`): uno ajeno es «no encontrado».
 */
export type RefInmueble = string

export type InmuebleVolcado = {
  ref: string
  alias: string | null
  uso: UsoVolcado | null
  /** Solo en una unidad: el edificio del que cuelga (ref de la propuesta o id de un edificio existente). */
  edificio: RefInmueble | null
  referenciaCatastral: string | null
  direccion: string | null
  cp: string | null
  municipio: string | null
  provincia: string | null
  superficieM2: number | null
}
export type InquilinoVolcado = { nombre: string; tipo: 'persona' | 'sociedad' }
export type ContratoVolcado = {
  ref: string
  inmueble: RefInmueble | null
  inquilino: InquilinoVolcado | null
  inicio: string | null
  fin: string | null
  rentaCent: number | null
  fianzaCent: number | null
  indice: 'IPC' | 'IRAV' | null
}
export type GastoVolcado = {
  ref: string
  /** `null` = gasto del titular sin inmueble. */
  inmueble: RefInmueble | null
  concepto: string | null
  categoria: CategoriaGasto | null
  periodicidad: Periodicidad | null
  /** `null` = varía (se confirma con la factura); nunca 0. */
  importeCent: number | null
  diaMes: number | null
  inicio: string | null
}
export type PropuestaVolcado = { inmuebles: InmuebleVolcado[]; contratos: ContratoVolcado[]; gastos: GastoVolcado[] }

export const PROPUESTA_VOLCADO_VACIA: PropuestaVolcado = { inmuebles: [], contratos: [], gastos: [] }

export const elementosDe = (p: PropuestaVolcado): number => p.inmuebles.length + p.contratos.length + p.gastos.length

// ─── Identificadores personales fuera ─────────────────────────────────────────────────────────────────────

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi
const RE_NIF = /\b(?:\d{8}[ -]?[A-Z]|[XYZ][ -]?\d{7}[ -]?[A-Z]|[ABCDEFGHJNPQRSUVW][ -]?\d{7}[ -]?[0-9A-J])\b/gi
const RE_TELEFONO = /(?:\+?34[ .-]?)?\b[6789]\d{2}[ .-]?\d{2,3}[ .-]?\d{2,3}[ .-]?\d{0,3}\b/g

/** Borra del texto lo que tenga forma de correo, IBAN, NIF/NIE/CIF o teléfono. `null` si no queda nada. */
export function sinIdentificadores(t: string | null): string | null {
  if (t === null) return null
  const limpio = t.replace(RE_EMAIL, ' ').replace(RE_IBAN, ' ').replace(RE_NIF, ' ').replace(RE_TELEFONO, ' ').replace(/\s+/g, ' ').trim()
  return limpio === '' ? null : limpio
}

// ─── Lectura de lo que devuelve la IA ─────────────────────────────────────────────────────────────────────

const CAJON = new Set(['n a', 'na', 'n d', 'nd', 'null', 'none', 'desconocido', 'no consta', 'sin datos', 'otro', 'otros', 'otra', '-', '?'])

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Texto de la IA: recortado, sin identificadores personales y sin valores de cajón. */
function textoIa(v: unknown, max = MAX_TEXTO): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const t = sinIdentificadores(String(v).trim().replace(/\s+/g, ' '))
  if (t === null || CAJON.has(normalizarTexto(t))) return null
  return t.slice(0, max)
}

const celdaIa = (v: unknown): Celda => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' ? v : null)

/** Importe de la IA en euros (número o «1.234,56»). `null` = no consta o ilegible; jamás 0. */
function importeIa(v: unknown, permitirCero = false): number | null {
  const r = leerImporte(celdaIa(v), permitirCero)
  return 'cent' in r ? r.cent : null
}
function fechaIa(v: unknown): string | null {
  const r = leerFecha(celdaIa(v))
  return 'fecha' in r ? r.fecha : null
}
function usoIa(v: unknown): UsoVolcado | null {
  if (typeof v === 'string' && /^\s*(edificio|edificio entero|bloque|finca entera|inmueble entero)\s*$/i.test(v)) return 'edificio'
  const u = leerUso(celdaIa(v))
  // «otro» de la IA es un cajón: no se sabe.
  return u === 'invalido' || u === null || u === 'otro' ? null : u
}
function rcIa(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const rc = v.replace(/\s/g, '').toUpperCase()
  return /^[0-9A-Z]{20}$/.test(rc) ? rc : null
}
function cpIa(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) && v >= 1000 && v <= 99999 ? String(v).padStart(5, '0') : typeof v === 'string' ? v.replace(/\s/g, '') : ''
  return /^\d{5}$/.test(s) ? s : null
}
function m2Ia(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\s|m2|m²/gi, '').replace(/\./g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : null
}
function periodicidadIa(v: unknown): Periodicidad | null {
  if (typeof v !== 'string') return null
  const n = normalizarTexto(v)
  if (['mensual', 'mes', 'cada mes', 'mensualmente'].includes(n)) return 'mensual'
  if (['trimestral', 'trimestre', 'cada trimestre'].includes(n)) return 'trimestral'
  if (['semestral', 'semestre'].includes(n)) return 'semestral'
  if (['anual', 'ano', 'cada ano', 'anualmente'].includes(n)) return 'anual'
  return null
}
function categoriaIa(v: unknown): CategoriaGasto | null {
  const c = leerCategoria(celdaIa(v))
  return c === null || c === 'desconocida' || c === 'OTRO' ? null : c
}
function indiceIa(v: unknown): 'IPC' | 'IRAV' | null {
  if (typeof v !== 'string') return null
  const n = normalizarTexto(v)
  return n.includes('irav') ? 'IRAV' : /\bipc\b/.test(n) ? 'IPC' : null
}
function diaIa(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}
/** Nombre del inquilino: si lo que llega tiene forma de documento/correo/teléfono, se borra; demasiado corto = no consta. */
function inquilinoIa(nombre: unknown, tipo: unknown): InquilinoVolcado | null {
  const t = textoIa(nombre)
  if (t === null || t.length < 2 || !/\p{L}/u.test(t)) return null
  const soc = typeof tipo === 'string' && /soc|empresa|juridic/i.test(tipo)
  const pareceSociedad = /\b(s\.?\s?l\.?u?|s\.?\s?a\.?|sociedad|cb|c\.b\.|slp|coop)\b/i.test(t)
  return { nombre: t, tipo: soc || pareceSociedad ? 'sociedad' : 'persona' }
}

const RE_REF = /^[A-Za-z0-9_-]{1,24}$/

export type LecturaVolcado = { propuesta: PropuestaVolcado; motivos: string[] }

/**
 * Lo que devuelve la IA → propuesta normalizada. Forma esperada (la pide la instrucción del lector):
 * `{ inmuebles: [{ ref, nombre, uso, edificio, referencia_catastral, direccion, cp, municipio, provincia, superficie_m2 }],
 *    contratos: [{ ref, inmueble, inquilino, inquilino_tipo, inicio, fin, renta_mensual, fianza, actualizacion }],
 *    gastos: [{ ref, inmueble, concepto, categoria, periodicidad, importe, dia_mes, inicio }] }`.
 * Solo se copian ESAS claves. Las referencias entre elementos se reescriben a refs propias y únicas (`I1`, `C1`, `G1`…).
 */
export function normalizarVolcadoLeido(bruto: unknown): LecturaVolcado {
  const b = obj(bruto)
  const motivos: string[] = []
  const brInm = arr(b.inmuebles)
  const brCon = arr(b.contratos)
  const brGas = arr(b.gastos)
  const total = brInm.length + brCon.length + brGas.length
  let cupo = MAX_ELEMENTOS_VOLCADO
  if (total > MAX_ELEMENTOS_VOLCADO) motivos.push(`El documento trae más de ${MAX_ELEMENTOS_VOLCADO} elementos: solo se proponen los primeros.`)
  const toma = (xs: unknown[]): unknown[] => {
    const r = xs.slice(0, Math.max(0, cupo))
    cupo -= r.length
    return r
  }

  // Inmuebles: refs de la IA → I1, I2… (la IA puede repetir o inventar formatos).
  const refInm = new Map<string, string>()
  const inmuebles: InmuebleVolcado[] = toma(brInm).map((x, i) => {
    const o = obj(x)
    const ref = `I${i + 1}`
    const suya = typeof o.ref === 'string' || typeof o.ref === 'number' ? String(o.ref).trim() : ''
    if (suya !== '' && !refInm.has(suya)) refInm.set(suya, ref)
    const alias = textoIa(o.nombre ?? o.alias, 80)
    if (alias !== null && !refInm.has(alias)) refInm.set(alias, ref)
    return {
      ref,
      alias,
      uso: usoIa(o.uso),
      edificio: typeof o.edificio === 'string' || typeof o.edificio === 'number' ? String(o.edificio).trim() : null,
      referenciaCatastral: rcIa(o.referencia_catastral ?? o.referenciaCatastral),
      direccion: textoIa(o.direccion),
      cp: cpIa(o.cp),
      municipio: textoIa(o.municipio, 80),
      provincia: textoIa(o.provincia, 80),
      superficieM2: m2Ia(o.superficie_m2 ?? o.superficieM2),
    }
  })
  // La referencia al edificio se traduce a la ref propia; si no casa con ninguno (o se apunta a sí misma), no consta.
  for (const i of inmuebles) {
    const r = i.edificio === null ? null : refInm.get(i.edificio) ?? null
    i.edificio = r !== null && r !== i.ref ? r : null
    if (i.edificio !== null && i.uso === 'edificio') i.uso = null
  }
  const refDe = (v: unknown): string | null => {
    if (typeof v !== 'string' && typeof v !== 'number') return null
    const t = String(v).trim()
    return refInm.get(t) ?? null
  }

  const contratos: ContratoVolcado[] = toma(brCon).map((x, i) => {
    const o = obj(x)
    return {
      ref: `C${i + 1}`,
      inmueble: refDe(o.inmueble),
      inquilino: inquilinoIa(o.inquilino, o.inquilino_tipo),
      inicio: fechaIa(o.inicio),
      fin: fechaIa(o.fin),
      rentaCent: importeIa(o.renta_mensual ?? o.renta),
      fianzaCent: importeIa(o.fianza, true),
      indice: indiceIa(o.actualizacion ?? o.indice),
    }
  })

  const gastos: GastoVolcado[] = toma(brGas).map((x, i) => {
    const o = obj(x)
    return {
      ref: `G${i + 1}`,
      inmueble: refDe(o.inmueble),
      concepto: textoIa(o.concepto),
      categoria: categoriaIa(o.categoria),
      periodicidad: periodicidadIa(o.periodicidad),
      importeCent: importeIa(o.importe),
      diaMes: diaIa(o.dia_mes ?? o.diaMes),
      inicio: fechaIa(o.inicio),
    }
  })

  if (inmuebles.length + contratos.length + gastos.length === 0) motivos.push('No hemos encontrado inmuebles, contratos ni gastos en el documento.')
  return { propuesta: { inmuebles, contratos, gastos }, motivos }
}

// ─── Validación de la propuesta REVISADA (lo que manda la pantalla) ───────────────────────────────────────

type V = { ok: true; propuesta: PropuestaVolcado } | { ok: false; campo: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nada = (v: unknown) => v === undefined || v === null || v === ''
function txt(v: unknown, max: number): string | null | 'x' {
  if (nada(v)) return null
  if (typeof v !== 'string') return 'x'
  const t = v.trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.length > max ? 'x' : t
}
function cent(v: unknown, cero = false): number | null | 'x' {
  if (nada(v)) return null
  return typeof v === 'number' && Number.isSafeInteger(v) && (v > 0 || (cero && v === 0)) ? v : 'x'
}
function fch(v: unknown): string | null | 'x' {
  if (nada(v)) return null
  return esFecha(v) ? v : 'x'
}
function ref(v: unknown): string | null | 'x' {
  if (nada(v)) return null
  return typeof v === 'string' && (RE_REF.test(v) || UUID.test(v)) ? v : 'x'
}

/** Forma estricta de la propuesta revisada. Los PROBLEMAS de contenido (falta la renta…) los dice `evaluarVolcado`. */
export function validarPropuesta(cuerpo: unknown): V {
  const b = obj(cuerpo)
  if (!Array.isArray(b.inmuebles) || !Array.isArray(b.contratos) || !Array.isArray(b.gastos)) return { ok: false, campo: 'propuesta' }
  if (b.inmuebles.length + b.contratos.length + b.gastos.length > MAX_ELEMENTOS_VOLCADO) return { ok: false, campo: 'propuesta' }
  const refs = new Set<string>()
  const refUnica = (v: unknown): string | null => {
    if (typeof v !== 'string' || !RE_REF.test(v) || refs.has(v)) return null
    refs.add(v)
    return v
  }
  const inmuebles: InmuebleVolcado[] = []
  for (const [k, x] of b.inmuebles.entries()) {
    const o = obj(x)
    const r = refUnica(o.ref)
    const alias = txt(o.alias, 80), dir = txt(o.direccion, MAX_TEXTO), mun = txt(o.municipio, 80), prov = txt(o.provincia, 80)
    const ed = ref(o.edificio)
    const uso = nada(o.uso) ? null : (USOS_VOLCADO as readonly unknown[]).includes(o.uso) ? (o.uso as UsoVolcado) : 'x'
    const rc = nada(o.referenciaCatastral) ? null : typeof o.referenciaCatastral === 'string' && /^[0-9A-Z]{20}$/.test(o.referenciaCatastral) ? o.referenciaCatastral : 'x'
    const cp = nada(o.cp) ? null : typeof o.cp === 'string' && /^\d{5}$/.test(o.cp) ? o.cp : 'x'
    const sup = nada(o.superficieM2) ? null : typeof o.superficieM2 === 'number' && Number.isFinite(o.superficieM2) && o.superficieM2 > 0 && o.superficieM2 < 100_000 ? o.superficieM2 : 'x'
    const campos = { ref: r, alias, uso, edificio: ed, referenciaCatastral: rc, direccion: dir, cp, municipio: mun, provincia: prov, superficieM2: sup }
    const malo = Object.entries(campos).find(([c, v]) => v === 'x' || (c === 'ref' && v === null))
    if (malo) return { ok: false, campo: `inmuebles[${k}].${malo[0]}` }
    inmuebles.push(campos as InmuebleVolcado)
  }
  const contratos: ContratoVolcado[] = []
  for (const [k, x] of b.contratos.entries()) {
    const o = obj(x)
    const r = refUnica(o.ref)
    let inquilino: InquilinoVolcado | null | 'x' = null
    if (!nada(o.inquilino)) {
      const q = obj(o.inquilino)
      const nombre = txt(q.nombre, MAX_TEXTO)
      if (nombre === 'x' || (q.tipo !== 'persona' && q.tipo !== 'sociedad')) inquilino = 'x'
      else inquilino = nombre === null ? null : { nombre, tipo: q.tipo }
    }
    const indice = nada(o.indice) ? null : o.indice === 'IPC' || o.indice === 'IRAV' ? o.indice : 'x'
    const campos = { ref: r, inmueble: ref(o.inmueble), inquilino, inicio: fch(o.inicio), fin: fch(o.fin), rentaCent: cent(o.rentaCent), fianzaCent: cent(o.fianzaCent, true), indice }
    const malo = Object.entries(campos).find(([c, v]) => v === 'x' || (c === 'ref' && v === null))
    if (malo) return { ok: false, campo: `contratos[${k}].${malo[0]}` }
    contratos.push(campos as ContratoVolcado)
  }
  const gastos: GastoVolcado[] = []
  for (const [k, x] of b.gastos.entries()) {
    const o = obj(x)
    const r = refUnica(o.ref)
    const categoria = nada(o.categoria) ? null : esCategoriaGasto(o.categoria) ? o.categoria : 'x'
    const periodicidad = nada(o.periodicidad) ? null : (PERIODICIDADES_VOLCADO as readonly unknown[]).includes(o.periodicidad) ? (o.periodicidad as Periodicidad) : 'x'
    const dia = nada(o.diaMes) ? null : typeof o.diaMes === 'number' && Number.isInteger(o.diaMes) && o.diaMes >= 1 && o.diaMes <= 31 ? o.diaMes : 'x'
    const campos = { ref: r, inmueble: ref(o.inmueble), concepto: txt(o.concepto, MAX_TEXTO), categoria, periodicidad, importeCent: cent(o.importeCent), diaMes: dia, inicio: fch(o.inicio) }
    const malo = Object.entries(campos).find(([c, v]) => v === 'x' || (c === 'ref' && v === null))
    if (malo) return { ok: false, campo: `gastos[${k}].${malo[0]}` }
    gastos.push(campos as GastoVolcado)
  }
  return { ok: true, propuesta: { inmuebles, contratos, gastos } }
}

// ─── Evaluación contra lo que ya hay ──────────────────────────────────────────────────────────────────────

/** Inmueble que el titular YA tiene (solo los suyos: el adaptador los lee dentro del titular autorizado). */
export type InmuebleExistente = { id: string; alias: string; uso: string; inmueblePadreId: string | null }

export type ContextoVolcado = {
  inmuebles: readonly InmuebleExistente[]
  /** Clave natural → id de lo que ya existe (inmuebles `rc:`/`dir:`/`alias:`, unidades `u:`, contratos `ct:`, gastos fijos `pl:`). */
  existentes: ReadonlyMap<string, string>
}

export const claveUnidad = (edificioId: string, alias: string): string => `u:${edificioId}|${normalizarTexto(alias)}`
export const clavePlantilla = (x: { inmuebleId: string | null; concepto: string; periodicidad: string }): string =>
  `pl:${x.inmuebleId ?? '-'}|${normalizarTexto(x.concepto)}|${x.periodicidad}`
const claveContratoV = (inmuebleId: string, inicio: string) => `ct:${inmuebleId}|${inicio}`

export type EstadoElemento = 'nueva' | 'ya_existe' | 'con_problema'

/** A dónde apunta un elemento ya evaluado: a un inmueble que se CREA en este volcado (ref) o a uno que YA existe (id). */
export type Destino = { ref: string } | { id: string }

export type ElementoEvaluado = {
  ref: string
  estado: EstadoElemento
  motivo: string | null
  avisos: string[]
  /** Si ya existe: su id. */
  existenteId: string | null
}
export type InmuebleEvaluado = ElementoEvaluado & { edificio: Destino | null; direccionNormalizada: string | null; porValidar: boolean }
export type ContratoEvaluado = ElementoEvaluado & { inmueble: Destino | null }
export type GastoEvaluado = ElementoEvaluado & { inmueble: Destino | null }
export type EvaluacionVolcado = {
  inmuebles: InmuebleEvaluado[]
  contratos: ContratoEvaluado[]
  gastos: GastoEvaluado[]
  resumen: { nuevos: number; yaExisten: number; conProblema: number; inquilinos: number }
}

/**
 * Evalúa la propuesta contra lo que el titular ya tiene. Un elemento con problema NO se crea; los que dependen de él
 * (unidades de un edificio con problema, contratos de un piso con problema) tampoco, y lo dicen. Un uuid que no es de este
 * titular es «no encontrado» (nunca se escribe contra él). Lo que «ya existe» no se duplica y sus dependientes se
 * cuelgan del EXISTENTE (reimportar no duplica).
 */
export function evaluarVolcado(p: PropuestaVolcado, ctx: ContextoVolcado): EvaluacionVolcado {
  const porId = new Map(ctx.inmuebles.map((i) => [i.id, i]))
  const porRef = new Map(p.inmuebles.map((i) => [i.ref, i]))
  const evalInm = new Map<string, InmuebleEvaluado>()
  const vistas = new Map<string, string>()

  const evaluarInmueble = (i: InmuebleVolcado): InmuebleEvaluado => {
    const hecho = evalInm.get(i.ref)
    if (hecho) return hecho
    const avisos: string[] = []
    const alias = i.alias ?? i.direccion ?? i.referenciaCatastral
    const dirNorm = componerDireccion({ direccion: i.direccion, cp: i.cp, municipio: i.municipio, provincia: i.provincia })
    const base = { ref: i.ref, avisos, existenteId: null, edificio: null as Destino | null, direccionNormalizada: dirNorm, porValidar: false }
    const mal = (motivo: string): InmuebleEvaluado => ({ ...base, estado: 'con_problema', motivo })
    let r: InmuebleEvaluado
    if (alias === null) r = mal('Falta el nombre, la dirección o la referencia catastral.')
    else if (alias.length > 80) r = mal('El nombre pasa de 80 caracteres.')
    else if (i.uso === null) r = mal('Falta el uso (vivienda, local, edificio…).')
    else if (i.edificio !== null) {
      // UNIDAD de un edificio.
      let destino: Destino | null = null
      let problema: string | null = null
      const enProp = porRef.get(i.edificio)
      if (i.uso === 'edificio') problema = 'Un edificio no puede estar dentro de otro.'
      else if (enProp) {
        if (enProp.uso !== 'edificio' || enProp.edificio !== null) problema = `«${enProp.alias ?? enProp.ref}» no es un edificio.`
        else {
          const ed = evaluarInmueble(enProp)
          if (ed.estado === 'con_problema') problema = `El edificio «${enProp.alias ?? enProp.ref}» tiene que corregirse antes.`
          else destino = ed.existenteId !== null ? { id: ed.existenteId } : { ref: enProp.ref }
        }
      } else {
        const ex = porId.get(i.edificio)
        if (!ex) problema = 'El edificio indicado no está en tu patrimonio.'
        else if (ex.uso !== 'edificio' || ex.inmueblePadreId !== null) problema = `«${ex.alias}» no es un edificio.`
        else destino = { id: ex.id }
      }
      if (problema !== null) r = mal(problema)
      else {
        const clave = 'id' in destino! ? claveUnidad(destino!.id, alias) : `unew:${destino!.ref}|${normalizarTexto(alias)}`
        const existe = ctx.existentes.get(clave)
        if (i.direccion !== null || i.referenciaCatastral !== null) avisos.push('La unidad hereda la dirección y la referencia catastral del edificio.')
        if (existe) r = { ...base, edificio: destino, estado: 'ya_existe', motivo: 'Esta unidad ya existe en el edificio.', existenteId: existe }
        else if (vistas.has(clave)) r = mal(`Repetida (igual que ${vistas.get(clave)}).`)
        else {
          vistas.set(clave, alias)
          r = { ...base, edificio: destino, estado: 'nueva', motivo: null }
        }
      }
    } else {
      const claves = clavesDeInmueble({ referenciaCatastral: i.referenciaCatastral, direccion: i.direccion, cp: i.cp, alias, direccionNormalizada: dirNorm })
      const existe = claves.map((c) => ctx.existentes.get(c)).find((v) => v !== undefined)
      const previa = claves.map((c) => vistas.get(c)).find((v) => v !== undefined)
      if (i.direccion !== null) { avisos.push('Dirección por validar: la calle no se ha comprobado con el callejero del Catastro.'); base.porValidar = true }
      if (existe) r = { ...base, estado: 'ya_existe', motivo: 'Ya existe en tu patrimonio.', existenteId: existe }
      else if (previa !== undefined) r = mal(`Repetido (igual que «${previa}»).`)
      else {
        for (const c of claves) vistas.set(c, alias)
        r = { ...base, estado: 'nueva', motivo: null }
      }
    }
    evalInm.set(i.ref, r)
    return r
  }
  const inmuebles = p.inmuebles.map(evaluarInmueble)

  // Tope de unidades por edificio (las de la propuesta + las que ya cuelgan del existente).
  const porEdificio = new Map<string, InmuebleEvaluado[]>()
  for (const e of inmuebles) {
    if (e.estado !== 'nueva' || e.edificio === null) continue
    const k = 'id' in e.edificio ? e.edificio.id : `ref:${e.edificio.ref}`
    porEdificio.set(k, [...(porEdificio.get(k) ?? []), e])
  }
  for (const [k, us] of porEdificio) {
    const ya = k.startsWith('ref:') ? 0 : ctx.inmuebles.filter((x) => x.inmueblePadreId === k).length
    if (ya + us.length > MAX_UNIDADES_EDIFICIO) for (const u of us) { u.estado = 'con_problema'; u.motivo = `Un edificio admite como mucho ${MAX_UNIDADES_EDIFICIO} unidades.` }
  }

  /** Inmueble de un contrato/gasto → destino, o el problema. */
  const destinoDe = (r: RefInmueble): { d: Destino } | { problema: string } => {
    const enProp = porRef.get(r)
    if (enProp) {
      const e = evalInm.get(r)!
      if (e.estado === 'con_problema') return { problema: `El inmueble «${enProp.alias ?? enProp.ref}» tiene que corregirse antes.` }
      return { d: e.existenteId !== null ? { id: e.existenteId } : { ref: r } }
    }
    const ex = porId.get(r)
    return ex ? { d: { id: ex.id } } : { problema: 'El inmueble indicado no está en tu patrimonio.' }
  }

  const contratos: ContratoEvaluado[] = p.contratos.map((c) => {
    const avisos: string[] = []
    const base = { ref: c.ref, avisos, existenteId: null, inmueble: null as Destino | null }
    const mal = (motivo: string): ContratoEvaluado => ({ ...base, estado: 'con_problema', motivo })
    if (c.inmueble === null) return mal('Falta el inmueble del contrato.')
    const d = destinoDe(c.inmueble)
    if ('problema' in d) return mal(d.problema)
    if (c.inicio === null) return { ...mal('Falta la fecha de inicio.'), inmueble: d.d }
    if (c.fin !== null && c.fin < c.inicio) return { ...mal('La fecha de fin es anterior a la de inicio.'), inmueble: d.d }
    if (c.rentaCent === null) return { ...mal('Falta la renta mensual.'), inmueble: d.d }
    if (c.indice === null) avisos.push('Sin cláusula de actualización: se crea como «ninguna».')
    if (c.fin === null) avisos.push('Sin fecha de fin: contrato indefinido.')
    if (c.inquilino === null) avisos.push('Sin inquilino: puedes añadirlo después en el contrato.')
    else avisos.push('Del inquilino solo se guarda el nombre: su DNI, correo y teléfono los añades tú en el contrato.')
    if ('id' in d.d) {
      const k = claveContratoV(d.d.id, c.inicio)
      const existe = ctx.existentes.get(k)
      if (existe) return { ...base, inmueble: d.d, estado: 'ya_existe', motivo: 'Ya hay un contrato de ese inmueble con esa fecha de inicio.', existenteId: existe }
    }
    const kv = `ct:${'id' in d.d ? d.d.id : `ref:${d.d.ref}`}|${c.inicio}`
    if (vistas.has(kv)) return { ...mal('Repetido: hay otro contrato del mismo inmueble con la misma fecha de inicio.'), inmueble: d.d }
    vistas.set(kv, c.ref)
    return { ...base, inmueble: d.d, estado: 'nueva', motivo: null }
  })

  const gastos: GastoEvaluado[] = p.gastos.map((g) => {
    const base = { ref: g.ref, avisos: [] as string[], existenteId: null, inmueble: null as Destino | null }
    const mal = (motivo: string): GastoEvaluado => ({ ...base, estado: 'con_problema', motivo })
    let destino: Destino | null = null
    if (g.inmueble !== null) {
      const d = destinoDe(g.inmueble)
      if ('problema' in d) return mal(d.problema)
      destino = d.d
    } else base.avisos.push('Sin inmueble: se anota como gasto del titular.')
    const b2 = { ...base, inmueble: destino }
    if (g.concepto === null) return { ...b2, estado: 'con_problema', motivo: 'Falta el concepto.' }
    if (g.categoria === null) return { ...b2, estado: 'con_problema', motivo: 'Falta la categoría.' }
    if (g.periodicidad === null) return { ...b2, estado: 'con_problema', motivo: 'Falta cada cuánto se paga.' }
    if (g.diaMes === null) return { ...b2, estado: 'con_problema', motivo: 'Falta el día del mes en que se paga.' }
    if (g.inicio === null) return { ...b2, estado: 'con_problema', motivo: 'Falta desde cuándo se paga.' }
    if (g.importeCent === null) base.avisos.push('Sin importe: es un gasto variable que confirmarás con cada factura.')
    if (destino === null || 'id' in destino) {
      const existe = ctx.existentes.get(clavePlantilla({ inmuebleId: destino === null ? null : destino.id, concepto: g.concepto, periodicidad: g.periodicidad }))
      if (existe) return { ...b2, estado: 'ya_existe', motivo: 'Ya tienes ese gasto fijo.', existenteId: existe }
    }
    const kv = `pl:${destino === null ? '-' : 'id' in destino ? destino.id : `ref:${destino.ref}`}|${normalizarTexto(g.concepto)}|${g.periodicidad}`
    if (vistas.has(kv)) return { ...b2, estado: 'con_problema', motivo: 'Repetido en la propuesta.' }
    vistas.set(kv, g.ref)
    return { ...b2, estado: 'nueva', motivo: null }
  })

  const todos = [...inmuebles, ...contratos, ...gastos]
  return {
    inmuebles,
    contratos,
    gastos,
    resumen: {
      nuevos: todos.filter((e) => e.estado === 'nueva').length,
      yaExisten: todos.filter((e) => e.estado === 'ya_existe').length,
      conProblema: todos.filter((e) => e.estado === 'con_problema').length,
      inquilinos: contratos.filter((c, k) => c.estado === 'nueva' && p.contratos[k].inquilino !== null).length,
    },
  }
}

