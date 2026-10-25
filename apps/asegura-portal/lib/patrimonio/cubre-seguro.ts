// PATRIMONIO (25/10/2026) — «¿Esto lo cubre tu seguro?». PURO (sin prisma, sin sesión, sin reloj: `hoy` entra).
//
// Cuando un gasto CONFIRMADO del inmueble es una reparación de las que suele cubrir un seguro de hogar (agua, cristales,
// electricidad, cerrajería, tormenta…), se avisa. Tres piezas:
//  1. `clasificarReparacion`: palabras clave sobre el concepto/proveedor (la lectura IA solo da la CATEGORÍA, que es
//     demasiado gruesa: «Mantenimiento» incluye la revisión anual de la caldera, que ningún seguro paga).
//  2. `coberturaHogar`: qué dice el inmueble de su seguro de hogar → `cubre` / `sin_seguro` / `sin_comprobar`.
//  3. `hrefDarParte`: el enlace al parte EXISTENTE (`/boveda?vista=siniestro&poliza=…`) con descripción y fecha.
//
// 🚨 Lo que este aviso NO dice: que el seguro lo cubra. Dice «puede que». Y `null` ≠ «sin seguro»: una póliza enlazada
// que esta identidad no ve (la enlazó otra persona) o de la que no consta la vigencia es `sin_comprobar`, jamás
// «No vemos seguro». Un parte enviado NO es un siniestro comunicado: aquí solo se abre el formulario.
import type { CategoriaGasto } from '@central/module-patrimonio'

import type { FilaEnlace, PolizaVisible } from './seguros-inmueble-api.ts'

export const TIPOS_REPARACION = ['agua', 'cristales', 'electricidad', 'cerrajeria', 'tormenta', 'robo', 'incendio'] as const
export type TipoReparacion = (typeof TIPOS_REPARACION)[number]

export const ETIQUETA_REPARACION: Record<TipoReparacion, string> = {
  agua: 'daños por agua',
  cristales: 'cristales',
  electricidad: 'electricidad',
  cerrajeria: 'cerrajería',
  tormenta: 'tormenta o temporal',
  robo: 'robo o vandalismo',
  incendio: 'incendio o humo',
}

/** Categorías de gasto en las que cabe una reparación. El resto (impuestos, comunidad, seguro, gestoría…) nunca. */
const CATEGORIAS_CON_REPARACION: ReadonlySet<string> = new Set<CategoriaGasto | 'SIN_CATEGORIA'>(['MANTENIMIENTO', 'REFORMAS', 'OTRO', 'SIN_CATEGORIA'])

/** Minúsculas, sin tildes y con espacios simples: «Fontanería» y «fontaneria» son lo mismo. */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const PATRONES: readonly [TipoReparacion, RegExp][] = [
  ['agua', /\b(fuga|fugas|fontaner\w*|tuberia\w*|caneria\w*|filtracion\w*|inundacion\w*|desatasc\w*|atasco\w*|gotera\w*|humedad\w*|rotura de agua|dano\w* por agua|escape de agua)\b/],
  ['cristales', /\b(cristal\w*|vidrio\w*|vidrier\w*|luna rota|lunas)\b/],
  ['electricidad', /\b(electricista\w*|cortocircuito\w*|sobretension\w*|cuadro electrico|averia electrica|instalacion electrica averiada)\b/],
  ['cerrajeria', /\b(cerrajer\w*|cerrajero\w*|cerradura\w*|bombin\w*|apertura de puerta|puerta forzada)\b/],
  ['tormenta', /\b(tormenta\w*|granizo|temporal|rayo|viento fuerte|tejado\w* danado\w*|danos por (viento|lluvia|tormenta))\b/],
  ['robo', /\b(robo|hurto|vandalis\w*|intento de robo|okupa\w*|allanamiento)\b/],
  ['incendio', /\b(incendio\w*|humo|siniestro por fuego)\b/],
]

