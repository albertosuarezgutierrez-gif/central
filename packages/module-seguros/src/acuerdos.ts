// Acuerdos con compañías: comisiones por ramo, objetivos (rappel, mantener la
// clave, apertura) y la CLAVE de mediador por la que se produce cada uno.
// Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
// Tablas: seguros.claves_mediador · acuerdos_compania · acuerdo_comisiones ·
// acuerdo_objetivos (apps/asegura/prisma/sql/2026-10-06_seguros_acuerdos_companias.sql).
//
// Reglas puras, sin red ni BD. Las tres preguntas que resuelven:
//   1. ¿Con qué clave se produjo este recibo?          → `atribuirClave`
//   2. ¿Qué porcentaje pactado le toca?                  → `lineaAplicable`
//   3. ¿Es válido lo que se va a cargar (seed / BD)?     → `leerTramos`, `leerPct`, `leerSeedAcuerdos`
//
// 🚨 NULL ≠ 0 en todo el módulo. Un porcentaje que el acuerdo no dice es `null`
// («no consta»), y un 0 es un dato («este ramo no comisiona»). Ninguna función
// de aquí convierte uno en otro, y ninguna «escoge la primera» cuando hay dos
// respuestas posibles: lo dice (`ambiguo`). Elegir a ciegas produciría una
// comisión esperada plausible y falsa, que es peor que una ausente porque no
// deja hueco que la delate (regla raíz «el dato que SÍ está pero se lee mal»).

import { TIPOS_SEGURO } from './emision.ts'

// ─── Vocabulario cerrado (espejo de los CHECK de la migración) ───────────────

export const FUENTES_ACUERDO = ['apromes', 'directo', 'otra_asociacion'] as const
export type FuenteAcuerdo = (typeof FUENTES_ACUERDO)[number]

export const ESTADOS_CLAVE = ['activa', 'solicitada', 'sin_clave', 'baja'] as const
export type EstadoClave = (typeof ESTADOS_CLAVE)[number]

export const CANALES_CLAVE = ['directo', 'asociacion', 'colaboracion'] as const
export type CanalClave = (typeof CANALES_CLAVE)[number]

export const TIPOS_OBJETIVO = ['rappel', 'mantener_clave', 'apertura'] as const
export type TipoObjetivo = (typeof TIPOS_OBJETIVO)[number]

/** `colectivo` = cuenta la producción de toda la asociación: nunca se puede afirmar alcanzado desde aquí. */
export const AMBITOS_OBJETIVO = ['individual', 'colectivo'] as const
export type AmbitoObjetivo = (typeof AMBITOS_OBJETIVO)[number]

/** `otra` = la base no es ninguna que sepamos medir: el objetivo es «no calculable», no 0. */
export const BASES_OBJETIVO = [
  'primas_np', 'primas_cartera', 'primas_total', 'polizas_np', 'crecimiento_pct', 'otra',
] as const
export type BaseObjetivo = (typeof BASES_OBJETIVO)[number]

export const CRITERIOS_COBRO = ['cobradas', 'emitidas'] as const
export type CriterioCobro = (typeof CRITERIOS_COBRO)[number]

export type RamoAcuerdo = (typeof TIPOS_SEGURO)[number]

/** El valor si está en la lista cerrada; si no, `null`. Nunca se adivina el más parecido. */
export function deLista<T extends string>(lista: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null
}

// ─── Porcentajes ─────────────────────────────────────────────────────────────

export type LecturaPct = { ok: true; valor: number | null } | { ok: false; motivo: string }

/**
 * Un porcentaje de comisión tal como llega del seed o de la BD (ya en número).
 * `null`/`undefined` → «no consta» (`valor: null`), que es VÁLIDO. Un texto
 * («17,5») se rechaza a propósito: el seed se escribe con números, y aceptar
 * texto abriría la puerta a leer «1.234» como 1,23.
 */
