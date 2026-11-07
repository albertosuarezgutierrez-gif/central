// Almacén de precios observados (`seguros.observaciones_precio`, fase 0, 07/11/2026). PURO: sin BD ni red. Test: `observacion-precio.test.ts`.
// Diseño: docs/superpowers/specs/2026-11-07-almacen-precios.md. La BD vive en `observaciones-precio.ts`.
//
// UNA función (`observacionesDeTarificacion`) para el enganche en caliente (Avant2 y bots) y para el barrido nocturno: lo que
// escribe uno lo escribe el otro, byte a byte (misma `clave_origen` + misma `huella_valores`), y el UNIQUE hace el resto.
//
// 🚨 SIN DATOS PERSONALES en la salida: ni cliente/póliza/oportunidad, NIF, nombre, matrícula, dirección, fecha de nacimiento
//    ni texto libre. La petición de Avant2 SÍ trae datos personales (holder, conductor, matrícula): de ella solo salen TRAMOS.
//    El vínculo con la persona son tres HMAC opacos (secreto del servidor) y el id de la fila origen (otra tabla).
// 🚨 El motivo de un rechazo sale como CÓDIGO (`motivoDeFallo`), nunca el texto del vendor.
// 🚨 Nunca se inventa: prima no anual sin verificar → no es un `precio`; nivel sin datos → `sin clasificar`; clave de perfil
//    sin dato → AUSENTE (no `'otro'`); `fallos` NULL (anterior al 29/09) → NINGÚN rechazo (no se sabe, ≠ «nadie rechazó»).
// 🚨 Copias: `oportunidad_oferta` y `presupuesto_opcion` NO se leen nunca (son copias de `tarificacion_precios`).

import { createHash, createHmac } from 'node:crypto'
import {
  clasificarCoberturas,
  normalizarCompania,
  resolverCompania,
  revisarCoherenciaCotizacion,
  type CoberturaParaClasificar,
  type CompaniaCatalogo,
  type EstadoGarantia,
} from '@central/module-seguros'
import { nivelDeOferta } from './tarificacion-niveles.ts'

/** Versión del clasificador de nivel (`nivelDeOferta`). Súbela si cambia la regla: el barrido escribe versión nueva. */
export const NIVEL_VERSION = 1
/** Versión de la normalización (prima anual, motivos, perfil). Entra en la huella: subirla re-proyecta. */
export const NORMALIZACION_VERSION = 1

/** Lista blanca CERRADA del perfil. Espejo EXACTO del CHECK de `2026-11-07b_observaciones_precio.sql` (lo vigila un test). */
export const CLAVES_PERFIL = [
  'conductor_edad_tramo', 'carne_antiguedad_tramo', 'vehiculo_antiguedad_tramo', 'vehiculo_marca',
  'vehiculo_segmento', 'combustible', 'uso', 'garaje', 'anios_sin_siniestros_tramo',
  'vivienda_tipo', 'vivienda_uso', 'regimen', 'm2_tramo', 'anio_construccion_tramo',
  'capital_continente_tramo', 'capital_contenido_tramo',
  'edad_tramo', 'asegurados_n', 'capital_tramo', 'fumador',
] as const
export type ClavePerfil = (typeof CLAVES_PERFIL)[number]
export type Perfil = Partial<Record<ClavePerfil, string | number | boolean>>

const RAMOS = ['auto', 'moto', 'patinete', 'hogar', 'comunidades', 'comercio', 'rc', 'vida', 'salud', 'decesos', 'otro'] as const
const FIRMEZAS = ['firme', 'estimado', 'condicionado'] as const
type Ramo = (typeof RAMOS)[number]

export type Fuente = 'avant2' | 'rpa'
export type Resultado = 'precio' | 'rechazo_compania' | 'sin_precio_no_concluyente'
export type FormaPago = 'anual' | 'semestral' | 'trimestral' | 'mensual'

// ─── Entrada (lo que se lee de la BD; puede traer datos personales: NUNCA salen) ───────────────────────────────────

