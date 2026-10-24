// Enlace INMUEBLE ↔ PÓLIZA (spec `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md` §2).
//
// Reglas PURAS: qué estado de seguro tiene un inmueble y qué pólizas se le PROPONEN para enlazar. Sin BD, sin red,
// sin reloj: la vigencia de cada póliza enlazada la calcula el adaptador (`apps/asegura-portal/lib/patrimonio/
// seguros-inmueble-bd.ts`) y entra aquí ya resuelta.
//
// 🚨 TRES estados de verdad, y `null` es uno de ellos (regla de la casa: dato que NO hay ≠ dato que NO se ha mirado):
//   · `sin_mirar`  — nadie ha dicho nada. NO es «sin seguro».
//   · `sin_seguro` — el cliente DECLARÓ que no tiene (`sin_seguro_declarado_en`). Solo una declaración lo afirma;
//                    una ausencia de filas jamás.
//   · `con_seguro` — hay un enlace CONFIRMADO cuya póliza está en vigor.
// Y dos derivados que no se pueden colapsar en ninguno de los tres sin mentir:
//   · `con_seguro_no_vigente`   — hay enlaces confirmados, pero ninguno sigue en vigor (y no declaró «no tiene»).
//   · `enlazado_sin_comprobar`  — hay un enlace confirmado cuya vigencia NO se ha podido comprobar (la enlazó otra
//                                 persona con acceso y quien mira no ve esa póliza, o la cartera no se pudo leer).
//                                 Decir «sin mirar» invitaría a declarar «no tiene seguro» encima de un seguro.
//
// 🚨 El MATCH automático nunca escribe nada: PROPONE, y el cliente confirma («Sí, es este» / «No es este»).
//   · Por referencia catastral idéntica (solo las declaradas la traen: la cartera de CIMA no la expone al portal).
//   · Por CP + vía + número, SOLO con la dirección que quien mira PUEDE VER (`describirBien().ubicacion` de su nivel:
//     con nivel `tarjeta` llega `null` y no hay match). Casar con un campo oculto sería filtrarlo.
//   · Nunca por municipio solo, ni por compañía, ni por parecido: o casa entero o no se propone.

/** Lo que decidió el cliente sobre un par inmueble ↔ póliza (CHECK de `portal_patrimonio_inmueble_poliza.estado`). */
export const ESTADOS_DECISION_SEGURO = ['confirmado', 'rechazado'] as const
export type EstadoDecisionSeguro = (typeof ESTADOS_DECISION_SEGURO)[number]

/** De dónde salió el enlace (CHECK de `portal_patrimonio_inmueble_poliza.origen`): para medir cuánto acierta el match. */
export const ORIGENES_ENLACE = ['manual', 'propuesta_refcat', 'propuesta_direccion'] as const
export type OrigenEnlace = (typeof ORIGENES_ENLACE)[number]

export function esEstadoDecisionSeguro(v: unknown): v is EstadoDecisionSeguro {
  return typeof v === 'string' && (ESTADOS_DECISION_SEGURO as readonly string[]).includes(v)
}

export function esOrigenEnlace(v: unknown): v is OrigenEnlace {
  return typeof v === 'string' && (ORIGENES_ENLACE as readonly string[]).includes(v)
}

export type EstadoSeguroInmueble =
  | 'con_seguro'
  | 'enlazado_sin_comprobar'
  | 'sin_seguro'
  | 'con_seguro_no_vigente'
  | 'sin_mirar'

/** Una fila de `portal_patrimonio_inmueble_poliza` con la vigencia de su póliza ya resuelta por el adaptador. */
export interface EnlaceSeguro {
  /** Tal cual viene de la BD: lo que no se reconoce NO cuenta (fail-closed). */
  estado: string
  archivado: boolean
  /**
   * `true` = la póliza sigue en vigor · `false` = consta que no · `null` = no se ha podido comprobar (no la ve quien
   * mira, o la lectura falló). `null` NUNCA se lee como «no vigente» ni como «vigente».
   */
  vigente: boolean | null
}

export interface EntradaEstadoSeguro {
  enlaces: readonly EnlaceSeguro[]
  /** `portal_patrimonio_inmueble.sin_seguro_declarado_en`. `null` = no lo ha dicho (≠ no tiene). */
  sinSeguroDeclaradoEn: Date | null
}

/**
 * El estado de seguro de un inmueble. Orden de precedencia (cada regla, una línea):
 *  1. un enlace confirmado vigente → `con_seguro` (gana a la declaración: la UI ofrece quitarla);
 *  2. un enlace confirmado sin comprobar → `enlazado_sin_comprobar` (tampoco lo pisa la declaración);
 *  3. declaró «no tiene» → `sin_seguro` (más reciente que un enlace que ya no está en vigor);
 *  4. solo enlaces confirmados no vigentes → `con_seguro_no_vigente`;
 *  5. todo lo demás → `sin_mirar` (también los «No es este»: rechazar una propuesta no dice nada del seguro).
 */
