// Tarificador RPA — VEHÍCULO ENCADENADO hacia Generali (18/10/2026). PURO: sin BD ni red (`node --test`).
//
// Regla de Alberto (18/10/2026): Generali NO saca marca/modelo/versión por matrícula, así que se tarifica DESPUÉS de Allianz o
// Mapfre. Cuando un trabajo `ok` de allianz/auto o mapfre/auto de la MISMA oportunidad (y correduría) ha confirmado el vehículo
// de catálogo (`seleccionVehiculo`: marca, modelo y versión separados; o `vehiculoConfirmado`: la denominación de Mapfre), ese
// vehículo se INYECTA en el riesgo del trabajo de Generali, que lo busca en sus desplegables.
//   · Al ENCOLAR Generali: si ya hay un `ok` con vehículo → se encola con él; si no, `pendiente` con la marca `esperaVehiculo`
//     (no se reclama ni se lanza máquina: `reclamarSiguiente` lo salta). Sin oportunidad → rechazo (no hay de dónde sacarlo).
//   · Al REGISTRAR el `ok` de Allianz/Mapfre: el vehículo se guarda en SU riesgo (claves de la lista blanca de la purga) y se
//     inyecta en los Generali en espera de esa oportunidad.
//   · En el BARRIDO: un Generali en espera con un `ok` ya disponible se inyecta (carreras); si no queda ningún Allianz/Mapfre vivo
//     en la oportunidad, o pasó la espera máxima, se CANCELA con el motivo (nunca se lanza a ciegas).
// 🚨 Solo catálogo: ni matrícula ni bastidor (el validador lo rechaza). Lo del worker es ACCESORIO: inválido → se descarta.

import {
  MAX_DESCRIPCION_VEHICULO,
  claveCompania,
  pareceDatoPersonalEnDescripcion,
  validarVehiculoConfirmado,
  type VehiculoConfirmado,
} from '@central/module-tarificacion'

/** Marca del riesgo de un trabajo que ESPERA el vehículo (no reclamable hasta que se le inyecta). */
export const CLAVE_ESPERA_VEHICULO = 'esperaVehiculo'
/** Compañías cuyo `ok` de auto puede dar el vehículo a Generali. */
export const ORIGENES_VEHICULO_ENCADENADO = Object.freeze(['allianz', 'mapfre'] as const)
/** Estados de un trabajo de origen que aún PUEDE acabar en `ok` (mientras haya uno, se espera). */
export const ESTADOS_ORIGEN_VIVOS = Object.freeze(['pendiente', 'en_curso', 'error_reintentable', 'atascado'] as const)
/** Espera máxima de un Generali sin vehículo: pasado esto se cancela con el motivo (la oportunidad se puede volver a pedir). */
export const ESPERA_MAXIMA_VEHICULO_MS = 24 * 3_600_000
/** Espera máxima de un trabajo (Mapfre/Allianz) que espera una IDENTIFICACIÓN: pasado esto se LIBERA y pregunta su versión. */
export const ESPERA_MAXIMA_IDENTIFICACION_MS = 2 * 3_600_000
const MAX_NOMBRE_CATALOGO = 80

export const MOTIVO_SIN_OPORTUNIDAD = 'generali_sin_vehiculo: Generali no busca el vehículo por matrícula; pídelo desde una oportunidad junto a Allianz o Mapfre (o con marca y modelo confirmados)'
export const MOTIVO_CANCELADO_SIN_ORIGEN = 'sin_vehiculo_confirmado: ningún Allianz/Mapfre de esta oportunidad confirmó marca, modelo y versión; pide primero Allianz o Mapfre y vuelve a pedir Generali'
export const MOTIVO_CANCELADO_CADUCADO = 'sin_vehiculo_confirmado: pasaron 24 h sin que Allianz/Mapfre confirmaran el vehículo de esta oportunidad; vuelve a pedir Generali'

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const texto = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** ¿El bot de esta compañía/ramo necesita el vehículo encadenado? Hoy solo Generali Turismos. PURA. */
export function necesitaVehiculoEncadenado(compania: string, ramo: string): boolean {
  return claveCompania(compania) === 'generali' && ramo === 'auto'
}

/** ¿Puede el `ok` de esta compañía/ramo dar el vehículo a Generali? PURA. */
export function esOrigenVehiculo(compania: string, ramo: string): boolean {
  return ramo === 'auto' && (ORIGENES_VEHICULO_ENCADENADO as readonly string[]).includes(claveCompania(compania))
}