export type TarificacionParaObservar = {
  id: string
  canal: string | null
  simulado: boolean
  ramo: string | null
  creadoAt: Date | string
  fechaEfecto: Date | string | null
  codigoPostal: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | string | null
  capitalContenido: number | string | null
  /** Anclas del grupo de comparación: SOLO entran en un HMAC, nunca se guardan. */
  oportunidadId: string | null
  polizaId: string | null
  clienteId: string | null
  /** Petición guardada (Avant2: forma `risk.*`, con datos personales; RPA: lista blanca). Solo se sacan tramos. */
  peticion: unknown
  /** RPA: `respuesta.ofertas[]` (para el fraccionamiento de cada oferta). Avant2: no se usa. */
  ofertasRpa?: unknown
  /** `tarificaciones.fallos` tal cual (NULL = anterior al 29/09: no se sabe). */
  fallos: unknown
}

export type PrecioParaObservar = {
  id: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | string | null
  franquiciaEur: number | string | null
  firmeza: string | null
  /** Sobre `{estado, lista:[{nombre, incluida, texto}]}` (Avant2 y RPA). */
  coberturas: unknown
  /** Avant2: `{version, porClave}`. */
  garantias: unknown
  formaPago: string | null
  frecuenciaPago: string | null
  meses: number | null
  /** Solo para casar el precio RPA con su oferta en `respuesta.ofertas[]`; no se guarda. */
  referenciaVendor: string | null
}

export type ContextoObservacion = {
  catalogo: readonly CompaniaCatalogo[]
  /** Secreto de los HMAC. `null` = sin grupo/ancla/huella (las tres columnas a NULL). */
  secreto: string | null
  /** RPA en caliente: el riesgo del trabajo EN MEMORIA (antes de la purga). Solo se sacan tramos. */
  riesgoRpa?: unknown
  creadoPor: string
}

// ─── Salida (una fila de `observaciones_precio`, sin PII) ───────────────────────────────────────────────────────────

export type ObservacionNueva = {
  fuente: Fuente
  origenTabla: 'tarificacion_precios' | 'tarificaciones'
  origenId: string
  origenSubclave: string
  claveOrigen: string
  huellaValores: string
  resultado: Resultado
  motivoCodigo: string | null
  companiaDgs: string | null
  companiaTexto: string
  companiaResolucion: 'resuelta' | 'ambigua' | 'sin_resolver'
  ramo: Ramo
  producto: string | null
  modalidad: string | null
  categoria: string | null
  nivel: string
  nivelFuente: 'categoria' | 'modalidad' | 'producto' | 'coberturas' | null
  nivelVersion: number
  primaAnualCents: number | null
  primaTipo: 'total'
  formaPago: FormaPago | null
  franquiciaCents: number | null
  coberturas: Record<string, EstadoGarantia> | null
  firmeza: 'firme' | 'estimado' | 'condicionado'
  coherencia: 'ok' | 'incoherente' | 'no_revisada'
  observadaAt: string
  fechaTipo: 'cotizada'
  fechaEfecto: string | null
  grupoComparacion: string | null
  anclaRiesgo: string | null
  riesgoHuella: string | null
  provincia: string | null
  perfil: Perfil
  creadoPor: string
}

/** Columnas permitidas en una fila (cepo «sin PII»: cualquier otra clave es un fallo del test). */
export const COLUMNAS_OBSERVACION = [
  'fuente', 'origenTabla', 'origenId', 'origenSubclave', 'claveOrigen', 'huellaValores', 'resultado', 'motivoCodigo',
  'companiaDgs', 'companiaTexto', 'companiaResolucion', 'ramo', 'producto', 'modalidad', 'categoria', 'nivel', 'nivelFuente',
  'nivelVersion', 'primaAnualCents', 'primaTipo', 'formaPago', 'franquiciaCents', 'coberturas', 'firmeza', 'coherencia',
  'observadaAt', 'fechaTipo', 'fechaEfecto', 'grupoComparacion', 'anclaRiesgo', 'riesgoHuella', 'provincia', 'perfil', 'creadoPor',
] as const satisfies readonly (keyof ObservacionNueva)[]

// ─── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const txt = (v: unknown, max = 120): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s === '' ? null : s.slice(0, max)
}
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null }
  return null
}
const isoFecha = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}
const isoMomento = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString()