/** Palabras de un servicio PROGRAMADO: «revisión de la instalación eléctrica» no es un daño. */
const PROGRAMADO = /\b(revision\w*|mantenimiento (anual|periodico|preventivo)|certificado\w*|boletin\w*|inspeccion\w*|instalacion nueva|alta de|contrato de mantenimiento|cambio de (bombilla\w*|lampara\w*))\b/
/** …salvo que diga que algo se ha roto. */
const DANO = /\b(averia\w*|fuga\w*|rotura\w*|roto\w*|rota\w*|danado\w*|dano\w*|urgen\w*|inundacion\w*|robo|forzad\w*|siniestro\w*|reparacion\w*)\b/

export type GastoParaClasificar = { categoria: string | null; concepto: string | null; proveedor?: string | null }

/**
 * ¿Es una reparación que un seguro de hogar suele cubrir? `null` = no (o no se sabe: sin concepto no se adivina).
 * Una categoría fuera de las admitidas nunca; un servicio programado sin palabra de avería tampoco.
 */
export function clasificarReparacion(g: GastoParaClasificar): TipoReparacion | null {
  if (!CATEGORIAS_CON_REPARACION.has(g.categoria ?? 'SIN_CATEGORIA')) return null
  const texto = normalizarTexto(`${g.concepto ?? ''} ${g.proveedor ?? ''}`)
  if (texto === '') return null
  if (PROGRAMADO.test(texto) && !DANO.test(texto)) return null
  for (const [tipo, re] of PATRONES) if (re.test(texto)) return tipo
  return null
}

// ─── Qué seguro de hogar tiene el inmueble ──────────────────────────────────────────────────────────────

export type CoberturaHogar =
  | { estado: 'cubre'; polizaValor: string; compania: string | null; vence: string | null; puedeParte: boolean }
  | { estado: 'sin_seguro' }
  | { estado: 'sin_comprobar' }

const esHogar = (ramo: string | null) => (ramo ?? '').trim().toLowerCase() === 'hogar'

/**
 * La póliza de hogar ENLAZADA (confirmada) y en vigor del inmueble.
 *  · `visibles === null` (cartera o declaradas ilegibles) → `sin_comprobar`.
 *  · Hogar vigente y visible → `cubre`. Con varias, la de vencimiento más lejano; la de cartera antes que la declarada.
 *  · Un enlace confirmado que esta identidad no ve, o cuya vigencia no consta, y ningún hogar vigente → `sin_comprobar`.
 *  · Ni enlaces confirmados ni hogar vigente entre lo visible → `sin_seguro`.
 * `puedeParte`: ids de cartera sobre los que esta identidad puede dar parte (`polizasParaParte`); las declaradas son suyas.
 */
export function coberturaHogar(
  enlaces: readonly FilaEnlace[],
  visibles: readonly PolizaVisible[] | null,
  puedeParteCartera: ReadonlySet<string>,
): CoberturaHogar {
  if (visibles === null) return { estado: 'sin_comprobar' }
  const porClave = new Map(visibles.map((v) => [`${v.tipo}:${v.id}`, v]))
  const candidatas: PolizaVisible[] = []
  let dudosa = false
  for (const f of enlaces) {
    if (f.estado !== 'confirmado') continue
    const clave = f.polizaId !== null && f.polizaDeclaradaId === null ? `cartera:${f.polizaId}` : f.polizaDeclaradaId !== null && f.polizaId === null ? `declarada:${f.polizaDeclaradaId}` : null
    const v = clave === null ? undefined : porClave.get(clave)
    if (!v) {
      dudosa = true // enlazada por otra persona (no la veo) o fila rara: no se sabe qué es
      continue
    }
    if (!esHogar(v.ramo)) continue
    if (v.vigente === true) candidatas.push(v)
    else if (v.vigente === null) dudosa = true
  }
  if (candidatas.length > 0) {
    candidatas.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'cartera' ? -1 : 1) || (b.vence ?? '').localeCompare(a.vence ?? ''))
    const p = candidatas[0]
    return {
      estado: 'cubre', polizaValor: `${p.tipo}:${p.id}`, compania: p.compania, vence: p.vence,
      puedeParte: p.tipo === 'declarada' ? true : puedeParteCartera.has(p.id),
    }
  }
  return dudosa ? { estado: 'sin_comprobar' } : { estado: 'sin_seguro' }
}