export function estadoSeguroInmueble(x: EntradaEstadoSeguro): EstadoSeguroInmueble {
  const confirmados = x.enlaces.filter((e) => e.estado === 'confirmado' && !e.archivado)
  if (confirmados.some((e) => e.vigente === true)) return 'con_seguro'
  if (confirmados.some((e) => e.vigente === null)) return 'enlazado_sin_comprobar'
  if (x.sinSeguroDeclaradoEn !== null) return 'sin_seguro'
  if (confirmados.length > 0) return 'con_seguro_no_vigente'
  return 'sin_mirar'
}

/** Recuento para la tarjeta «Patrimonio» de Inicio. Cada inmueble cae en UN cubo; nada se suma a ciegas. */
export interface ResumenSegurosPatrimonio {
  inmuebles: number
  conSeguro: number
  /** `sin_seguro` + `con_seguro_no_vigente`: «sin seguro que nos conste» (no «sin seguro»). */
  sinSeguroQueNosConste: number
  /** `sin_mirar`: «sin revisar». */
  sinRevisar: number
  /** `enlazado_sin_comprobar`: ni se cuenta como asegurado ni como sin seguro. */
  sinComprobar: number
}

export function resumenSegurosPatrimonio(estados: readonly EstadoSeguroInmueble[]): ResumenSegurosPatrimonio {
  const r: ResumenSegurosPatrimonio = { inmuebles: estados.length, conSeguro: 0, sinSeguroQueNosConste: 0, sinRevisar: 0, sinComprobar: 0 }
  for (const e of estados) {
    if (e === 'con_seguro') r.conSeguro++
    else if (e === 'sin_seguro' || e === 'con_seguro_no_vigente') r.sinSeguroQueNosConste++
    else if (e === 'sin_mirar') r.sinRevisar++
    else r.sinComprobar++
  }
  return r
}

// ─── Match propuesto ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Ramos cuyo bien es un inmueble y pueden cubrir el de la ficha (spec §2.4). El vocabulario es el de
 * `seguros.tipo_seguro` más los alias que usan las declaradas (`comunidad`, `alquiler`). Auto, vida, salud…: nunca.
 */
const RAMOS_DE_INMUEBLE = new Set([
  'hogar',
  'comercio',
  'comunidades',
  'comunidad',
  'impago_alquiler',
  'alquiler',
  'responsabilidad_civil',
  'decenal',
  'empresas',
])

export function esRamoDeInmueble(ramo: string | null | undefined): boolean {
  return RAMOS_DE_INMUEBLE.has((ramo ?? '').trim().toLowerCase())
}

/** Referencia catastral del INMUEBLE (20 caracteres), sin espacios ni guiones. Otra cosa (la de 14, la finca) → `null`. */
export function normalizarRefCatastral(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-Z]{20}$/.test(t) ? t : null
}

export type TipoPolizaEnlace = 'cartera' | 'declarada'

/** Una póliza que la identidad VE (cartera de su nivel o declarada suya), reducida a lo que el match necesita. */
export interface CandidataEnlace {
  tipo: TipoPolizaEnlace
  id: string
  ramo: string | null
  /** Solo las declaradas: la cartera no expone la referencia catastral al portal. */
  referenciaCatastral: string | null
  /** La dirección TAL COMO LA VE quien mira (`null` en su nivel = no hay match por dirección). */
  ubicacion: string | null
}

export interface InmuebleParaEnlace {
  referenciaCatastral: string | null
  cp: string | null
  via: string | null
  numero: string | null
}

/** Un par que ya tiene decisión viva (confirmado o rechazado, sin archivar): no se vuelve a proponer. */
export interface DecisionEnlace {
  tipo: TipoPolizaEnlace
  id: string
}

export interface PropuestaEnlace {
  tipo: TipoPolizaEnlace
  id: string
  origen: Exclude<OrigenEnlace, 'manual'>
}

/** Tipos de vía y partículas que no identifican la calle («Calle del Socorro» = «C/ Socorro»). */
const PALABRAS_VACIAS = new Set([
  'calle', 'c', 'cl', 'cll', 'avenida', 'avda', 'av', 'avd', 'plaza', 'pl', 'pza', 'plz', 'paseo', 'po', 'pso',
  'camino', 'cm', 'cno', 'carretera', 'ctra', 'cr', 'ronda', 'rd', 'travesia', 'trv', 'tr', 'urbanizacion', 'urb',
  'glorieta', 'gta', 'pasaje', 'psje', 'pj', 'callejon', 'cjon', 'cuesta', 'cta', 'via', 'barrio', 'bo',
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'n', 'no', 'num', 'numero', 'nº',
])