/** Años cumplidos entre dos fechas ISO (AAAA-MM-DD). `null` si alguna no es válida o sale negativo. PURO. */
export function aniosEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null
  const [a1, m1, d1] = desde.split('-').map(Number) as [number, number, number]
  const [a2, m2, d2] = hasta.split('-').map(Number) as [number, number, number]
  let n = a2 - a1
  if (m2 < m1 || (m2 === m1 && d2 < d1)) n--
  return n >= 0 && n < 130 ? n : null
}

// ─── Tramos (decisión de Alberto 07/11/2026: los del diseño §1.2) ──────────────────────────────────────────────────

export function tramoEdadConductor(anios: number | null): string | null {
  if (anios === null || anios < 18) return null
  if (anios <= 24) return '18-24'
  if (anios <= 29) return '25-29'
  if (anios <= 39) return '30-39'
  if (anios <= 49) return '40-49'
  if (anios <= 59) return '50-59'
  if (anios <= 69) return '60-69'
  return '70+'
}
export function tramoCarne(anios: number | null): string | null {
  if (anios === null) return null
  if (anios <= 1) return '0-1'
  if (anios <= 4) return '2-4'
  if (anios <= 9) return '5-9'
  return '10+'
}
export function tramoAntiguedadVehiculo(anios: number | null): string | null {
  if (anios === null) return null
  if (anios <= 2) return '0-2'
  if (anios <= 5) return '3-5'
  if (anios <= 10) return '6-10'
  if (anios <= 15) return '11-15'
  return '16+'
}
export function tramoM2(m2: number | null): string | null {
  if (m2 === null || m2 <= 0) return null
  if (m2 < 60) return '<60'
  if (m2 < 90) return '60-89'
  if (m2 < 120) return '90-119'
  if (m2 < 180) return '120-179'
  return '180+'
}
export function tramoAnioConstruccion(anio: number | null): string | null {
  if (anio === null || !Number.isInteger(anio) || anio < 1800 || anio > 2100) return null
  const d = Math.floor(anio / 10) * 10
  return `${d}-${d + 9}`
}
/** Tramos de `paso` € (25.000 continente, 10.000 contenido). `null`/≤0 = no consta. */
export function tramoCapital(eur: number | null, paso: number): string | null {
  if (eur === null || !(eur > 0)) return null
  const a = Math.floor(eur / paso) * paso
  return `${a}-${a + paso - 1}`
}

/** Deja solo claves de la lista blanca con valores escalares cortos. PURO. */
export function perfilLimpio(p: Record<string, unknown>): Perfil {
  const out: Perfil = {}
  for (const k of CLAVES_PERFIL) {
    const v = p[k]
    if (typeof v === 'string' && v.trim() !== '' && v.length <= 40) out[k] = v.trim()
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
  }
  return out
}

/** Perfil de lo que la tarificación GUARDADA permite saber (columnas + petición). Lo mismo en caliente y en el barrido. PURO. */
export function perfilDeTarificacion(t: TarificacionParaObservar, ramo: Ramo, observadaDia: string): Perfil {
  const p: Record<string, unknown> = {}
  if (ramo === 'hogar' || ramo === 'comunidades' || ramo === 'comercio') {
    p.m2_tramo = tramoM2(num(t.metrosCuadrados))
    p.anio_construccion_tramo = tramoAnioConstruccion(num(t.anioConstruccion))
    p.capital_continente_tramo = tramoCapital(num(t.capitalContinente), 25_000)
    p.capital_contenido_tramo = tramoCapital(num(t.capitalContenido), 10_000)
  }
  const vehiculo = ramo === 'auto' || ramo === 'moto' || ramo === 'patinete'
  const pet = obj(t.peticion)
  if (vehiculo && pet && t.canal === 'codeoscopic') {
    const risk = obj(pet.risk)
    const conductor = obj(risk?.primaryDriver)
    p.conductor_edad_tramo = tramoEdadConductor(aniosEntre(isoFecha(conductor?.birthDate), observadaDia))
    const permisos = Array.isArray(conductor?.drivingLicenses) ? conductor.drivingLicenses : []
    const fechas = permisos.map((l) => isoFecha(obj(l)?.date)).filter((f): f is string => f !== null).sort()
    p.carne_antiguedad_tramo = tramoCarne(aniosEntre(fechas[0] ?? null, observadaDia))
    p.vehiculo_antiguedad_tramo = tramoAntiguedadVehiculo(aniosEntre(isoFecha(risk?.registrationDate), observadaDia))
    const garaje = txt(obj(risk?.garageType)?.id)
    if (garaje === 'PrivateGarage' || garaje === 'CommunalParking') p.garaje = 'si'
    else if (garaje === 'NoGarage') p.garaje = 'no'
  }
  if (vehiculo && pet && t.canal === 'rpa') {
    const marca = txt(obj(pet.seleccionVehiculo)?.marca, 40)
    if (marca) p.vehiculo_marca = normalizarCompania(marca) || null
  }
  return perfilLimpio(p)
}

