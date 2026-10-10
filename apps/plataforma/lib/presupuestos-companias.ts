// «Presupuestos de compañías» de una oportunidad — lo PURO (07/10/2026): sin red, sin envs, importable
// desde `'use client'`. UN formulario de riesgo común + los extras que declara cada bot (registro de
// capacidades de `@central/module-tarificacion`). Añadir un bot = registrar su capacidad: esto no cambia.
//
// 🚨 TARIFICAR ≠ EMITIR: aquí solo se piden PRECIOS. 🚨 Vacío = `null` («no se sabe»), nunca 0 ni false.

import {
  catalogoCotizacion,
  validarExtras,
  validarFormularioComunidad,
  type CapacidadCotizacion,
} from '@central/module-tarificacion'
import {
  formularioConUltimoRiesgo,
  formularioInicial,
  importeDeTexto,
  importeParaCampo,
  leerTrabajoBot,
  type FormularioRiesgo,
  type TrabajoBot,
} from './tarificador-asegura-reglas.ts'

/** Claves del modal antiguo que eran del portal de Allianz: ahora son extras de su capacidad. */
const SOLO_ALLIANZ = ['tipoVivienda', 'uso', 'listaPropietarios'] as const

/** El formulario COMÚN (texto tal cual se teclea). Mismos campos que el modal de antes, sin los de Allianz. */
export type FormularioComun = Omit<FormularioRiesgo, (typeof SOLO_ALLIANZ)[number]>
/** compañía (clave canónica) → clave del extra → texto tecleado. */
export type ExtrasFormulario = Record<string, Record<string, string>>

export type CompaniaDisponible = Pick<CapacidadCotizacion, 'compania' | 'nombre' | 'producto' | 'extras'>

/** Bots que cotizan ese ramo (hoy: Allianz · comunidades). Vacío = ningún bot para ese ramo. */
export function companiasDisponibles(ramo: string): CompaniaDisponible[] {
  return catalogoCotizacion().deRamo(ramo).map(({ compania, nombre, producto, extras }) => ({ compania, nombre, producto, extras }))
}

/** Ramos que algún bot cotiza (para «Pedir presupuesto» desde la ficha). */
export function ramosConBot(): string[] {
  return catalogoCotizacion().ramos()
}

function quitarAllianz(f: FormularioRiesgo): FormularioComun {
  const { tipoVivienda: _t, uso: _u, listaPropietarios: _l, ...comun } = f
  return comun
}

/** Formulario común inicial (fechas mañana/+1 año; CP/municipio/provincia/calle de la ficha si los hay). */
export function formularioComunInicial(
  c?: { codigoPostal?: string | null; ciudad?: string | null; provincia?: string | null; direccion?: string | null } | null,
  hoy: Date = new Date(),
): FormularioComun {
  return quitarAllianz(formularioInicial(c ?? null, hoy))
}

/** Lo del riesgo libre (`info_riesgo.datosRiesgoLibre`) que puede sembrar el formulario de los bots. */
export type RiesgoLibreParaBots = { capital: number | null; direccion: string | null }

/**
 * Siembra el formulario de los bots (comunidades) con el capital y la dirección del bloque «Datos del riesgo» de la
 * oportunidad (07/10/2026), SOLO en los campos que están vacíos: lo ya guardado o tecleado manda siempre. El capital
 * va a «capital de edificación»; la dirección entera, al campo de la calle (se revisa), y el código postal solo si la
 * dirección trae uno y solo uno de 5 cifras. Sin capital > 0 o sin dirección, nada: `null` ≠ 0, no se inventa.
 * Devuelve qué se sembró para decirlo en pantalla («revísalos»).
 */
export function sembrarDesdeRiesgoLibre(f: FormularioComun, libre: RiesgoLibreParaBots | null | undefined): { formulario: FormularioComun; sembrados: string[] } {
  const formulario: FormularioComun = { ...f }
  const sembrados: string[] = []
  if (libre && typeof libre.capital === 'number' && Number.isFinite(libre.capital) && libre.capital > 0 && formulario.capitalContinente.trim() === '') {
    formulario.capitalContinente = importeParaCampo(libre.capital)
    sembrados.push('capital')
  }
  const dir = typeof libre?.direccion === 'string' ? libre.direccion.replace(/\s+/g, ' ').trim() : ''
  if (dir !== '') {
    if (formulario.via.trim() === '') { formulario.via = dir; sembrados.push('dirección') }
    const cps = [...new Set(dir.match(/(?<!\d)\d{5}(?!\d)/g) ?? [])]
    if (cps.length === 1 && formulario.codigoPostal.trim() === '') { formulario.codigoPostal = cps[0]; sembrados.push('código postal') }
  }
  return { formulario, sembrados }
}