function tokens(v: string): string[] {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

const sinVacias = (ts: string[]) => ts.filter((t) => !PALABRAS_VACIAS.has(t))

/** El número de portal normalizado («24», «24b», «24 B»). Sin dígitos (s/n, vacío) → `null`: sin número no se casa. */
function numeroPortal(v: string | null): string | null {
  if (v === null) return null
  const t = tokens(v).join('')
  return /^\d+[a-z]?$/.test(t) ? t : null
}

/**
 * ¿La dirección VISIBLE de la póliza es la del inmueble? Exige las tres cosas a la vez: el mismo CP (como palabra
 * suelta), la vía entera seguida y, justo detrás, el mismo número. Cualquier hueco → `false`.
 */
export function mismaDireccion(inmueble: InmuebleParaEnlace, ubicacion: string | null): boolean {
  if (ubicacion === null) return false
  const cp = inmueble.cp?.trim() ?? ''
  if (!/^\d{5}$/.test(cp)) return false
  const via = sinVacias(tokens(inmueble.via ?? ''))
  const numero = numeroPortal(inmueble.numero)
  if (via.length === 0 || numero === null) return false

  const crudos = tokens(ubicacion)
  if (!crudos.includes(cp)) return false
  const u = sinVacias(crudos)
  for (let i = 0; i + via.length <= u.length; i++) {
    if (!via.every((t, k) => u[i + k] === t)) continue
    // El número va justo detrás de la vía; admite la letra pegada o separada («24 B»).
    const siguiente = u[i + via.length]
    const letra = u[i + via.length + 1]
    if (siguiente === numero) return true
    if (siguiente !== undefined && letra !== undefined && /^[a-z]$/.test(letra) && `${siguiente}${letra}` === numero) return true
  }
  return false
}

/**
 * Las pólizas que se PROPONEN para este inmueble. Solo ramos de inmueble, solo lo que quien mira ve, y nunca un par
 * con decisión viva (ni confirmado, que ya está, ni rechazado, que el cliente ya dijo que no).
 * Por referencia catastral primero; si no, por dirección completa. Una póliza sale una vez.
 */
export function proponerEnlaces(
  inmueble: InmuebleParaEnlace,
  candidatas: readonly CandidataEnlace[],
  decisiones: readonly DecisionEnlace[],
): PropuestaEnlace[] {
  const decididas = new Set(decisiones.map((d) => `${d.tipo}:${d.id}`))
  const refInmueble = normalizarRefCatastral(inmueble.referenciaCatastral)
  const out: PropuestaEnlace[] = []
  const vistas = new Set<string>()
  for (const c of candidatas) {
    const clave = `${c.tipo}:${c.id}`
    if (vistas.has(clave) || decididas.has(clave)) continue
    if (!esRamoDeInmueble(c.ramo)) continue
    const ref = normalizarRefCatastral(c.referenciaCatastral)
    if (refInmueble !== null && ref !== null && ref === refInmueble) {
      out.push({ tipo: c.tipo, id: c.id, origen: 'propuesta_refcat' })
      vistas.add(clave)
      continue
    }
    if (mismaDireccion(inmueble, c.ubicacion)) {
      out.push({ tipo: c.tipo, id: c.id, origen: 'propuesta_direccion' })
      vistas.add(clave)
    }
  }
  return out
}

/**
 * El `origen` que se ESCRIBE. El navegador puede decir «vine de una propuesta», pero solo se cree si el servidor,
 * recalculando ahora, propone ESE par con ESE origen; si no, es `manual` (la métrica del match no se falsea).
 */
export function origenAEscribir(
  pedido: unknown,
  par: { tipo: TipoPolizaEnlace; id: string },
  propuestas: readonly PropuestaEnlace[],
): OrigenEnlace {
  if (pedido !== 'propuesta_refcat' && pedido !== 'propuesta_direccion') return 'manual'
  return propuestas.some((p) => p.tipo === par.tipo && p.id === par.id && p.origen === pedido) ? pedido : 'manual'
}

/**
 * ¿Sigue en vigor una póliza DECLARADA (la que el cliente aportó)? Para el estado del inmueble.
 *  · eliminada, o el cliente contestó «no» a «¿sigue vigente?» → `false`;
 *  · con vencimiento ya pasado → `false`, salvo que haya contestado «sí» (renovó y no ha actualizado la fecha);
 *  · sin vencimiento o con vencimiento futuro → `true`: la aportó él y no la ha quitado (su declaración ES el dato).
 * Las columnas `date` llegan como medianoche UTC: se compara por día (`YYYY-MM-DD`), no por instante.
 */
export function declaradaVigente(
  d: { eliminadaEn: Date | null; fechaVencimiento: Date | null; vigenteDeclarada: string | null },
  hoy: Date,
): boolean {
  if (d.eliminadaEn !== null || d.vigenteDeclarada === 'no') return false
  if (d.fechaVencimiento === null) return true
  if (d.fechaVencimiento.toISOString().slice(0, 10) >= hoy.toISOString().slice(0, 10)) return true
  return d.vigenteDeclarada === 'si'
}