/** Perfil del riesgo del bot EN MEMORIA (antes de la purga): la única ocasión de la edad del conductor. Solo tramos. PURO. */
export function perfilDeRiesgoRpa(ramo: Ramo, riesgo: unknown, observadaDia: string): Perfil {
  const r = obj(riesgo)
  if (!r) return {}
  const p: Record<string, unknown> = {}
  if (ramo === 'auto' || ramo === 'moto') {
    const c = obj(r.conductor)
    p.conductor_edad_tramo = tramoEdadConductor(aniosEntre(isoFecha(c?.fechaNacimiento), observadaDia))
    p.carne_antiguedad_tramo = tramoCarne(aniosEntre(isoFecha(c?.fechaCarne), observadaDia))
    if (typeof r.garajeNoche === 'boolean') p.garaje = r.garajeNoche ? 'si' : 'no'
    const uso = txt(r.usoVehiculo, 20)
    if (uso && /^[a-z_]+$/.test(uso)) p.uso = uso
  }
  if (ramo === 'hogar') {
    const h = obj(r.hogar)
    for (const [k, v] of [['vivienda_uso', h?.uso], ['regimen', h?.regimen], ['vivienda_tipo', h?.tipoVivienda]] as const) {
      const s = txt(v, 20)
      if (s && /^[a-z_]+$/.test(s)) p[k] = s
    }
  }
  return perfilLimpio(p)
}

// ─── Prima anual ────────────────────────────────────────────────────────────────────────────────────────────────

function formaPagoDe(v: string | null): FormaPago | null | 'desconocida' {
  const s = (v ?? '').trim().toLowerCase()
  if (s === '') return null
  if (s === 'anual' || s === 'annual') return 'anual'
  if (s === 'semestral' || s === 'semiannual' || s === 'semi-annual') return 'semestral'
  if (s === 'trimestral' || s === 'quarterly') return 'trimestral'
  if (s === 'mensual' || s === 'monthly') return 'mensual'
  return 'desconocida'
}

export type PrimaAnual =
  | { ok: true; cents: number; formaPago: FormaPago | null }
  | { ok: false; motivo: 'prima_invalida' | 'prima_no_anual_sin_verificar'; formaPago: FormaPago | null }

/**
 * Prima ANUAL TOTAL en céntimos. PURO.
 *
 * Verificado el 07/11/2026 contra lo guardado: Avant2 — las 132 cotizaciones con respuesta cruda son `paymentFrequency`
 * Anual (installments 1), `termMonths` 12 y `premium` = `downPayment` → `premium` es la prima anual total. Las 396 anteriores
 * (sin `meses` ni frecuencia guardados) salieron con la misma petición → se toman como anuales. Bots — `primaAnualEur` del
 * portal (el recibo `importeReciboEur` va 0-8 % por debajo: es el primer recibo prorrateado, no una fracción).
 * NO hay ningún caso fraccionado guardado: si Avant2 devuelve plazo ≠ 12 meses o frecuencia no anual, NO se supone si
 * `premium` es el total o la fracción → no es un `precio` (queda `sin_precio_no_concluyente` · `prima_no_anual_sin_verificar`,
 * el precio sigue en `tarificacion_precios` y se re-proyecta al verificarlo subiendo `NORMALIZACION_VERSION`).
 */