/** Texto cuando un ramo SIN tarifa de Codeoscopic sí tiene bots de compañía (hoy, comunidades). */
export const AVISO_COTIZA_POR_BOTS = 'Este ramo se cotiza con los bots de las compañías («Presupuestos de compañías», más abajo), no con la tarifa de Codeoscopic. Los datos de este bloque siembran ese formulario y quedan en el expediente.'

/** El aviso de un ramo sin tarifa: el de «se cotiza fuera» solo si de verdad no hay ningún bot que lo cotice. */
export function avisoRamoSinTarifa(ramo: string, avisoPorDefecto: string): string {
  return companiasDisponibles(ramo).length > 0 ? AVISO_COTIZA_POR_BOTS : avisoPorDefecto
}

/** Extras iniciales de cada compañía: el `porDefecto` que declara su capacidad, o vacío. */
export function extrasIniciales(companias: readonly CompaniaDisponible[]): ExtrasFormulario {
  const out: ExtrasFormulario = {}
  for (const c of companias) out[c.compania] = Object.fromEntries(c.extras.map((x) => [x.clave, x.porDefecto ?? '']))
  return out
}

const textoDe = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'boolean' ? (v ? 'si' : 'no') : null

/**
 * Pre-relleno con un riesgo/formulario guardado (mismas claves que `RiesgoComunidad`). Reutiliza
 * `formularioConUltimoRiesgo` del modal de siempre (fechas caducadas no pasan; solo claves conocidas).
 */
export function comunConRiesgo(base: FormularioComun, riesgo: Record<string, unknown>, hoy: Date = new Date()): FormularioComun {
  const lleno = formularioConUltimoRiesgo({ ...base, tipoVivienda: '', uso: '', listaPropietarios: '' }, riesgo, hoy)
  return quitarAllianz(lleno)
}

/**
 * Extras pre-rellenados: lo guardado para esa compañía manda; si no hay, lo que traiga un riesgo antiguo
 * con esa clave (el riesgo de Allianz ya llevaba `tipoVivienda`, `uso`…); si no, lo que había.
 */
export function extrasConGuardado(
  base: ExtrasFormulario,
  companias: readonly CompaniaDisponible[],
  guardados: Record<string, Record<string, unknown>> | null,
  riesgoAntiguo: Record<string, unknown> | null,
): ExtrasFormulario {
  const out: ExtrasFormulario = {}
  for (const c of companias) {
    const g = guardados?.[c.compania] ?? null
    out[c.compania] = { ...(base[c.compania] ?? {}) }
    for (const x of c.extras) {
      const v = textoDe(g?.[x.clave]) ?? (g ? null : textoDe(riesgoAntiguo?.[x.clave]))
      if (v !== null) out[c.compania][x.clave] = v
    }
  }
  return out
}

const entero = (s: string): number | null => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null)
const texto = (s: string): string | null => (s.trim() ? s.trim() : null)
const triestado = (v: '' | 'si' | 'no'): boolean | null => (v === 'si' ? true : v === 'no' ? false : null)

export type Preparado =
  | { ok: true; formulario: Record<string, unknown>; extras: Record<string, Record<string, string>>; companias: string[] }
  | { ok: false; errores: string[] }

/**
 * Formulario común + extras + compañías elegidas → cuerpo para asegura, validado ANTES de encolar con las
 * MISMAS reglas que aplicará asegura (`validarFormularioComunidad` y `validarExtras` del módulo). Los
 * errores de forma (texto que no es número/importe) se dicen en castellano de pantalla.
 */
