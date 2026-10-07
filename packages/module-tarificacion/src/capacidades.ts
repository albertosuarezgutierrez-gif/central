// Registro de CAPACIDADES de cotización (07/10/2026). PURO: ni BD, ni red, ni Playwright.
//
// Decisión de Alberto: la cotización por bots se pide desde la OPORTUNIDAD con UN formulario de riesgo
// común a todas las compañías. Cada bot (compañía × ramo) declara aquí:
//   · qué ramo cotiza,
//   · los campos EXTRA que solo pide su portal (p. ej. las etiquetas de los desplegables de ePAC),
//   · su validación propia y el MAPEO canónico + extras → riesgo con la forma que entiende su adaptador.
// Añadir un bot = registrar su capacidad. El formulario común no cambia.
//
// 🚨 TARIFICAR ≠ EMITIR. 🚨 `null` = «no se sabe», nunca 0 ni false.

import type { DireccionRiesgo, RamoRpa, RiesgoComunidad } from './tipos.ts'
import { validarRiesgoComunidad } from './riesgo.ts'
import { claveCompania } from './registro.ts'

// ─── Formulario canónico de COMUNIDADES (independiente de compañía) ────────

/** Lo que se pregunta UNA vez y vale para todas las compañías. */
export type FormularioComunidad = {
  ramo: 'comunidades'
  direccion: DireccionRiesgo
  referenciaCatastral: string | null
  polizaAReemplazar: string | null
  documentoIdentidad: string | null
  fechaEfecto: string
  fechaTermino: string
  m2Construidos: number
  anioConstruccion: number
  anioRehabilitacion: number | null
  plantas: number
  plantasBajoRasante: number | null
  sotanos: number | null
  numEdificios: number
  numViviendasYLocales: number
  numViviendas: number | null
  numLocales: number | null
  numGarajes: number | null
  ascensor: boolean | null
  piscina: boolean | null
  zonasAjardinadas: boolean | null
  instalacionesAnexas: boolean | null
  calidadConstruccion: 'normal' | 'alta' | 'lujo' | null
  capitalContinente: number
  capitalContenido: number | null
  siniestrosUltimos3Anios: number | null
  companiaActual: string | null
}

/**
 * Claves de `RiesgoComunidad` que son de UN portal (etiquetas de desplegable, comisión, forma de pago…).
 * No entran en el formulario común aunque vengan: las aporta el adaptador como extras.
 */
export const CLAVES_SOLO_DE_COMPANIA = [
  'tipoVivienda', 'uso', 'listaPropietarios', 'contiguos', 'modalidad', 'opciones', 'comision',
  'formaPagoPrimerRecibo', 'formaPagoSucesivos', 'tipoDocumento', 'asistenciaPlagas', 'asesoramientoJuridico',
  'impagoCuotas', 'ite',
] as const

export type ValidacionFormulario = { ok: true; formulario: FormularioComunidad } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/**
 * Valida el formulario común. Reutiliza `validarRiesgoComunidad` (una sola fuente de reglas: CP, fechas,
 * enteros, importes, obligatorios) sin exigir los desplegables del portal, y se queda SOLO con las claves
 * comunes (lo que sea de una compañía, aunque venga, se descarta).
 */