export function primaAnual(fuente: Fuente, p: Pick<PrecioParaObservar, 'primaEur' | 'meses' | 'frecuenciaPago'>, formaPagoRpa: FormaPago | null = null): PrimaAnual {
  const prima = num(p.primaEur)
  if (fuente === 'rpa') {
    if (prima === null || !(prima > 0)) return { ok: false, motivo: 'prima_invalida', formaPago: formaPagoRpa }
    return { ok: true, cents: Math.round(prima * 100), formaPago: formaPagoRpa }
  }
  const fp = formaPagoDe(p.frecuenciaPago)
  const formaPago = fp === 'desconocida' ? null : fp
  if (prima === null || !(prima > 0)) return { ok: false, motivo: 'prima_invalida', formaPago }
  const meses = num(p.meses)
  const anual = (fp === null || fp === 'anual') && (meses === null || meses === 12)
  if (!anual) return { ok: false, motivo: 'prima_no_anual_sin_verificar', formaPago }
  return { ok: true, cents: Math.round(prima * 100), formaPago }
}

// ─── Rechazos de Avant2 (`fallos`) ───────────────────────────────────────────────────────────────────────────────

/**
 * Texto del vendor → CÓDIGO (el texto no se guarda: puede traer datos). PURO.
 * Solo es `rechazo_compania` cuando la compañía AFIRMA que no acepta el riesgo. Un error técnico o de datos («error en el
 * envío», «el nº de póliza debe tener N caracteres») NO es un rechazo: `sin_precio_no_concluyente`. Lo no reconocido,
 * también no concluyente (`no_clasificado`): ante la duda, el estado conservador.
 */
export function motivoDeFallo(motivo: string | null): { resultado: 'rechazo_compania' | 'sin_precio_no_concluyente'; codigo: string } {
  const m = (motivo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/malus/.test(m)) return { resultado: 'rechazo_compania', codigo: 'malus' }
  if (/vehiculo no (permitido|asegurable|aceptado)/.test(m)) return { resultado: 'rechazo_compania', codigo: 'vehiculo_no_aceptado' }
  // «Vehículo no disponible» puede ser «no está en su catálogo», no «no lo aseguro»: no concluyente.
  if (/vehiculo no disponible/.test(m)) return { resultado: 'sin_precio_no_concluyente', codigo: 'vehiculo_no_disponible' }
  if (/(no contratable|no asegurable|no se puede contratar|normas de suscripcion|riesgo no aceptad|no se acepta el riesgo)/.test(m)) {
    return { resultado: 'rechazo_compania', codigo: 'riesgo_no_aceptado' }
  }
  if (/(error en el envio|contacte con el departamento|equivalencia|timeout|no disponible temporalmente|servicio)/.test(m)) {
    return { resultado: 'sin_precio_no_concluyente', codigo: 'error_tecnico' }
  }
  if (/(debe tener|incorrect|valor informado|obligatori|formato|invalid)/.test(m)) return { resultado: 'sin_precio_no_concluyente', codigo: 'datos_invalidos' }
  return { resultado: 'sin_precio_no_concluyente', codigo: 'no_clasificado' }
}

// ─── Identidad e idempotencia ───────────────────────────────────────────────────────────────────────────────────

export function claveOrigen(fuente: Fuente, origenTabla: string, origenId: string, subclave: string): string {
  return `${fuente}|${origenTabla}|${origenId}|${subclave}`
}

function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
}

/** Campos de VALOR que entran en la huella. Fuera: perfil, HMAC y `creadoPor` (el caliente y el barrido difieren en ellos). */
export const CAMPOS_HUELLA = [
  'resultado', 'motivoCodigo', 'companiaTexto', 'companiaDgs', 'companiaResolucion', 'ramo', 'producto', 'modalidad', 'categoria',
  'nivel', 'nivelFuente', 'nivelVersion', 'primaAnualCents', 'primaTipo', 'formaPago', 'franquiciaCents', 'coberturas', 'firmeza',
  'coherencia', 'observadaAt', 'fechaTipo', 'fechaEfecto', 'provincia',
] as const satisfies readonly (keyof ObservacionNueva)[]