export type SeleccionCatalogo = { marca: string; modelo: string; descripcion?: string }
/** Lo que viaja: el separado y/o la denominación de Mapfre. Nunca vacío (vacío = `null`). */
export type VehiculoEncadenado = { seleccionVehiculo?: SeleccionCatalogo; vehiculoConfirmado?: VehiculoConfirmado }

/** `seleccionVehiculo` del worker: marca y modelo (≤80) y versión opcional (`descripcion`), sin forma de dato personal. PURA. */
export function validarSeleccionCatalogo(v: unknown): SeleccionCatalogo | null {
  const o = obj(v)
  if (!o) return null
  const extra = Object.keys(o).filter((k) => !['marca', 'modelo', 'descripcion', 'clase', 'cilindradaCc'].includes(k))
  if (extra.length) return null
  const marca = texto(o.marca)
  const modelo = texto(o.modelo)
  const descripcion = texto(o.descripcion)
  if (!marca || !modelo || marca.length > MAX_NOMBRE_CATALOGO || modelo.length > MAX_NOMBRE_CATALOGO || descripcion.length > MAX_DESCRIPCION_VEHICULO) return null
  if ([marca, modelo, descripcion].some((t) => t !== '' && pareceDatoPersonalEnDescripcion(t))) return null
  return { marca, modelo, ...(descripcion ? { descripcion } : {}) }
}

/**
 * El vehículo del cuerpo `ok` del worker (`seleccionVehiculo` / `vehiculoConfirmado`). ACCESORIO: lo inválido se descarta
 * (`descartado` dice qué), nunca tumba el resultado. `null` = no trae nada válido. PURA.
 */
export function leerVehiculoWorker(cuerpo: Record<string, unknown>): { vehiculo: VehiculoEncadenado | null; descartado: string[] } {
  const descartado: string[] = []
  const out: VehiculoEncadenado = {}
  if (cuerpo.seleccionVehiculo !== undefined && cuerpo.seleccionVehiculo !== null) {
    const s = validarSeleccionCatalogo(cuerpo.seleccionVehiculo)
    if (s) out.seleccionVehiculo = s
    else descartado.push('seleccionVehiculo')
  }
  if (cuerpo.vehiculoConfirmado !== undefined && cuerpo.vehiculoConfirmado !== null) {
    const v = validarVehiculoConfirmado(cuerpo.vehiculoConfirmado)
    if (v.ok) out.vehiculoConfirmado = v.valor
    else descartado.push('vehiculoConfirmado')
  }
  return { vehiculo: out.seleccionVehiculo || out.vehiculoConfirmado ? out : null, descartado }
}

/**
 * 31/10/2026 · «probar» Generali auto devolvía 422 `generali_sin_vehiculo` con un cliente cuya póliza de auto VIVA vinculada a la
 * oportunidad ya dice qué coche es. De su `datos_especificos` SOLO las claves de catálogo `marca`, `modelo` y `version` (nunca matrícula
 * ni bastidor) → `seleccionVehiculo` (la versión, en `descripcion`). Sin marca o sin modelo → `null` (no se inventa); una versión que no
 * pasa el validador se omite (marca y modelo siguen valiendo). Mismo validador que lo del worker (`validarSeleccionCatalogo`). PURA.
 */
export function vehiculoDePolizaViva(datosEspecificos: unknown): VehiculoEncadenado | null {
  const d = obj(datosEspecificos)
  if (!d) return null
  const marca = texto(d.marca)
  const modelo = texto(d.modelo)
  if (!marca || !modelo) return null
  const version = texto(d.version)
  const s = (version ? validarSeleccionCatalogo({ marca, modelo, descripcion: version }) : null) ?? validarSeleccionCatalogo({ marca, modelo })
  return s ? { seleccionVehiculo: s } : null
}

/** ¿El riesgo ya trae un vehículo que Generali puede buscar? (marca+modelo, o denominación de Mapfre). PURA. */
export function tieneVehiculo(riesgo: unknown): boolean {
  const r = obj(riesgo)
  if (!r) return false
  const sv = obj(r.seleccionVehiculo)
  return (texto(sv?.marca) !== '' && texto(sv?.modelo) !== '') || texto(obj(r.vehiculoConfirmado)?.denominacion) !== ''
}