export function validarFormularioComunidad(entrada: unknown, hoy: Date = new Date()): ValidacionFormulario {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el formulario tiene que ser un objeto'] }
  const limpio: Record<string, unknown> = { ...e }
  for (const k of CLAVES_SOLO_DE_COMPANIA) delete limpio[k]
  const v = validarRiesgoComunidad(limpio, hoy, { exigirSelectsPortal: false })
  if (!v.ok) return v
  const r = v.riesgo
  // Los obligatorios ya los ha exigido el validador: aquí no pueden ser null.
  return {
    ok: true,
    formulario: {
      ramo: 'comunidades',
      direccion: r.direccion,
      referenciaCatastral: r.referenciaCatastral ?? null,
      polizaAReemplazar: r.polizaAReemplazar ?? null,
      documentoIdentidad: r.documentoIdentidad ?? null,
      fechaEfecto: r.fechaEfecto as string,
      fechaTermino: r.fechaTermino as string,
      m2Construidos: r.m2Construidos as number,
      anioConstruccion: r.anioConstruccion as number,
      anioRehabilitacion: r.anioRehabilitacion ?? null,
      plantas: r.plantas as number,
      plantasBajoRasante: r.plantasBajoRasante ?? null,
      sotanos: r.sotanos ?? null,
      numEdificios: r.numEdificios as number,
      numViviendasYLocales: r.numViviendasYLocales as number,
      numViviendas: r.numViviendas ?? null,
      numLocales: r.numLocales ?? null,
      numGarajes: r.numGarajes ?? null,
      ascensor: r.ascensor ?? null,
      piscina: r.piscina ?? null,
      zonasAjardinadas: r.zonasAjardinadas ?? null,
      instalacionesAnexas: r.instalacionesAnexas ?? null,
      calidadConstruccion: r.calidadConstruccion ?? null,
      capitalContinente: r.capitalContinente as number,
      capitalContenido: r.capitalContenido ?? null,
      siniestrosUltimos3Anios: r.siniestrosUltimos3Anios ?? null,
      companiaActual: r.companiaActual ?? null,
    },
  }
}

// ─── Extras por compañía ────────────────────────────────────────────────────

export type CampoExtra = {
  clave: string
  etiqueta: string
  /** `texto`: libre (con `sugerencias` opcionales) · `opcion`: lista CERRADA (`opciones`) · `entero` · `booleano`. */
  tipo: 'texto' | 'opcion' | 'entero' | 'booleano'
  obligatorio: boolean
  sugerencias?: readonly string[]
  opciones?: readonly { valor: string; etiqueta: string }[]
  /** Valor con el que nace el campo en el formulario (texto). `undefined` = vacío. */
  porDefecto?: string
  ayuda?: string
}

export type ValorExtra = string | number | boolean | null
export type ExtrasValidos = Record<string, ValorExtra>

/** Lo que un bot (compañía × ramo) sabe hacer. */
export type CapacidadCotizacion = {
  /** Clave canónica (`claveCompania`): «allianz». */
  compania: string
  /** Nombre para pantalla: «Allianz». */
  nombre: string
  ramo: RamoRpa
  /** Descripción corta para el selector («Allianz ePAC · Comunidades 2020»). */
  producto: string
  extras: readonly CampoExtra[]
  /** Reglas propias más allá de tipo/obligatorio. Devuelve errores legibles (vacío = bien). */
  validar?: (formulario: FormularioComunidad, extras: ExtrasValidos) => string[]
  /** Canónico + extras → riesgo con la forma del adaptador (se valida después con `validarRiesgoComunidad`). */
  mapear: (formulario: FormularioComunidad, extras: ExtrasValidos) => Record<string, unknown>
}