export function huellaValores(o: Omit<ObservacionNueva, 'huellaValores'>): string {
  const v: Record<string, unknown> = { normalizacion: NORMALIZACION_VERSION }
  for (const k of CAMPOS_HUELLA) v[k] = o[k]
  return createHash('md5').update(canonico(v)).digest('hex')
}

const hmac = (secreto: string, ...partes: (string | number | null)[]): string =>
  createHmac('sha256', secreto).update(partes.map((p) => (p === null ? '' : String(p))).join('\u001f')).digest('hex')

/** Provincia (2 cifras) de un CP español válido. PURO. */
export function provinciaDeCp(cp: string | null): string | null {
  const s = (cp ?? '').trim()
  if (!/^\d{5}$/.test(s)) return null
  const n = Number(s.slice(0, 2))
  return n >= 1 && n <= 52 ? s.slice(0, 2) : null
}

/**
 * Los tres HMAC. Ancla = oportunidad → póliza → ficha (la primera que haya). `riesgo_huella` usa SOLO campos comunes a los
 * dos canales (ramo, CP y, en hogar/comunidades, m²/año/capitales) para que un bot y Avant2 del mismo encargo caigan en el
 * MISMO grupo. Sin secreto o sin ancla → NULL (observación «suelta»; el precio se guarda igual). PURO.
 */
export function huellasDeGrupo(t: TarificacionParaObservar, ramo: Ramo, secreto: string | null): { grupoComparacion: string | null; anclaRiesgo: string | null; riesgoHuella: string | null } {
  if (!secreto) return { grupoComparacion: null, anclaRiesgo: null, riesgoHuella: null }
  const inmueble = ramo === 'hogar' || ramo === 'comunidades' || ramo === 'comercio'
  const riesgoHuella = hmac(secreto, 'riesgo', 'v1', ramo, (t.codigoPostal ?? '').trim(),
    inmueble ? num(t.metrosCuadrados) : null, inmueble ? num(t.anioConstruccion) : null,
    inmueble ? num(t.capitalContinente) : null, inmueble ? num(t.capitalContenido) : null)
  const ancla = t.oportunidadId ? `op:${t.oportunidadId}` : t.polizaId ? `pol:${t.polizaId}` : t.clienteId ? `cli:${t.clienteId}` : null
  if (!ancla) return { grupoComparacion: null, anclaRiesgo: null, riesgoHuella }
  return {
    grupoComparacion: hmac(secreto, 'grupo', 'v1', ancla, ramo, riesgoHuella),
    anclaRiesgo: hmac(secreto, 'ancla', 'v1', ancla),
    riesgoHuella,
  }
}

// ─── Coberturas y nivel ─────────────────────────────────────────────────────────────────────────────────────────

function listaCoberturas(v: unknown): CoberturaParaClasificar[] | null {
  const l = obj(v)?.lista
  if (!Array.isArray(l)) return null
  const out: CoberturaParaClasificar[] = []
  for (const c of l) {
    const o = obj(c)
    const nombre = txt(o?.nombre, 200)
    if (!o || !nombre) continue
    out.push({ nombre, incluida: o.incluida === true ? true : o.incluida === false ? false : null, texto: txt(o.texto, 200) })
  }
  return out.some((c) => c.incluida !== null) ? out : null
}

function porClaveDe(v: unknown): Record<string, EstadoGarantia> | null {
  const g = obj(v)
  const pc = obj(g?.porClave)
  if (!g || typeof g.version !== 'number' || !pc) return null
  const out: Record<string, EstadoGarantia> = {}
  for (const [k, e] of Object.entries(pc)) if (/^[a-z0-9_]{1,60}$/.test(k) && (e === 'si' || e === 'no' || e === 'no_consta')) out[k] = e
  return out
}

/** Resumen por CLAVE de catálogo (nunca textos). `null` = no leídas (≠ `{}`). PURO. */
function coberturasPorClave(ramo: Ramo, p: PrecioParaObservar, lista: CoberturaParaClasificar[] | null, garantias: Record<string, EstadoGarantia> | null): Record<string, EstadoGarantia> | null {
  if (garantias) return garantias
  if (!lista || (ramo !== 'auto' && ramo !== 'moto' && ramo !== 'hogar')) return null
  const r = clasificarCoberturas(ramo, lista, null, { categoria: p.categoria, modalidad: p.modalidad }).porClave
  const out: Record<string, EstadoGarantia> = {}
  for (const [k, e] of Object.entries(r)) if (/^[a-z0-9_]{1,60}$/.test(k)) out[k] = e
  return out
}

