// Purga de los DATOS PERSONALES del riesgo de un trabajo del tarificador al CERRARSE (13/10/2026). PURO.
//
// `seguros.tarificacion_trabajos.riesgo` lleva lo que el robot teclea en el portal: fechas de nacimiento y carné,
// matrícula, tomador (nombre, NIF, teléfono, email, dirección), NIF/CIF de la comunidad, nº de póliza a reemplazar…
// Mientras el trabajo vive (o espera a una persona que lo reintente) hace falta entero. Cerrado, NO se queda en claro.
//
// LISTA BLANCA (Alberto, 13/10/2026): se CONSERVA solo lo que no identifica a nadie y sigue siendo útil (vehículo de
// catálogo, CP/población, ramo, el edificio de la comunidad). Todo lo demás se BORRA, también una clave nueva que nadie
// conozca todavía: borrar es el estado por defecto. Cada hoja conservada tiene que ser un valor simple (texto, número,
// sí/no o null); un objeto escondido bajo una clave de la lista se borra igual.
//
// También se aplica AL ESCRIBIR `tarificaciones.peticion` de canal `rpa` (nadie lee de ahí datos personales: solo se
// leen formas de Avant2, `risk.*`/`holder`, que una petición de portal no tiene).
//
// 🚨 La MISMA lista vive en SQL en `apps/asegura/prisma/sql/2026-10-13_tarificador_purga_riesgo.sql` (limpieza de los ya
//    cerrados). El cepo `test/regression-tarificador-purga-riesgo.test.ts` exige que coincidan.

import { botonEmisionDe } from './emision.ts'

/**
 * Estados en los que el riesgo se purga. `requiere_humano` y `error_reintentable` NO: el reintento (de la persona o del
 * barrido) necesita el riesgo entero. `error_definitivo` SÍ (decisión de Alberto): por eso la bandeja ya no lo reintenta
 * (`decidirAccionBandeja`); se vuelve a pedir el presupuesto desde la oportunidad.
 */
export const ESTADOS_PURGA_RIESGO = ['ok', 'error_definitivo', 'cancelado', 'emitido'] as const

/** Comunidades: el EDIFICIO. Fuera: documentoIdentidad, tipoDocumento, polizaAReemplazar, referenciaCatastral. */
export const CLAVES_RIESGO_COMUNIDAD = [
  'ramo', 'direccion', 'fechaEfecto', 'fechaTermino',
  'm2Construidos', 'anioConstruccion', 'anioRehabilitacion', 'tipoVivienda', 'uso', 'plantas', 'plantasBajoRasante',
  'sotanos', 'numEdificios', 'contiguos', 'numViviendasYLocales', 'numViviendas', 'numLocales', 'numGarajes',
  'listaPropietarios', 'instalacionesAnexas', 'formaPagoPrimerRecibo', 'formaPagoSucesivos', 'comision',
  'capitalContinente', 'capitalContenido', 'asistenciaPlagas', 'asesoramientoJuridico', 'impagoCuotas', 'ite',
  'modalidad', 'opciones', 'ascensor', 'piscina', 'zonasAjardinadas', 'calidadConstruccion', 'siniestrosUltimos3Anios',
  'companiaActual',
] as const

/** Auto/moto: vehículo de catálogo, CP/población y las elecciones de versión/población. Fuera: matrícula, conductor, tomador… */
export const CLAVES_RIESGO_VEHICULO = [
  'ramo', 'codigoPostal', 'poblacion', 'eleccionPoblacion', 'seleccionVehiculo', 'eleccionVersion', 'eleccionVersionIa',
] as const

/** Ramo sin lista propia (p. ej. una exploración de Hogar): solo el ramo. */
export const CLAVES_RIESGO_OTRO = ['ramo'] as const