/** Extras tecleados (texto/número/booleano) → valores tipados según lo que declara la capacidad. */
export function validarExtras(
  cap: Pick<CapacidadCotizacion, 'extras' | 'nombre'>,
  entrada: unknown,
): { ok: true; extras: ExtrasValidos } | { ok: false; errores: string[] } {
  const e = obj(entrada) ?? {}
  const errores: string[] = []
  const extras: ExtrasValidos = {}
  for (const c of cap.extras) {
    const crudo = e[c.clave]
    const vacio = crudo === undefined || crudo === null || (typeof crudo === 'string' && crudo.trim() === '')
    if (vacio) {
      if (c.obligatorio) errores.push(`${cap.nombre} · ${c.etiqueta}: obligatorio`)
      extras[c.clave] = null
      continue
    }
    if (c.tipo === 'texto') {
      if (typeof crudo !== 'string') { errores.push(`${cap.nombre} · ${c.etiqueta}: tiene que ser texto`); extras[c.clave] = null; continue }
      extras[c.clave] = crudo.trim().slice(0, 200)
    } else if (c.tipo === 'opcion') {
      const ok = typeof crudo === 'string' && (c.opciones ?? []).some((o) => o.valor === crudo)
      if (!ok) { errores.push(`${cap.nombre} · ${c.etiqueta}: elige una opción de la lista`); extras[c.clave] = null; continue }
      extras[c.clave] = crudo as string
    } else if (c.tipo === 'entero') {
      const n = typeof crudo === 'number' ? crudo : typeof crudo === 'string' && /^\d{1,9}$/.test(crudo.trim()) ? Number(crudo.trim()) : NaN
      if (!Number.isInteger(n) || n < 0) { errores.push(`${cap.nombre} · ${c.etiqueta}: pon un número entero`); extras[c.clave] = null; continue }
      extras[c.clave] = n
    } else {
      const b = crudo === true || crudo === 'si' ? true : crudo === false || crudo === 'no' ? false : null
      if (b === null) { errores.push(`${cap.nombre} · ${c.etiqueta}: sí o no`); extras[c.clave] = null; continue }
      extras[c.clave] = b
    }
  }
  return errores.length ? { ok: false, errores } : { ok: true, extras }
}

// ─── Catálogo (registro de capacidades) ─────────────────────────────────────

export type CatalogoCotizacion = {
  registrar(c: CapacidadCotizacion): void
  /** `null` = esa compañía no cotiza ese ramo por bot (nunca se cae a otra). */
  obtener(compania: string, ramo: string): CapacidadCotizacion | null
  /** Bots disponibles para un ramo, por nombre. */
  deRamo(ramo: string): CapacidadCotizacion[]
  /** Ramos con al menos un bot. */
  ramos(): RamoRpa[]
}

export function crearCatalogo(iniciales: readonly CapacidadCotizacion[] = []): CatalogoCotizacion {
  const mapa = new Map<string, CapacidadCotizacion>()
  const k = (compania: string, ramo: string) => `${claveCompania(compania)}::${String(ramo).trim().toLowerCase()}`
  const cat: CatalogoCotizacion = {
    registrar(c) {
      if (claveCompania(c.compania) !== c.compania) throw new Error(`catálogo: la compañía «${c.compania}» no está en forma canónica`)
      const claves = new Set<string>()
      for (const x of c.extras) {
        if (claves.has(x.clave)) throw new Error(`catálogo: extra repetido «${x.clave}» en ${c.compania}`)
        if (x.tipo === 'opcion' && !(x.opciones && x.opciones.length)) throw new Error(`catálogo: «${x.clave}» es de opción y no trae opciones`)
        claves.add(x.clave)
      }
      const clave = k(c.compania, c.ramo)
      if (mapa.has(clave)) throw new Error(`catálogo: ya hay una capacidad para ${clave}`)
      mapa.set(clave, c)
    },
    obtener(compania, ramo) {
      return mapa.get(k(compania, ramo)) ?? null
    },
    deRamo(ramo) {
      const r = String(ramo).trim().toLowerCase()
      return [...mapa.values()].filter((c) => c.ramo === r).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },
    ramos() {
      return [...new Set([...mapa.values()].map((c) => c.ramo))].sort()
    },
  }
  for (const c of iniciales) cat.registrar(c)
  return cat
}

// ─── Allianz · Comunidades (ePAC «Comunidades 2020») ────────────────────────

/** Etiquetas ya vistas en los desplegables de ePAC (texto libre: TODO(valores admitidos), no hay catálogo cerrado). */
export const ALLIANZ_TIPO_VIVIENDA = ['Viviendas Pisos en Alto'] as const
export const ALLIANZ_USO = ['Habitual'] as const
export const ALLIANZ_LISTA_PROPIETARIOS = ['> 50%'] as const