/** ¿El riesgo está en espera del vehículo? PURA. */
export function enEsperaVehiculo(riesgo: unknown): boolean {
  return obj(riesgo)?.[CLAVE_ESPERA_VEHICULO] === true
}

/** El riesgo con la marca de espera (sin tocar lo demás). PURA. */
export function riesgoEnEspera<T>(riesgo: T): T {
  return { ...(riesgo as Record<string, unknown>), [CLAVE_ESPERA_VEHICULO]: true } as T
}

/** El riesgo SIN la marca y con el vehículo inyectado (las claves del vehículo encadenado mandan). PURA. */
export function riesgoConVehiculo<T>(riesgo: T, v: VehiculoEncadenado): T {
  const { [CLAVE_ESPERA_VEHICULO]: _fuera, ...resto } = riesgo as Record<string, unknown>
  return { ...resto, ...(v.seleccionVehiculo ? { seleccionVehiculo: v.seleccionVehiculo } : {}), ...(v.vehiculoConfirmado ? { vehiculoConfirmado: v.vehiculoConfirmado } : {}) } as T
}

/** Clave del riesgo del trabajo de ORIGEN donde asegura guarda el catálogo separado que confirmó su bot (lista blanca de la purga). */
export const CLAVE_CATALOGO_ORIGEN = 'vehiculoCatalogo'

/**
 * Lo que se ESCRIBE en el riesgo del trabajo de origen (Allianz/Mapfre) al registrar su `ok`: `vehiculoCatalogo` (con el origen)
 * y `vehiculoConfirmado`. Solo lo escribe asegura con lo que mandó el bot: así un `seleccionVehiculo` tecleado en el formulario
 * nunca pasa por «confirmado». PURA.
 */
export function vehiculoParaRiesgoOrigen(compania: string, v: VehiculoEncadenado): Record<string, unknown> {
  return {
    ...(v.seleccionVehiculo ? { [CLAVE_CATALOGO_ORIGEN]: { origen: claveCompania(compania), ...v.seleccionVehiculo } } : {}),
    ...(v.vehiculoConfirmado ? { vehiculoConfirmado: v.vehiculoConfirmado } : {}),
  }
}

/** Una fila `ok` de Allianz/Mapfre de la oportunidad (su riesgo YA purgado conserva `vehiculoCatalogo` y `vehiculoConfirmado`). */
export type FilaOrigen = { compania: string; ramo: string; riesgo: unknown; terminadoAt: Date | null }

/**
 * El vehículo de los `ok` de la oportunidad: el `seleccionVehiculo` y el `vehiculoConfirmado` MÁS RECIENTES (cada uno de quien
 * lo tenga). Solo filas de origen válido; lo inválido no cuenta. `null` = ninguno. PURA.
 */
export function vehiculoDeOrigenes(filas: readonly FilaOrigen[]): VehiculoEncadenado | null {
  const orden = [...filas].filter((f) => esOrigenVehiculo(f.compania, f.ramo)).sort((a, b) => (b.terminadoAt?.getTime() ?? 0) - (a.terminadoAt?.getTime() ?? 0))
  const out: VehiculoEncadenado = {}
  for (const f of orden) {
    const r = obj(f.riesgo) ?? {}
    // El catálogo separado SOLO de `vehiculoCatalogo` (lo escribió asegura con lo que confirmó el bot), nunca del
    // `seleccionVehiculo` del formulario de esa compañía (podría ser tecleado).
    const cat = obj(r[CLAVE_CATALOGO_ORIGEN])
    const { origen: _o, ...sinOrigen } = cat ?? {}
    const { vehiculo } = leerVehiculoWorker({ seleccionVehiculo: cat ? sinOrigen : null, vehiculoConfirmado: r.vehiculoConfirmado })
    if (!out.seleccionVehiculo && vehiculo?.seleccionVehiculo) out.seleccionVehiculo = vehiculo.seleccionVehiculo
    if (!out.vehiculoConfirmado && vehiculo?.vehiculoConfirmado) out.vehiculoConfirmado = vehiculo.vehiculoConfirmado
  }
  return out.seleccionVehiculo || out.vehiculoConfirmado ? out : null
}