export function prepararPedido(
  f: FormularioComun,
  extras: ExtrasFormulario,
  elegidas: readonly string[],
  disponibles: readonly CompaniaDisponible[],
  hoy: Date = new Date(),
): Preparado {
  const errores: string[] = []
  const companias = disponibles.filter((c) => elegidas.includes(c.compania))
  if (companias.length === 0) errores.push('Elige al menos una compañía')
  const num = (etiqueta: string, s: string, obligatorio: boolean): number | null => {
    if (!s.trim()) { if (obligatorio) errores.push(`${etiqueta}: obligatorio`); return null }
    const n = entero(s)
    if (n === null) errores.push(`${etiqueta}: pon un número entero`)
    return n
  }
  const importe = (etiqueta: string, s: string, obligatorio: boolean): number | null => {
    if (!s.trim()) { if (obligatorio) errores.push(`${etiqueta}: obligatorio, ninguna compañía calcula sin él`); return null }
    const n = importeDeTexto(s)
    if (n === null) errores.push(`${etiqueta}: pon un importe en euros mayor que 0, p. ej. 1.500.000`)
    return n
  }
  if (!texto(f.fechaEfecto)) errores.push('Fecha de efecto: obligatoria')
  if (!texto(f.fechaTermino)) errores.push('Fecha de término: obligatoria')
  const cp = texto(f.codigoPostal)
  if (!cp || !/^\d{5}$/.test(cp)) errores.push('Código postal: 5 dígitos')
  const formulario: Record<string, unknown> = {
    ramo: 'comunidades',
    direccion: { via: texto(f.via), numero: texto(f.numero), codigoPostal: cp, municipio: texto(f.municipio), provincia: texto(f.provincia) },
    fechaEfecto: texto(f.fechaEfecto), fechaTermino: texto(f.fechaTermino),
    m2Construidos: num('Metros cuadrados', f.m2Construidos, true),
    anioConstruccion: num('Año de construcción', f.anioConstruccion, true),
    plantas: num('Plantas sobre la calle', f.plantas, true),
    numEdificios: num('Nº de edificios', f.numEdificios, true),
    numViviendasYLocales: num('Nº de viviendas y locales', f.numViviendasYLocales, true),
    capitalContinente: importe('Capital de edificación (valor de reposición)', f.capitalContinente, true),
    capitalContenido: importe('Capital de contenido', f.capitalContenido, false),
    ascensor: triestado(f.ascensor), piscina: triestado(f.piscina),
    calidadConstruccion: f.calidadConstruccion || null,
  }
  if (errores.length) return { ok: false, errores }
  // Reglas de dominio (fechas caducadas, rangos de año, término > efecto…): las del módulo, como en asegura.
  const v = validarFormularioComunidad(formulario, hoy)
  if (!v.ok) errores.push(...v.errores)
  const extrasLimpios: Record<string, Record<string, string>> = {}
  for (const c of companias) {
    const propios = extras[c.compania] ?? {}
    const x = validarExtras(c, propios)
    if (!x.ok) errores.push(...x.errores)
    extrasLimpios[c.compania] = Object.fromEntries(c.extras.map((e) => [e.clave, (propios[e.clave] ?? '').trim()]))
  }
  if (errores.length) return { ok: false, errores }
  return { ok: true, formulario, extras: extrasLimpios, companias: companias.map((c) => c.compania) }
}

// ─── Lo que devuelve asegura ────────────────────────────────────────────────

export type TrabajoCompania = TrabajoBot & { id: string; compania: string; ramo: string }