// ─── El enlace al parte (la lógica del parte no se toca: solo se abre con datos de partida) ───────────────

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** Texto de partida del parte. Solo hechos del gasto; lo que ha pasado lo cuenta la persona. */
export function descripcionDeGasto(x: { tipo: TipoReparacion; concepto: string; inmuebleAlias: string; fecha: string }): string {
  const alias = x.inmuebleAlias.trim().slice(0, 80)
  return `Reparación en «${alias}» (${ETIQUETA_REPARACION[x.tipo]}), factura del ${fechaEs(x.fecha)}: ${x.concepto.trim().slice(0, 300)}. Qué ha pasado: `
}

/** `/boveda?vista=siniestro&poliza=…&descripcion=…&fecha=…` — `poliza` es solo una sugerencia que el parte revalida. */
export function hrefDarParte(x: { polizaValor: string; descripcion: string; fecha: string }): string {
  const q = new URLSearchParams({ vista: 'siniestro', poliza: x.polizaValor, descripcion: x.descripcion, fecha: x.fecha })
  return `/boveda?${q.toString()}`
}

export type PrellenadoParte = { descripcion: string; fechaHecho: string }

/**
 * Lo que `/boveda` acepta de la URL para prellenar el parte. Nada de esto se fía: la fecha tiene que ser real y no futura
 * (`hoy` entra), la descripción se recorta a `max` y se le quitan los caracteres de control. Sin nada válido → `null`.
 */
export function prellenadoDeUrl(
  params: { descripcion?: unknown; fecha?: unknown },
  hoy: string,
  max: number,
  esFechaReal: (v: unknown) => boolean,
): PrellenadoParte | null {
  const d = typeof params.descripcion === 'string' ? params.descripcion.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trimStart().slice(0, max) : ''
  const f = typeof params.fecha === 'string' && esFechaReal(params.fecha) && params.fecha <= hoy ? params.fecha : ''
  return d === '' && f === '' ? null : { descripcion: d, fechaHecho: f }
}

// ─── Descartar el aviso (se recuerda en `portal_aviso_leido`, sin tabla nueva) ────────────────────────────────

const PREFIJO_DESCARTE = 'cubre_seguro:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const claveDescarte = (gastoId: string) => `${PREFIJO_DESCARTE}${gastoId}`
export const esClaveDescarte = (clave: string) => clave.startsWith(PREFIJO_DESCARTE) && UUID.test(clave.slice(PREFIJO_DESCARTE.length))
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

// ─── El aviso de un gasto y lo que cuenta «Pendiente de ti» ───────────────────────────────────────────────

export type AvisoCubre = {
  gastoId: string
  inmuebleId: string
  inmuebleAlias: string
  concepto: string
  fecha: string
  /** `null` = el total no consta (nunca 0). */
  totalCent: number | null
  tipo: TipoReparacion
  cobertura: CoberturaHogar
  descartado: boolean
}

export type ResumenCubre = { cubre: number; sinSeguro: number; sinComprobar: number }

/** Cuenta los avisos NO descartados por desenlace. */
export function resumirCubre(avisos: readonly AvisoCubre[]): ResumenCubre {
  const r: ResumenCubre = { cubre: 0, sinSeguro: 0, sinComprobar: 0 }
  for (const a of avisos) {
    if (a.descartado) continue
    if (a.cobertura.estado === 'cubre') r.cubre++
    else if (a.cobertura.estado === 'sin_seguro') r.sinSeguro++
    else r.sinComprobar++
  }
  return r
}

/** Ventana: reparaciones de los últimos 12 meses (el plazo para comunicar un siniestro es de 7 días, pero la factura llega tarde). */
export function desdeVentana(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number)
  const t = new Date(Date.UTC(y - 1, m - 1, d))
  return t.toISOString().slice(0, 10)
}