/**
 * Al ENCOLAR (solo si `necesitaVehiculoEncadenado`): el riesgo que se guarda. Ya trae vehículo → tal cual; hay un `ok` de
 * origen en la oportunidad → con ese vehículo; sin oportunidad → rechazo; si no → en espera. PURA.
 */
export function riesgoAlEncolar<T>(riesgo: T, oportunidadId: string | null, deOrigenes: VehiculoEncadenado | null): { ok: true; riesgo: T; enEspera: boolean } | { ok: false; status: 422; motivo: string } {
  const sinMarca = riesgoConVehiculo(riesgo, {})
  if (tieneVehiculo(sinMarca)) return { ok: true, riesgo: sinMarca, enEspera: false }
  if (deOrigenes) return { ok: true, riesgo: riesgoConVehiculo(sinMarca, deOrigenes), enEspera: false }
  if (!oportunidadId) return { ok: false, status: 422, motivo: MOTIVO_SIN_OPORTUNIDAD }
  return { ok: true, riesgo: riesgoEnEspera(sinMarca), enEspera: true }
}

/** Motivos (traza, sin datos personales) de liberar una espera sin vehículo. */
export const MOTIVO_LIBERADO_SIN_ORIGEN = 'sin_identificacion: no hay identificación del vehículo en curso; el robot pregunta su versión'
export const MOTIVO_LIBERADO_ORIGEN_BLOQUEADO = 'sin_identificacion: Mapfre está pausado o inactivo; el robot pregunta su versión'
export const MOTIVO_LIBERADO_CADUCADO = 'sin_identificacion: la identificación tardó más de 2 h; el robot pregunta su versión'

/**
 * ¿Un trabajo en espera de esta compañía/ramo se puede LIBERAR (sigue SIN vehículo y tarifica preguntando su versión)? Mapfre y
 * Allianz sí: buscan por matrícula y saben preguntar. Generali NO: no busca por matrícula, sin vehículo solo puede fallar. PURA.
 */
export function esperaLiberable(compania: string, ramo: string): boolean {
  return ramo === 'auto' && ['mapfre', 'allianz'].includes(claveCompania(compania))
}

export type DecisionEspera =
  | { tipo: 'inyectar'; vehiculo: VehiculoEncadenado }
  | { tipo: 'esperar' }
  | { tipo: 'cancelar'; motivo: string }
  /** Quitar la marca de espera SIN vehículo: el trabajo se reclama y tarifica como si nunca hubiera esperado. */
  | { tipo: 'liberar'; motivo: string }

/**
 * Un Generali en espera, en el BARRIDO: con vehículo → inyectar; sin vehículo y con algún origen vivo y dentro de las 24 h →
 * esperar; si no → cancelar con el motivo (nunca se lanza sin vehículo). PURA.
 */
export function decidirEspera(e: {
  vehiculo: VehiculoEncadenado | null
  origenesVivos: number
  creadoAt: Date
  ahora: Date
  /** Compañía/ramo del trabajo que espera. Por defecto Generali auto (la regla de siempre). */
  compania?: string
  ramo?: string
  /** El origen (identificación de Mapfre) no puede avanzar: pausa viva o integración inactiva/ausente. Solo cuenta si se puede liberar. */
  origenBloqueado?: boolean
}): DecisionEspera {
  if (e.vehiculo) return { tipo: 'inyectar', vehiculo: e.vehiculo }
  // Mapfre/Allianz: NUNCA se quedan congeladas ni se cancelan por no tener vehículo; se liberan y preguntan su versión.
  if (esperaLiberable(e.compania ?? 'generali', e.ramo ?? 'auto')) {
    if (e.origenBloqueado) return { tipo: 'liberar', motivo: MOTIVO_LIBERADO_ORIGEN_BLOQUEADO }
    if (e.ahora.getTime() - e.creadoAt.getTime() >= ESPERA_MAXIMA_IDENTIFICACION_MS) return { tipo: 'liberar', motivo: MOTIVO_LIBERADO_CADUCADO }
    if (e.origenesVivos > 0) return { tipo: 'esperar' }
    return { tipo: 'liberar', motivo: MOTIVO_LIBERADO_SIN_ORIGEN }
  }
  if (e.ahora.getTime() - e.creadoAt.getTime() >= ESPERA_MAXIMA_VEHICULO_MS) return { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_CADUCADO }
  if (e.origenesVivos > 0) return { tipo: 'esperar' }
  return { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_SIN_ORIGEN }
}