export const CAPACIDAD_ALLIANZ_COMUNIDADES: CapacidadCotizacion = {
  compania: 'allianz',
  nombre: 'Allianz',
  ramo: 'comunidades',
  producto: 'Allianz ePAC · Comunidades 2020',
  extras: [
    { clave: 'tipoVivienda', etiqueta: 'Tipo de vivienda', tipo: 'texto', obligatorio: true, sugerencias: ALLIANZ_TIPO_VIVIENDA, porDefecto: ALLIANZ_TIPO_VIVIENDA[0], ayuda: 'Etiqueta exacta del desplegable de Allianz.' },
    { clave: 'uso', etiqueta: 'Uso', tipo: 'texto', obligatorio: true, sugerencias: ALLIANZ_USO, porDefecto: ALLIANZ_USO[0], ayuda: 'Etiqueta exacta del desplegable de Allianz.' },
    { clave: 'listaPropietarios', etiqueta: 'Lista de propietarios / arrendatarios', tipo: 'texto', obligatorio: true, sugerencias: ALLIANZ_LISTA_PROPIETARIOS, porDefecto: ALLIANZ_LISTA_PROPIETARIOS[0], ayuda: 'Etiqueta exacta del desplegable de Allianz.' },
    { clave: 'modalidad', etiqueta: 'Modalidad', tipo: 'opcion', obligatorio: false, opciones: [{ valor: 'estandar', etiqueta: 'Estándar' }, { valor: 'personalizado', etiqueta: 'Personalizado' }] },
  ],
  mapear(f, x) {
    return {
      ...f,
      ramo: 'comunidades',
      tipoVivienda: x.tipoVivienda ?? null,
      uso: x.uso ?? null,
      listaPropietarios: x.listaPropietarios ?? null,
      modalidad: x.modalidad ?? null,
    }
  },
}

/** Catálogo con los bots que existen hoy. Cada consumidor crea el suyo (sin estado global). */
export function catalogoCotizacion(): CatalogoCotizacion {
  return crearCatalogo([CAPACIDAD_ALLIANZ_COMUNIDADES])
}

// ─── Preparar la solicitud de UNA compañía ──────────────────────────────────

export type SolicitudPreparada =
  | { ok: true; compania: string; ramo: RamoRpa; riesgo: RiesgoComunidad }
  | { ok: false; compania: string; errores: string[] }

/**
 * Formulario común + extras de esa compañía → riesgo listo para encolar. Todo o nada: con cualquier
 * error no hay riesgo. El riesgo final pasa SIEMPRE por `validarRiesgoComunidad` (la misma puerta que
 * el encolado directo), así que un mapeo mal hecho no llega al worker.
 */
export function prepararSolicitud(
  cat: CatalogoCotizacion,
  compania: string,
  ramo: string,
  formulario: unknown,
  extras: unknown,
  hoy: Date = new Date(),
): SolicitudPreparada {
  const clave = claveCompania(compania)
  const cap = cat.obtener(clave, ramo)
  if (!cap) return { ok: false, compania: clave, errores: [`${compania}: no hay bot para el ramo «${ramo}»`] }
  const f = validarFormularioComunidad(formulario, hoy)
  const x = validarExtras(cap, extras)
  const errores = [...(f.ok ? [] : f.errores), ...(x.ok ? [] : x.errores)]
  if (!f.ok || !x.ok) return { ok: false, compania: clave, errores }
  const propios = cap.validar ? cap.validar(f.formulario, x.extras) : []
  if (propios.length) return { ok: false, compania: clave, errores: propios.map((m) => `${cap.nombre} · ${m}`) }
  const v = validarRiesgoComunidad(cap.mapear(f.formulario, x.extras), hoy)
  if (!v.ok) return { ok: false, compania: clave, errores: v.errores.map((m) => `${cap.nombre} · ${m}`) }
  return { ok: true, compania: clave, ramo: cap.ramo, riesgo: v.riesgo }
}