export type LecturaPresupuestos = {
  ramo: string
  guardado: { formulario: Record<string, unknown>; extras: Record<string, Record<string, unknown>>; companias: string[]; actualizadoEn: string | null } | null
  previo: { riesgo: Record<string, unknown>; creadoEn: string | null } | null
  trabajos: TrabajoCompania[]
}

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** GET de la sección → forma conocida, o `null` si no la tiene (no se pinta nada inventado). */
export function leerPresupuestos(v: unknown): LecturaPresupuestos | null {
  const o = obj(v)
  if (!o || o.estado !== 'ok' || typeof o.ramo !== 'string') return null
  const g = obj(o.guardado)
  const gf = obj(g?.formulario)
  const extras: Record<string, Record<string, unknown>> = {}
  for (const [k, x] of Object.entries(obj(g?.extras) ?? {})) { const e = obj(x); if (e) extras[k] = e }
  const p = obj(o.previoCliente)
  const pr = obj(p?.riesgo)
  const trabajos: TrabajoCompania[] = []
  for (const x of Array.isArray(o.trabajos) ? o.trabajos : []) {
    const r = obj(x)
    const t = leerTrabajoBot(r)
    if (!r || !t || typeof r.id !== 'string' || typeof r.compania !== 'string') continue
    trabajos.push({ ...t, id: r.id, compania: r.compania, ramo: typeof r.ramo === 'string' ? r.ramo : o.ramo })
  }
  return {
    ramo: o.ramo,
    guardado: gf ? {
      formulario: gf, extras,
      companias: Array.isArray(g?.companias) ? (g!.companias as unknown[]).filter((c): c is string => typeof c === 'string') : [],
      actualizadoEn: typeof g?.actualizadoEn === 'string' ? g.actualizadoEn : null,
    } : null,
    previo: pr ? { riesgo: pr, creadoEn: typeof p?.creadoEn === 'string' ? p.creadoEn : null } : null,
    trabajos,
  }
}

/** El trabajo MÁS RECIENTE de cada compañía (los anteriores quedan en «Ver anteriores»). */
export function ultimoPorCompania(trabajos: readonly TrabajoCompania[]): { ultimos: TrabajoCompania[]; anteriores: TrabajoCompania[] } {
  const vistos = new Set<string>()
  const ultimos: TrabajoCompania[] = []
  const anteriores: TrabajoCompania[] = []
  const orden = [...trabajos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  for (const t of orden) {
    if (vistos.has(t.compania)) anteriores.push(t)
    else { vistos.add(t.compania); ultimos.push(t) }
  }
  return { ultimos, anteriores }
}

export type ResultadoPedido = { compania: string; ok: boolean; texto: string }

/** Respuesta del POST → un texto por compañía (o un error general). */
export function mensajePedido(status: number, json: unknown, nombres: Record<string, string>): { ok: true; resultados: ResultadoPedido[] } | { ok: false; mensaje: string } {
  const j = obj(json) ?? {}
  const nombre = (c: string) => nombres[c] ?? c
  if (status === 202 && Array.isArray(j.resultados)) {
    const resultados: ResultadoPedido[] = []
    for (const x of j.resultados) {
      const r = obj(x)
      if (!r || typeof r.compania !== 'string') continue
      resultados.push(r.estado === 'encolado'
        ? { compania: r.compania, ok: true, texto: `${nombre(r.compania)}: pedido al bot` }
        : { compania: r.compania, ok: false, texto: `${nombre(r.compania)}: no se ha pedido${r.status === 409 ? ' (la compañía no está autorizada para el bot)' : ''}${typeof r.motivo === 'string' ? ` · ${r.motivo}` : ''}` })
    }
    return { ok: true, resultados }
  }
  if (status === 503 && j.estado === 'apagado') return { ok: false, mensaje: 'El bot está apagado (TARIFICADOR_RPA_ACTIVO)' }
  if (status === 503 && j.estado === 'sin_configurar') return { ok: false, mensaje: 'Falta ASEGURA_OPERADOR_SECRET en plataforma' }
  if (status === 400 && Array.isArray(j.errores) && j.errores.length) return { ok: false, mensaje: `Datos no válidos: ${j.errores.filter((x) => typeof x === 'string').join('; ')}` }
  if (status === 401) return { ok: false, mensaje: 'asegura rechazó el secreto de operador' }
  if (status === 404) return { ok: false, mensaje: 'La oportunidad no existe o no es de la correduría' }
  if (status === 502) return { ok: false, mensaje: 'asegura no ha respondido: vuelve a intentarlo' }
  return { ok: false, mensaje: `asegura respondió ${status}${typeof j.mensaje === 'string' ? `: ${j.mensaje}` : ''}` }
}

/** Respuesta de «crear oportunidad» desde la ficha → id a abrir (también si ya había una abierta: 409 + id). */
export function idOportunidadCreada(status: number, json: unknown): string | null {
  const j = obj(json)
  if (!j || typeof j.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(j.id)) return null
  if ((status >= 200 && status < 300 && j.estado === 'ok') || (status === 409 && j.estado === 'duplicada')) return j.id
  return null
}