/** Claves que son OBJETO y qué sub-claves conservan. Fuera de la dirección: vía y número. */
export const SUBCLAVES_RIESGO: Readonly<Record<string, readonly string[]>> = Object.freeze({
  direccion: Object.freeze(['codigoPostal', 'municipio', 'provincia']),
  seleccionVehiculo: Object.freeze(['marca', 'modelo', 'clase', 'cilindradaCc', 'descripcion']),
  eleccionVersion: Object.freeze(['codigo', 'etiqueta']),
  eleccionVersionIa: Object.freeze(['origen', 'clave']),
})

export function clavesConservadas(ramo: unknown): readonly string[] {
  const r = typeof ramo === 'string' ? ramo.trim().toLowerCase() : ''
  if (r === 'comunidades') return CLAVES_RIESGO_COMUNIDAD
  if (r === 'moto' || r === 'auto') return CLAVES_RIESGO_VEHICULO
  return CLAVES_RIESGO_OTRO
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const esHoja = (v: unknown): boolean =>
  v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))

/**
 * El riesgo con SOLO lo de la lista blanca del `ramo` (el de la COLUMNA del trabajo, que manda). Un riesgo que no es
 * objeto → `{}`. Idempotente: purgar dos veces da lo mismo.
 */
export function riesgoSinDatosPersonales(riesgo: unknown, ramo: unknown): Record<string, unknown> {
  if (!esObjeto(riesgo)) return {}
  const permitidas = new Set(clavesConservadas(ramo))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(riesgo)) {
    if (!permitidas.has(k)) continue
    const sub = Object.hasOwn(SUBCLAVES_RIESGO, k) ? SUBCLAVES_RIESGO[k] : null
    if (sub) {
      if (v === null) { out[k] = null; continue }
      if (!esObjeto(v)) continue
      const o: Record<string, unknown> = {}
      for (const [sk, sv] of Object.entries(v)) if (sub.includes(sk) && esHoja(sv)) o[sk] = sv
      out[k] = o
      continue
    }
    if (esHoja(v)) out[k] = v
  }
  return out
}

/**
 * Lo que hace falta saber del trabajo para decidir. `modo` null = tarificar (sin el SQL de emisión no hay columna).
 * `origenLiberado`: solo cuenta en un origen de emisión (ver `origenEmisionLiberado`); ausente = no liberado.
 */
export type TrabajoParaPurga = { estado: unknown; modo: unknown; compania: unknown; ramo: unknown; riesgo: unknown; origenLiberado?: boolean }

/** Un origen de emisión que nunca la pidió se purga a los N días de su `ok` (Alberto, 13/10/2026). */
export const DIAS_ORIGEN_EMISION = 30

/**
 * ¿El ORIGEN de una emisión ya puede perder sus datos personales? (Alberto, 13/10/2026; revisión del PR #4588)
 *   · con alguna emisión suya ABIERTA (cualquier estado que no sea de cierre, `requiere_humano` incluido) → NO;
 *   · si alguna emisión suya terminó `emitido` → SÍ (la póliza ya existe);
 *   · si no (sin emisiones, o solo rechazadas/caducadas = `cancelado`): SÍ a los `DIAS_ORIGEN_EMISION` días de su `ok`,
 *     y hasta entonces se puede volver a pedir la emisión. Sin fecha de fin legible → NO (la duda conserva).
 * Una vez liberado, `solicitarEmision` ya no lo acepta como origen: se vuelve a tarificar.
 */
export function origenEmisionLiberado(e: { terminadoAt: Date | string | null; ahora: Date; emisiones: readonly unknown[] }): boolean {
  const cerrado = (x: unknown) => typeof x === 'string' && (ESTADOS_PURGA_RIESGO as readonly string[]).includes(x)
  if (e.emisiones.some((x) => !cerrado(x))) return false
  if (e.emisiones.includes('emitido')) return true
  const fin = e.terminadoAt === null ? NaN : new Date(e.terminadoAt).getTime()
  if (!Number.isFinite(fin)) return false
  return e.ahora.getTime() - fin >= DIAS_ORIGEN_EMISION * 86_400_000
}