export function leerPct(v: unknown): LecturaPct {
  if (v === null || v === undefined) return { ok: true, valor: null }
  if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, motivo: 'no es un número' }
  if (v < 0 || v > 100) return { ok: false, motivo: 'fuera de 0-100' }
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) {
    return { ok: false, motivo: 'más de 2 decimales' }
  }
  return { ok: true, valor: v }
}

// ─── Tramos de un objetivo ───────────────────────────────────────────────────

/**
 * Un escalón del objetivo: cubre `[desde, hasta)` de la base. `hasta` NULL = sin
 * techo (solo el último). `pct`/`importe` NULL = el documento no lo dice.
 */
export type Tramo = { desde: number; hasta: number | null; pct: number | null; importe: number | null }

export type LecturaTramos = { estado: 'ok'; tramos: Tramo[] } | { estado: 'ilegible'; motivo: string }

function numeroNoNegativo(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * Valida el jsonb `acuerdo_objetivos.tramos`. Un tramo mal formado deja TODO el
 * objetivo ilegible (no se salta ese tramo): con un escalón de menos, «te faltan
 * X € para el siguiente» saldría con un X falso. `[]` es legible = «sin tramos
 * estructurados» (el objetivo vive solo en `condiciones`).
 */
export function leerTramos(v: unknown): LecturaTramos {
  if (!Array.isArray(v)) return { estado: 'ilegible', motivo: 'tramos no es una lista' }
  const tramos: Tramo[] = []
  for (let i = 0; i < v.length; i++) {
    const t = v[i]
    if (typeof t !== 'object' || t === null || Array.isArray(t)) {
      return { estado: 'ilegible', motivo: `tramo ${i + 1}: no es un objeto` }
    }
    const o = t as Record<string, unknown>
    const desde = numeroNoNegativo(o.desde)
    if (desde === null) return { estado: 'ilegible', motivo: `tramo ${i + 1}: «desde» no es un número ≥ 0` }
    let hasta: number | null = null
    if (o.hasta !== null && o.hasta !== undefined) {
      hasta = numeroNoNegativo(o.hasta)
      if (hasta === null || hasta <= desde) {
        return { estado: 'ilegible', motivo: `tramo ${i + 1}: «hasta» tiene que ser mayor que «desde»` }
      }
    }
    const pct = leerPct(o.pct)
    if (!pct.ok) return { estado: 'ilegible', motivo: `tramo ${i + 1}: pct ${pct.motivo}` }
    let importe: number | null = null
    if (o.importe !== null && o.importe !== undefined) {
      importe = numeroNoNegativo(o.importe)
      if (importe === null) return { estado: 'ilegible', motivo: `tramo ${i + 1}: «importe» no es un número ≥ 0` }
    }
    tramos.push({ desde, hasta, pct: pct.valor, importe })
  }
  for (let i = 1; i < tramos.length; i++) {
    const prev = tramos[i - 1]
    if (prev.hasta === null) {
      return { estado: 'ilegible', motivo: `tramo ${i}: sin techo y no es el último` }
    }
    if (tramos[i].desde < prev.hasta) {
      return { estado: 'ilegible', motivo: `tramos ${i} y ${i + 1}: desordenados o solapados` }
    }
  }
  return { estado: 'ok', tramos }
}

// ─── 1. Recibo → clave ───────────────────────────────────────────────────────

/** Normaliza un código de mediador de CIMA para comparar: recorta, mayúsculas, espacios simples. `''` → `null`. */
export function normalizarCodigoCima(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ').toUpperCase()
  return s === '' ? null : s
}

export type ClaveParaAtribuir = {
  id: string
  companiaCodigoDgs: string
  codigosCima: readonly string[]
}

export type Atribucion =
  | { estado: 'clave'; claveId: string; codigo: string; desde: 'recibo' | 'poliza' }
  /** Ni el recibo ni la póliza traen código: no se sabe con qué clave se produjo. */
  | { estado: 'sin_codigo' }
  /** CIMA manda un código que no está en ninguna clave del tenant (calidad del dato). */
  | { estado: 'codigo_sin_asignar'; codigo: string; desde: 'recibo' | 'poliza' }
  /** El código está en dos claves a la vez: no se escoge una. */
  | { estado: 'codigo_en_varias_claves'; codigo: string; claveIds: string[] }

/**
 * ¿Con qué clave se produjo este recibo?
 *
 * Manda el código del RECIBO (`datos_extra.mediador.codigoInterno`); el de la
 * PÓLIZA (`datos_especificos.mediador.codigoInterno`) solo si el recibo no trae
 * ninguno. Si el recibo trae uno que no reconocemos NO se cae al de la póliza:
 * tras un cambio de clave el recibo es lo más reciente, y la póliza podría
 * seguir diciendo la clave vieja. Solo se miran las claves de ESA compañía.
 */
export function atribuirClave(
  entrada: { companiaCodigoDgs: string; codigoRecibo: unknown; codigoPoliza: unknown },
  claves: readonly ClaveParaAtribuir[],
): Atribucion {
  const deRecibo = normalizarCodigoCima(entrada.codigoRecibo)
  const codigo = deRecibo ?? normalizarCodigoCima(entrada.codigoPoliza)
  if (codigo === null) return { estado: 'sin_codigo' }
  const desde: 'recibo' | 'poliza' = deRecibo !== null ? 'recibo' : 'poliza'

  const coinciden = claves.filter(
    (c) =>
      c.companiaCodigoDgs === entrada.companiaCodigoDgs &&
      c.codigosCima.some((k) => normalizarCodigoCima(k) === codigo),
  )
  if (coinciden.length === 0) return { estado: 'codigo_sin_asignar', codigo, desde }
  if (coinciden.length > 1) {
    return { estado: 'codigo_en_varias_claves', codigo, claveIds: coinciden.map((c) => c.id) }
  }
  return { estado: 'clave', claveId: coinciden[0].id, codigo, desde }
}

export type ConflictoCodigo = { companiaCodigoDgs: string; codigo: string; claveIds: string[] }

/**
 * Códigos de CIMA que aparecen en más de una clave de la misma compañía. La BD
 * no lo impide (un EXCLUDE sobre `text[]` cuesta más de lo que aporta): lo
 * vigila esto, y el puerto lo devuelve para que la pantalla lo diga.
 */
export function conflictosCodigos(claves: readonly ClaveParaAtribuir[]): ConflictoCodigo[] {
  const mapa = new Map<string, { companiaCodigoDgs: string; codigo: string; ids: Set<string> }>()
  for (const c of claves) {
    for (const k of c.codigosCima) {
      const codigo = normalizarCodigoCima(k)
      if (codigo === null) continue
      const llave = `${c.companiaCodigoDgs}|${codigo}`
      const e = mapa.get(llave) ?? { companiaCodigoDgs: c.companiaCodigoDgs, codigo, ids: new Set<string>() }
      e.ids.add(c.id)
      mapa.set(llave, e)
    }
  }
  return [...mapa.values()]
    .filter((e) => e.ids.size > 1)
    .map((e) => ({ companiaCodigoDgs: e.companiaCodigoDgs, codigo: e.codigo, claveIds: [...e.ids].sort() }))
    .sort((a, b) => (a.companiaCodigoDgs + a.codigo).localeCompare(b.companiaCodigoDgs + b.codigo))
}

// ─── 2. Recibo → porcentaje pactado ──────────────────────────────────────────

export type LineaAcuerdo = {
  id: string
  ramo: string | null
  producto: string | null
  modalidad: string | null
  pctNp: number | null
  pctCartera: number | null
}

export type AcuerdoParaCalculo = {
  id: string
  companiaCodigoDgs: string
  claveId: string | null
  /** 'YYYY-MM-DD' */
  vigenciaDesde: string
  /** 'YYYY-MM-DD' o `null` = el documento no da fin. */
  vigenciaHasta: string | null
  /** `revisado_at IS NOT NULL`: cotejado con el documento original. */
  revisado: boolean
  comisiones: readonly LineaAcuerdo[]
}

export type ConsultaLinea = {
  companiaCodigoDgs: string
  claveId: string
  /** `polizas.tipo` */
  ramo: string
  /** Código de producto de la compañía: `polizas.datos_especificos.producto.ramoEntidad`. */
  producto?: string | null
  modalidad?: string | null
  /** Fecha de efecto del recibo ('YYYY-MM-DD…'). */
  fechaEfecto: string | null
  /** `poliza_recibos.clase_recibo`: NP → % nueva producción; CA → % cartera. */
  claseRecibo: string | null
}

export type Candidata = { acuerdoId: string; lineaId: string; pct: number | null }

export type LineaAplicable =
  | { estado: 'linea'; acuerdoIds: string[]; lineaIds: string[]; pct: number; revisado: boolean }
  /** Suplementos y demás clases: v1 no tiene regla para ellos. */
  | { estado: 'clase_sin_regla'; clase: string | null }
  | { estado: 'sin_fecha' }
  /** Hay acuerdo vigente de la compañía pero sin clave asignada: productividad «pendiente». */
  | { estado: 'acuerdo_sin_clave' }
  | { estado: 'sin_acuerdo' }
  /** Acuerdo vigente para esa clave, pero ninguna línea casa con el ramo/producto/modalidad. */
  | { estado: 'sin_linea' }
  /** Varias líneas posibles con porcentajes distintos (o alguno desconocido). */
  | { estado: 'ambiguo'; candidatas: Candidata[] }
  /** La línea existe pero el acuerdo no dice el porcentaje de esa clase. */
  | { estado: 'pct_no_consta'; acuerdoIds: string[]; lineaIds: string[] }

const RE_FECHA = /^(\d{4}-\d{2}-\d{2})/

function fechaIso(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const m = RE_FECHA.exec(v)
  if (!m) return null
  const d = new Date(`${m[1]}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1] ? null : m[1]
}

/** Para comparar producto/modalidad: minúsculas, sin tildes, espacios simples. `''` → `null`. */
function textoComparable(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const s = v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
  return s === '' ? null : s
}

type Par = { acuerdo: AcuerdoParaCalculo; linea: LineaAcuerdo }

/**
 * Candidatas por PRODUCTO primero y por RAMO después, que es como se cruzan las
 * dos fuentes:
 *   · `producto` es el código de producto de la compañía, el mismo que CIMA trae
 *     en `polizas.datos_especificos.producto.ramoEntidad` (Allianz 1434 = RC
 *     PYME) — el mismo criterio que ya usa `lineasComision` de
 *     `comision-pactada.ts`. Una línea con producto casa SOLO con ese producto,
 *     aunque su `ramo` no esté mapeado.
 *   · Si ninguna línea nombra el producto del recibo, valen las GENÉRICAS: sin
 *     producto y con el `ramo` (`polizas.tipo`) del recibo. Una línea ceñida a
 *     un producto con nombre comercial («Autos nuevo producto / Patinetes») no se
 *     aplica a todos los autos: no se sabe si el recibo es de ese producto.
 *   · Si el recibo NO trae producto, no hay con qué descartar: entran todas las
 *     del ramo (específicas y genéricas), y si sus % difieren acaba en
 *     `ambiguo` — nunca en «la primera».
 */
function candidatas(acuerdos: readonly AcuerdoParaCalculo[], c: ConsultaLinea): Par[] {
  const todas: Par[] = acuerdos.flatMap((acuerdo) => acuerdo.comisiones.map((linea) => ({ acuerdo, linea })))
  const producto = textoComparable(c.producto)
  if (producto !== null) {
    const exactas = todas.filter((p) => textoComparable(p.linea.producto) === producto)
    if (exactas.length > 0) return exactas
    return todas.filter((p) => textoComparable(p.linea.producto) === null && p.linea.ramo !== null && p.linea.ramo === c.ramo)
  }
  return todas.filter((p) => p.linea.ramo !== null && p.linea.ramo === c.ramo)
}

/** Igual para la modalidad: exacta si la hay; si no, las que no la nombran; sin dato, no se descarta nada. */
function afinarModalidad(pares: Par[], valor: string | null | undefined): Par[] {
  const buscado = textoComparable(valor)
  if (buscado === null) return pares
  const exactas = pares.filter((p) => textoComparable(p.linea.modalidad) === buscado)
  if (exactas.length > 0) return exactas
  return pares.filter((p) => textoComparable(p.linea.modalidad) === null)
}

/**
 * ¿Qué porcentaje pactado le toca a este recibo?
 *
 * Acuerdos de la compañía vigentes en la fecha de efecto (bordes incluidos) →
 * de ESA clave → líneas por producto o ramo (`candidatas`) → por modalidad. Con varias
 * líneas que dan el MISMO porcentaje no hay ambigüedad en el resultado (se
 * devuelven todas); con porcentajes distintos, o alguno desconocido, `ambiguo`.
 */
export function lineaAplicable(
  acuerdos: readonly AcuerdoParaCalculo[],
  c: ConsultaLinea,
): LineaAplicable {
  const clase = typeof c.claseRecibo === 'string' ? c.claseRecibo.trim().toUpperCase() : null
  const campo: 'pctNp' | 'pctCartera' | null = clase === 'NP' ? 'pctNp' : clase === 'CA' ? 'pctCartera' : null
  if (campo === null) return { estado: 'clase_sin_regla', clase: c.claseRecibo ?? null }

  const fecha = fechaIso(c.fechaEfecto)
  if (fecha === null) return { estado: 'sin_fecha' }

  const vigentes = acuerdos.filter((a) => {
    if (a.companiaCodigoDgs !== c.companiaCodigoDgs) return false
    const desde = fechaIso(a.vigenciaDesde)
    if (desde === null || fecha < desde) return false
    if (a.vigenciaHasta === null) return true
    const hasta = fechaIso(a.vigenciaHasta)
    return hasta !== null && fecha <= hasta
  })
  const deClave = vigentes.filter((a) => a.claveId === c.claveId)
  if (deClave.length === 0) {
    return vigentes.some((a) => a.claveId === null) ? { estado: 'acuerdo_sin_clave' } : { estado: 'sin_acuerdo' }
  }

  const pares = afinarModalidad(candidatas(deClave, c), c.modalidad)
  if (pares.length === 0) return { estado: 'sin_linea' }

  const acuerdoIds = [...new Set(pares.map((p) => p.acuerdo.id))]
  const lineaIds = pares.map((p) => p.linea.id)
  const pcts = pares.map((p) => p.linea[campo])

  if (pcts.every((p) => p === null)) return { estado: 'pct_no_consta', acuerdoIds, lineaIds }
  const primero = pcts[0]
  if (primero !== null && pcts.every((p) => p === primero)) {
    return {
      estado: 'linea',
      acuerdoIds,
      lineaIds,
      pct: primero,
      revisado: pares.every((p) => p.acuerdo.revisado),
    }
  }
  return {
    estado: 'ambiguo',
    candidatas: pares.map((p) => ({ acuerdoId: p.acuerdo.id, lineaId: p.linea.id, pct: p.linea[campo] })),
  }
}

// ─── Ramo literal del acuerdo → `tipo_seguro` ────────────────────────────────

/**
 * Solo coincidencias EXACTAS (sin tildes ni mayúsculas) contra una lista corta.
 * Lo demás —«Transportes», «Defensa jurídica», «Particulares», «Vida colectivo /
 * decesos», «RC profesional del corredor»…— devuelve `null`: la línea se pinta
 * con su literal y no se usa para calcular hasta que alguien la mapee. Adivinar
 * «Transportes» → `transporte_mercancias` (¿o cascos?) metería una comisión
 * pactada en recibos que no le tocan, sin dejar hueco que lo delate.
 */
const RAMO_POR_TEXTO: Record<string, RamoAcuerdo> = {
  'automoviles': 'auto', 'automovil': 'auto', 'autos': 'auto', 'auto': 'auto', 'automoviles individual': 'auto',
  'motos': 'moto', 'moto': 'moto',
  'hogar': 'hogar',
  'comunidades': 'comunidades',
  'accidentes': 'accidentes',
  'salud': 'salud',
  'decesos': 'decesos',
  'comercio': 'comercio', 'comercios': 'comercio',
  'rc': 'responsabilidad_civil', 'responsabilidad civil': 'responsabilidad_civil',
  'rc profesional': 'rc_profesional', 'responsabilidad civil profesional': 'rc_profesional',
  'd&o': 'dyo', 'dyo': 'dyo',
  'ciber': 'ciberriesgos', 'ciberriesgos': 'ciberriesgos',
  'flotas': 'flotas',
  'viajes': 'viaje', 'viaje': 'viaje',
  'empresas': 'empresas',
  'vida': 'vida', 'vida individual': 'vida',
  'mascotas': 'mascotas',
  'embarcaciones': 'embarcaciones',
  'decenal': 'decenal',
}

export function ramoDesdeTexto(texto: unknown): RamoAcuerdo | null {
  if (typeof texto !== 'string') return null
  const k = textoComparable(texto)
  return k === null ? null : (RAMO_POR_TEXTO[k] ?? null)
}

// ─── 3. El seed versionado (`apps/asegura/prisma/seed/acuerdos-*.json`) ──────

export type SeedComision = {
  ramo: RamoAcuerdo | null
  ramo_texto: string
  producto: string | null
  modalidad: string | null
  pct_np: number | null
  pct_cartera: number | null
  notas: string | null
}

export type SeedObjetivo = {
  tipo: TipoObjetivo
  ambito: AmbitoObjetivo
  base: BaseObjetivo
  criterio_cobro: CriterioCobro | null
  ramos: RamoAcuerdo[]
  periodo_desde: string
  periodo_hasta: string
  tramos: Tramo[]
  siniestralidad_max_pct: number | null
  condiciones: string | null
}

export type SeedAcuerdo = {
  compania: string
  fuente: FuenteAcuerdo
  fuente_nombre: string | null
  /** Etiqueta de la clave (se resuelve al cargar) o `null` = sin clave asignada. */
  clave: string | null
  vigencia_desde: string
  vigencia_hasta: string | null
  requisitos_apertura: string | null
  letra_pequena: string | null
  documento_fuente: string
  comisiones: SeedComision[]
  objetivos: SeedObjetivo[]
}

export type LecturaSeed =
  | { estado: 'ok'; acuerdos: SeedAcuerdo[] }
  | { estado: 'invalido'; errores: string[] }

const RE_DGS = /^[A-Z]\d{4}$/

function textoOpcional(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? null : s
}

/**
 * Valida un fichero de seed de acuerdos. Devuelve TODOS los errores, no el
 * primero: el seed lo escribe una persona (o un agente que extrae un PDF) y
 * corregirlo de uno en uno es como no tener validador.
 *
 * 🚨 Un seed NO puede declarar un acuerdo cotejado (`revisado`/`revisado_at`):
 * lo que entra por aquí nace SIN COTEJAR y solo Alberto lo coteja desde la
 * pantalla (decisión 06/10/2026). Si el seed pudiera decir «revisado», un
 * porcentaje mal extraído del PDF saldría con semáforo verde.
 */
export function leerSeedAcuerdos(json: unknown): LecturaSeed {
  const errores: string[] = []
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { estado: 'invalido', errores: ['el seed no es un objeto'] }
  }
  const raiz = json as Record<string, unknown>
  if (raiz.version !== 1) errores.push('version: se esperaba 1')
  if (!Array.isArray(raiz.acuerdos)) {
    return { estado: 'invalido', errores: [...errores, 'acuerdos: no es una lista'] }
  }

  const acuerdos: SeedAcuerdo[] = []
  const vistos = new Set<string>()
  raiz.acuerdos.forEach((bruto, i) => {
    const donde = `acuerdos[${i}]`
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
      errores.push(`${donde}: no es un objeto`)
      return
    }
    const a = bruto as Record<string, unknown>
    const antes = errores.length
    if ('revisado' in a || 'revisado_at' in a) {
      errores.push(`${donde}: un seed no puede declarar un acuerdo cotejado (revisado/revisado_at)`)
    }
    const compania = typeof a.compania === 'string' && RE_DGS.test(a.compania) ? a.compania : null
    if (compania === null) errores.push(`${donde}.compania: código DGS inválido`)
    const fuente = deLista(FUENTES_ACUERDO, a.fuente)
    if (fuente === null) errores.push(`${donde}.fuente: fuera de lista`)
    const fuenteNombre = textoOpcional(a.fuente_nombre)
    if (fuenteNombre === undefined) errores.push(`${donde}.fuente_nombre: no es texto`)
    if (fuente === 'otra_asociacion' && !fuenteNombre) errores.push(`${donde}.fuente_nombre: obligatorio con otra_asociacion`)
    const clave = textoOpcional(a.clave)
    if (clave === undefined) errores.push(`${donde}.clave: no es texto`)
    const desde = typeof a.vigencia_desde === 'string' ? fechaIso(a.vigencia_desde) : null
    if (desde === null || a.vigencia_desde !== desde) errores.push(`${donde}.vigencia_desde: fecha YYYY-MM-DD inválida`)
    let hasta: string | null = null
    if (a.vigencia_hasta !== null && a.vigencia_hasta !== undefined) {
      hasta = typeof a.vigencia_hasta === 'string' ? fechaIso(a.vigencia_hasta) : null
      if (hasta === null || a.vigencia_hasta !== hasta) errores.push(`${donde}.vigencia_hasta: fecha YYYY-MM-DD inválida`)
      else if (desde !== null && hasta < desde) errores.push(`${donde}.vigencia_hasta: anterior a vigencia_desde`)
    }
    const requisitos = textoOpcional(a.requisitos_apertura)
    if (requisitos === undefined) errores.push(`${donde}.requisitos_apertura: no es texto`)
    const letra = textoOpcional(a.letra_pequena)
    if (letra === undefined) errores.push(`${donde}.letra_pequena: no es texto`)
    const documento = textoOpcional(a.documento_fuente)
    if (!documento) errores.push(`${donde}.documento_fuente: obligatorio (de qué documento y página sale)`)

    const comisiones: SeedComision[] = []
    if (!Array.isArray(a.comisiones)) errores.push(`${donde}.comisiones: no es una lista`)
    else a.comisiones.forEach((lb, j) => {
      const dl = `${donde}.comisiones[${j}]`
      if (typeof lb !== 'object' || lb === null || Array.isArray(lb)) { errores.push(`${dl}: no es un objeto`); return }
      const l = lb as Record<string, unknown>
      let ramo: RamoAcuerdo | null = null
      if (l.ramo !== null && l.ramo !== undefined) {
        ramo = deLista(TIPOS_SEGURO, l.ramo)
        if (ramo === null) errores.push(`${dl}.ramo: no es un tipo_seguro (usa null si no se puede mapear)`)
      }
      const ramoTexto = textoOpcional(l.ramo_texto)
      if (!ramoTexto) errores.push(`${dl}.ramo_texto: obligatorio (el literal del acuerdo)`)
      const producto = textoOpcional(l.producto)
      const modalidad = textoOpcional(l.modalidad)
      const notas = textoOpcional(l.notas)
      if (producto === undefined || modalidad === undefined || notas === undefined) errores.push(`${dl}: producto/modalidad/notas tienen que ser texto o null`)
      const np = leerPct(l.pct_np)
      if (!np.ok) errores.push(`${dl}.pct_np: ${np.motivo}`)
      const ca = leerPct(l.pct_cartera)
      if (!ca.ok) errores.push(`${dl}.pct_cartera: ${ca.motivo}`)
      comisiones.push({
        ramo,
        ramo_texto: ramoTexto ?? '',
        producto: producto ?? null,
        modalidad: modalidad ?? null,
        pct_np: np.ok ? np.valor : null,
        pct_cartera: ca.ok ? ca.valor : null,
        notas: notas ?? null,
      })
    })

    const objetivos: SeedObjetivo[] = []
    if (!Array.isArray(a.objetivos)) errores.push(`${donde}.objetivos: no es una lista`)
    else a.objetivos.forEach((ob, j) => {
      const dobj = `${donde}.objetivos[${j}]`
      if (typeof ob !== 'object' || ob === null || Array.isArray(ob)) { errores.push(`${dobj}: no es un objeto`); return }
      const o = ob as Record<string, unknown>
      const tipo = deLista(TIPOS_OBJETIVO, o.tipo)
      if (tipo === null) errores.push(`${dobj}.tipo: fuera de lista`)
      const ambito = deLista(AMBITOS_OBJETIVO, o.ambito)
      if (ambito === null) errores.push(`${dobj}.ambito: fuera de lista (individual|colectivo)`)
      const base = deLista(BASES_OBJETIVO, o.base)
      if (base === null) errores.push(`${dobj}.base: fuera de lista`)
      let criterio: CriterioCobro | null = null
      if (o.criterio_cobro !== null && o.criterio_cobro !== undefined) {
        criterio = deLista(CRITERIOS_COBRO, o.criterio_cobro)
        if (criterio === null) errores.push(`${dobj}.criterio_cobro: fuera de lista (o null si no lo dice)`)
      }
      const ramos: RamoAcuerdo[] = []
      if (o.ramos !== null && o.ramos !== undefined) {
        if (!Array.isArray(o.ramos)) errores.push(`${dobj}.ramos: no es una lista`)
        else for (const r of o.ramos) {
          const rr = deLista(TIPOS_SEGURO, r)
          if (rr === null) errores.push(`${dobj}.ramos: «${String(r)}» no es un tipo_seguro`)
          else ramos.push(rr)
        }
      }
      const pd = typeof o.periodo_desde === 'string' ? fechaIso(o.periodo_desde) : null
      const ph = typeof o.periodo_hasta === 'string' ? fechaIso(o.periodo_hasta) : null
      if (pd === null || o.periodo_desde !== pd) errores.push(`${dobj}.periodo_desde: fecha inválida`)
      if (ph === null || o.periodo_hasta !== ph) errores.push(`${dobj}.periodo_hasta: fecha inválida`)
      if (pd !== null && ph !== null && ph < pd) errores.push(`${dobj}: periodo_hasta anterior a periodo_desde`)
      const tr = leerTramos(o.tramos ?? [])
      if (tr.estado !== 'ok') errores.push(`${dobj}.tramos: ${tr.motivo}`)
      const sin = leerPct(o.siniestralidad_max_pct)
      if (!sin.ok) errores.push(`${dobj}.siniestralidad_max_pct: ${sin.motivo}`)
      const condiciones = textoOpcional(o.condiciones)
      if (condiciones === undefined) errores.push(`${dobj}.condiciones: no es texto`)
      if (tipo && ambito && base && pd && ph && tr.estado === 'ok' && sin.ok) {
        objetivos.push({
          tipo, ambito, base, criterio_cobro: criterio, ramos,
          periodo_desde: pd, periodo_hasta: ph, tramos: tr.tramos,
          siniestralidad_max_pct: sin.valor, condiciones: condiciones ?? null,
        })
      }
    })

    if (compania && fuente && desde) {
      const llave = `${compania}|${fuente}|${desde}`
      if (vistos.has(llave)) errores.push(`${donde}: duplicado (compañía, fuente, vigencia_desde) = ${llave}`)
      vistos.add(llave)
    }
    if (errores.length === antes && compania && fuente && desde && documento) {
      acuerdos.push({
        compania, fuente,
        fuente_nombre: fuenteNombre ?? null,
        clave: clave ?? null,
        vigencia_desde: desde,
        vigencia_hasta: hasta,
        requisitos_apertura: requisitos ?? null,
        letra_pequena: letra ?? null,
        documento_fuente: documento,
        comisiones, objetivos,
      })
    }
  })

  return errores.length > 0 ? { estado: 'invalido', errores } : { estado: 'ok', acuerdos }
}