/** Fraccionamiento de la oferta RPA que dio este precio (casa por referencia del portal + producto + prima). PURO. */
function formaPagoRpa(ofertas: unknown, p: PrecioParaObservar): FormaPago | null {
  if (!Array.isArray(ofertas)) return null
  const prima = num(p.primaEur)
  const casan = ofertas.map(obj).filter((o): o is Record<string, unknown> => !!o).filter((o) =>
    (txt(o.referenciaPortal) ?? null) === (txt(p.referenciaVendor) ?? null) && txt(o.producto) === txt(p.producto) && num(o.primaAnualEur) === prima)
  if (casan.length !== 1) return null
  const f = formaPagoDe(txt(casan[0]!.fraccionamiento))
  return f === 'desconocida' ? null : f
}

// ─── La proyección ──────────────────────────────────────────────────────────────────────────────────────────────

const fuenteDeCanal = (canal: string | null): Fuente | null => (canal === 'codeoscopic' ? 'avant2' : canal === 'rpa' ? 'rpa' : null)
const ramoDe = (r: string | null): Ramo => ((RAMOS as readonly string[]).includes(r ?? '') ? (r as Ramo) : 'otro')

function compania(catalogo: readonly CompaniaCatalogo[], nombre: string | null): Pick<ObservacionNueva, 'companiaDgs' | 'companiaTexto' | 'companiaResolucion'> {
  const texto = txt(nombre) ?? 'compañía sin identificar'
  const id = resolverCompania(catalogo, txt(nombre))
  return { companiaTexto: texto, companiaDgs: id.estado === 'resuelta' ? id.codigoDgs : null, companiaResolucion: id.estado }
}

/**
 * Todas las observaciones de UNA tarificación (precios + rechazos de Avant2). PURO.
 * Simulada o de un canal desconocido → `[]`. Mismo resultado en caliente y en el barrido (salvo `perfil`/`creadoPor`, que no
 * entran en la huella).
 */