export type PlanPurga =
  | { purgar: true; riesgo: Record<string, unknown> }
  | { purgar: false; motivo: 'estado_vivo' | 'origen_de_emision' | 'ya_purgado' | 'no_es_objeto' }

/**
 * ¿Es este trabajo el ORIGEN posible de una emisión? Una tarificación `ok` de (compañía, ramo) con botón de emisión
 * (hoy solo Allianz Comunidades): `solicitarEmision` copia SU riesgo entero (con el CIF del tomador) al trabajo de
 * emisión, y el cliente puede aceptar días después. Purgarla al cerrar dejaría la emisión sin tomador.
 */
export function esOrigenDeEmision(t: Pick<TrabajoParaPurga, 'estado' | 'modo' | 'compania' | 'ramo'>): boolean {
  if (t.estado !== 'ok') return false
  if ((t.modo ?? 'tarificar') !== 'tarificar') return false
  return typeof t.compania === 'string' && typeof t.ramo === 'string' && botonEmisionDe(t.compania, t.ramo) !== null
}

/** Qué hacer con el riesgo de un trabajo en su estado ACTUAL. PURO. Ante cualquier duda de estado: no se purga nada. */
export function planPurgaRiesgo(t: TrabajoParaPurga): PlanPurga {
  if (typeof t.estado !== 'string' || !(ESTADOS_PURGA_RIESGO as readonly string[]).includes(t.estado)) return { purgar: false, motivo: 'estado_vivo' }
  // Un riesgo que no es objeto (NULL, texto, lista) NO se convierte en `{}`: no se sabe qué es y no se escribe nada.
  if (!esObjeto(t.riesgo)) return { purgar: false, motivo: 'no_es_objeto' }
  if (esOrigenDeEmision(t) && t.origenLiberado !== true) return { purgar: false, motivo: 'origen_de_emision' }
  const riesgo = riesgoSinDatosPersonales(t.riesgo, t.ramo)
  // Comparación estable: la purga conserva el orden de las claves que quedan.
  if (JSON.stringify(riesgo) === JSON.stringify(t.riesgo)) return { purgar: false, motivo: 'ya_purgado' }
  return { purgar: true, riesgo }
}

/** ¿El riesgo de un trabajo en este estado ya no se puede reutilizar para volver a lanzarlo (está o estará purgado)? */
export function riesgoPurgadoEnEstado(estado: unknown): boolean {
  return typeof estado === 'string' && (ESTADOS_PURGA_RIESGO as readonly string[]).includes(estado)
}

/** Motivo explícito cuando se rechaza reutilizar un riesgo purgado como plantilla. */
export const MOTIVO_ORIGEN_PURGADO = 'origen_purgado'

/**
 * ¿Este riesgo de un trabajo CERRADO ya está purgado (no le queda nada fuera de la lista blanca)? Entonces NO sirve de
 * PLANTILLA (renovación, precarga, «Probar», exploración con datos reales): reutilizarlo sería tarificar con un riesgo a
 * medias (sin NIF/CIF, vía, matrícula, conductor…). Un trabajo vivo nunca lo está; un cerrado que aún conserva datos
 * (origen de emisión retenido, o anterior a la limpieza) todavía sirve. Riesgo que no es objeto → inservible (true).
 */
export function riesgoYaPurgado(t: Pick<TrabajoParaPurga, 'estado' | 'ramo' | 'riesgo'>): boolean {
  if (typeof t.estado !== 'string' || !(ESTADOS_PURGA_RIESGO as readonly string[]).includes(t.estado)) return false
  if (!esObjeto(t.riesgo)) return true
  return JSON.stringify(riesgoSinDatosPersonales(t.riesgo, t.ramo)) === JSON.stringify(t.riesgo)
}