export function observacionesDeTarificacion(t: TarificacionParaObservar, precios: readonly PrecioParaObservar[], ctx: ContextoObservacion): ObservacionNueva[] {
  const fuente = fuenteDeCanal(t.canal)
  if (!fuente || t.simulado) return []
  const ramo = ramoDe(t.ramo)
  const observadaAt = isoMomento(t.creadoAt)
  const dia = observadaAt.slice(0, 10)
  const fechaEfecto = isoFecha(t.fechaEfecto)
  const provincia = provinciaDeCp(t.codigoPostal)
  const huellas = huellasDeGrupo(t, ramo, ctx.secreto)
  const perfil: Perfil = { ...perfilDeTarificacion(t, ramo, dia), ...(ctx.riesgoRpa !== undefined && fuente === 'rpa' ? perfilDeRiesgoRpa(ramo, ctx.riesgoRpa, dia) : {}) }
  const comun = { fuente, ramo, observadaAt, fechaTipo: 'cotizada' as const, fechaEfecto, provincia, ...huellas, perfil, creadoPor: ctx.creadoPor, primaTipo: 'total' as const, nivelVersion: NIVEL_VERSION }
  const out: ObservacionNueva[] = []

  // Coherencia (solo Avant2): un precio afectado por un reparo de `revisarCoherenciaCotizacion` es `incoherente`.
  const incoherentes = new Set<number>()
  if (fuente === 'avant2') {
    const reparos = revisarCoherenciaCotizacion(precios.map((p) => ({ compania: p.compania, categoria: p.categoria, modalidad: p.modalidad, primaEur: num(p.primaEur), franquiciaEur: num(p.franquiciaEur) })))
    for (const r of reparos) for (const i of r.indices) incoherentes.add(i)
  }

  precios.forEach((p, i) => {
    const pa = primaAnual(fuente, p, fuente === 'rpa' ? formaPagoRpa(t.ofertasRpa, p) : null)
    const lista = listaCoberturas(p.coberturas)
    const garantias = porClaveDe(p.garantias)
    const n = nivelDeOferta(ramo, {
      compania: txt(p.compania) ?? '', producto: txt(p.producto) ?? '', modalidad: txt(p.modalidad), categoria: txt(p.categoria),
      primaEur: pa.ok ? pa.cents / 100 : null, franquiciaEur: num(p.franquiciaEur), coberturas: lista, garantias,
    })
    const franq = num(p.franquiciaEur)
    const base = {
      ...comun,
      origenTabla: 'tarificacion_precios' as const,
      origenId: p.id,
      origenSubclave: '',
      claveOrigen: claveOrigen(fuente, 'tarificacion_precios', p.id, ''),
      resultado: (pa.ok ? 'precio' : 'sin_precio_no_concluyente') as Resultado,
      motivoCodigo: pa.ok ? null : pa.motivo,
      ...compania(ctx.catalogo, p.compania),
      producto: txt(p.producto),
      modalidad: txt(p.modalidad),
      categoria: txt(p.categoria),
      nivel: n.nivel,
      nivelFuente: n.fuente,
      primaAnualCents: pa.ok ? pa.cents : null,
      formaPago: pa.formaPago,
      franquiciaCents: franq !== null && franq >= 0 ? Math.round(franq * 100) : null,
      coberturas: coberturasPorClave(ramo, p, lista, garantias),
      firmeza: ((FIRMEZAS as readonly string[]).includes(p.firmeza ?? '') ? p.firmeza : 'estimado') as ObservacionNueva['firmeza'],
      coherencia: (fuente === 'avant2' ? (incoherentes.has(i) ? 'incoherente' : 'ok') : 'no_revisada') as ObservacionNueva['coherencia'],
    }
    out.push({ ...base, huellaValores: huellaValores(base) })
  })

  // Rechazos (solo Avant2). `fallos` NULL/no-array = no se sabe → ninguno. Un fallo con «también dio precio» no es rechazo.
  if (fuente === 'avant2' && Array.isArray(t.fallos)) {
    t.fallos.forEach((f, i) => {
      const o = obj(f)
      if (!o || o.tambienDioPrecio === true) return
      const nombre = txt(o.compania)
      const motivoTexto = typeof o.motivo === 'string' ? o.motivo : null
      if (!nombre && !motivoTexto) return
      const m = motivoDeFallo(motivoTexto)
      const sub = `fallo:${i}:${normalizarCompania(nombre).replace(/[^a-z0-9 ]/g, '').slice(0, 60)}`
      const n = nivelDeOferta(ramo, { compania: nombre ?? '', producto: txt(o.producto) ?? '', modalidad: txt(o.configuracion), primaEur: null })
      const base = {
        ...comun,
        origenTabla: 'tarificaciones' as const,
        origenId: t.id,
        origenSubclave: sub,
        claveOrigen: claveOrigen(fuente, 'tarificaciones', t.id, sub),
        resultado: m.resultado,
        motivoCodigo: m.codigo,
        ...compania(ctx.catalogo, nombre),
        producto: txt(o.producto),
        modalidad: txt(o.configuracion),
        categoria: null,
        nivel: n.nivel,
        nivelFuente: n.fuente,
        primaAnualCents: null,
        formaPago: null,
        franquiciaCents: null,
        coberturas: null,
        firmeza: (m.resultado === 'rechazo_compania' ? 'firme' : 'estimado') as ObservacionNueva['firmeza'],
        coherencia: 'no_revisada' as const,
      }
      out.push({ ...base, huellaValores: huellaValores(base) })
    })
  }
  return out
}

/** Recuento por fuente y resultado (ensayo del barrido). PURO. */
export function contarPorFuente(obs: readonly Pick<ObservacionNueva, 'fuente' | 'resultado'>[]): Record<string, Record<string, number>> {
  const r: Record<string, Record<string, number>> = {}
  for (const o of obs) {
    const f = (r[o.fuente] ??= {})
    f[o.resultado] = (f[o.resultado] ?? 0) + 1
  }
  return r
}
