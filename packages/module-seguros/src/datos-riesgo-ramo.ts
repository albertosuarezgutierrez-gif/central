/**
 * Los datos del riesgo de una oportunidad, POR RAMO (30/09/2026): un solo punto que dice qué clave de
 * `info_riesgo` corresponde a cada tipo de oportunidad y cómo se edita/confirma/precarga, con el MISMO patrón para
 * todos:
 *
 *   auto, moto                → `datosVehiculo`   (datos-vehiculo-riesgo.ts)
 *   hogar                     → `datosVivienda`   (datos-vivienda-riesgo.ts)
 *   vida, salud, decesos      → `datosCapital`    (datos-capital-riesgo.ts)
 *   RC, comercio, comunidades, otros → `datosRiesgoLibre` (datos-riesgo-libre.ts; sin tarifa, para el expediente)
 *
 * Todo PURO: entra el `info_riesgo` que hay, la edición y el instante; sale lo que hay que escribir y qué cambió.
 * La transacción, la fila de `oportunidad_historial` y la auditoría las pone el puerto de asegura.
 *
 * Reglas comunes: una clave NUEVA en `info_riesgo`, el resto se conserva tal cual (incluidas las viejas:
 * `vehiculo` de texto, `matricula`, `presupuestoCodeoscopic`…); clave ausente = no se toca; `null` = borrar ese
 * dato; cualquier edición sin confirmar borra `confirmadoAt`; sin nada que afirmar no se confirma.
 */
import {
  admiteDatosVehiculo,
  aplicarEdicionVehiculo,
  datosVehiculoDeInfoRiesgo,
  faltanDatosVehiculo,
  incoherenciaFechasVehiculo,
  leerDatosVehiculo,
  motivoNoConfirmable,
  validarDatosVehiculoRiesgo,
} from './datos-vehiculo-riesgo.ts'
import {
  admiteDatosVivienda,
  aplicarEdicionVivienda,
  faltanDatosVivienda,
  incoherenciaVivienda,
  leerDatosVivienda,
  motivoNoConfirmableVivienda,
  precargaViviendaDePoliza,
  validarDatosViviendaRiesgo,
} from './datos-vivienda-riesgo.ts'
import {
  admiteDatosCapital,
  aplicarEdicionCapital,
  faltanDatosCapital,
  leerDatosCapital,
  motivoNoConfirmableCapital,
  validarDatosCapitalRiesgo,
} from './datos-capital-riesgo.ts'
import {
  aplicarEdicionLibre,
  leerDatosRiesgoLibre,
  motivoNoConfirmableLibre,
  precargaLibreDePoliza,
  validarDatosRiesgoLibre,
} from './datos-riesgo-libre.ts'

export const CLAVES_DATOS_RIESGO = ['datosVehiculo', 'datosVivienda', 'datosCapital', 'datosRiesgoLibre'] as const
export type ClaveDatosRiesgo = (typeof CLAVES_DATOS_RIESGO)[number]

export function esClaveDatosRiesgo(x: unknown): x is ClaveDatosRiesgo {
  return typeof x === 'string' && (CLAVES_DATOS_RIESGO as readonly string[]).includes(x)
}

/** La clave de `info_riesgo` que le toca a este tipo de oportunidad. Todo ramo tiene una (los raros, la libre). */
export function claveDatosDeRamo(ramo: unknown): ClaveDatosRiesgo {
  if (admiteDatosVehiculo(ramo)) return 'datosVehiculo'
  if (admiteDatosVivienda(ramo)) return 'datosVivienda'
  if (admiteDatosCapital(ramo)) return 'datosCapital'
  return 'datosRiesgoLibre'
}

/** Este ramo se puede tarificar por Codeoscopic desde el riesgo (los libres se cotizan fuera). */
export function ramoTarificable(ramo: unknown): boolean {
  return claveDatosDeRamo(ramo) !== 'datosRiesgoLibre'
}

type Obj = Record<string, unknown>
const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lo que `info_riesgo` queda tras guardar un bloque: esa clave se pone y TODAS las demás se conservan. */
export function fusionarInfoRiesgoClave(info: unknown, clave: ClaveDatosRiesgo, datos: unknown): Obj {
  const base = esObj(info) ? info : {}
  return { ...base, [clave]: datos }
}

/**
 * La precarga desde la póliza de la que nace la oportunidad (`polizas.datos_especificos` + el objeto asegurado).
 * Vehículo: matrícula/marca/modelo (lo que ya copiaba `abrirRiesgoDePoliza`, sin cambios de comportamiento: va
 * suelto en `info_riesgo`, no en `datosVehiculo`). Vivienda y libre: lo que haya. Capital: nada (no es un bien).
 * `null` = nada que precargar.
 */
export function precargaDePoliza(
  ramo: unknown,
  datos: unknown,
  objeto?: { titulo?: string | null; detalle?: string | null } | null,
): { clave: ClaveDatosRiesgo; valor: Obj } | null {
  const clave = claveDatosDeRamo(ramo)
  if (clave === 'datosVivienda') {
    const v = precargaViviendaDePoliza(datos)
    return Object.keys(v).length > 0 ? { clave, valor: v } : null
  }
  if (clave === 'datosRiesgoLibre') {
    const v = precargaLibreDePoliza(objeto, datos)
    return Object.keys(v).length > 0 ? { clave, valor: v } : null
  }
  return null
}

/** Lo que la pantalla necesita de un bloque: los datos, lo que falta y si lo que se ve viene de la póliza. */
export type BloqueDatos = {
  clave: ClaveDatosRiesgo
  datos: Obj
  /** Campos que faltan para pedir precio (vacío en los ramos sin tarifa). */
  faltan: string[]
  /** `true` = no hay nada guardado todavía y lo que se ve es la precarga de la póliza (no confirmada). */
  dePoliza: boolean
}

/**
 * Los datos del bloque de este ramo para la pantalla. Lo ESTRUCTURADO manda; sin él, la precarga de la póliza
 * (si la hay) se enseña como «de la póliza» y nunca cuenta como confirmada; sin ninguna, todo `null`.
 */
export function leerBloqueDeRamo(ramo: string, info: unknown, precarga?: Obj | null): BloqueDatos {
  const clave = claveDatosDeRamo(ramo)
  const i = esObj(info) ? info : {}
  if (clave === 'datosVehiculo') {
    const d = datosVehiculoDeInfoRiesgo(i)
    return { clave, datos: d as unknown as Obj, faltan: faltanDatosVehiculo(d), dePoliza: false }
  }
  if (clave === 'datosVivienda') {
    const propios = leerDatosVivienda(i.datosVivienda)
    const base = propios ?? aplicarEdicionVivienda(null, (precarga ?? {}) as never, { confirmar: false, ahora: '' }).datos
    return { clave, datos: base as unknown as Obj, faltan: faltanDatosVivienda(base), dePoliza: propios === null && precarga != null && Object.keys(precarga).length > 0 }
  }
  if (clave === 'datosCapital') {
    const d = leerDatosCapital(i.datosCapital) ?? { capital: null, duracionAnios: null, modalidadDeseada: null, confirmadoAt: null }
    return { clave, datos: d as unknown as Obj, faltan: faltanDatosCapital(d, ramo as 'vida' | 'salud' | 'decesos'), dePoliza: false }
  }
  const propios = leerDatosRiesgoLibre(i.datosRiesgoLibre)
  const base = propios ?? aplicarEdicionLibre(null, (precarga ?? {}) as never, { confirmar: false, ahora: '' }).datos
  return { clave, datos: base as unknown as Obj, faltan: [], dePoliza: propios === null && precarga != null && Object.keys(precarga).length > 0 }
}

export type CambioRiesgo = { campo: string; antes: string | number | boolean | null; despues: string | number | boolean | null }
export type ResultadoEdicionRiesgo =
  | {
      ok: true
      clave: ClaveDatosRiesgo
      datos: Obj
      faltan: string[]
      cambios: CambioRiesgo[]
      /** Hay algo que escribir (cambios o confirmación). Si no, la ruta devuelve lo mismo sin tocar la BD. */
      hayQueEscribir: boolean
      infoNueva: Obj
    }
  | { ok: false; status: 400 | 422; motivo: string; errores?: Array<{ campo: string; motivo: string }> }

/**
 * Edita y/o confirma el bloque `clave` de una oportunidad de tipo `ramo`.
 *  - la `clave` tiene que ser la del ramo (400 si no: una vivienda no se escribe en un coche);
 *  - se parte de lo estructurado y, sin ello, de la precarga de la póliza (para que editar un campo no haga
 *    desaparecer el resto de lo que se veía);
 *  - el vehículo, al CONFIRMAR, incluye la matrícula que se ve de la clave antigua (afirmar lo que se ve).
 */
export function calcularEdicionRiesgo(e: {
  ramo: string
  clave: ClaveDatosRiesgo
  info: unknown
  parcial: unknown
  confirmar: boolean
  ahora: string
  hoy?: string
  precarga?: Obj | null
}): ResultadoEdicionRiesgo {
  const esperada = claveDatosDeRamo(e.ramo)
  if (e.clave !== esperada) {
    return { ok: false, status: 400, motivo: `en ${e.ramo} los datos del riesgo van en «${esperada}», no en «${e.clave}»` }
  }
  const info = esObj(e.info) ? e.info : {}
  const op = { confirmar: e.confirmar, ahora: e.ahora }
  const ko = (errores: Array<{ campo: string; motivo: string }>): ResultadoEdicionRiesgo =>
    ({ ok: false, status: 422, motivo: errores.map((x) => x.motivo).join(' '), errores })
  const cierre = (datos: unknown, faltan: string[], cambios: CambioRiesgo[]): ResultadoEdicionRiesgo => ({
    ok: true, clave: e.clave, datos: datos as Obj, faltan, cambios,
    hayQueEscribir: cambios.length > 0 || e.confirmar,
    infoNueva: fusionarInfoRiesgoClave(info, e.clave, datos),
  })

  if (e.clave === 'datosVehiculo') {
    const val = validarDatosVehiculoRiesgo(e.parcial ?? {}, { hoy: e.hoy })
    if (!val.ok) return ko(val.errores)
    const actual = leerDatosVehiculo(info.datosVehiculo)
    const valor = { ...val.valor }
    if (e.confirmar && !actual?.matricula && valor.matricula === undefined) {
      const vista = datosVehiculoDeInfoRiesgo(info).matricula
      if (vista) valor.matricula = vista
    }
    const { datos, cambios } = aplicarEdicionVehiculo(actual, valor, op)
    const inc = incoherenciaFechasVehiculo(datos)
    if (inc) return ko([{ campo: 'fechaCompra', motivo: inc }])
    if (e.confirmar) {
      const no = motivoNoConfirmable(datos)
      if (no) return ko([{ campo: 'matricula', motivo: no }])
    }
    return cierre(datos, faltanDatosVehiculo(datos), cambios)
  }

  if (e.clave === 'datosVivienda') {
    const val = validarDatosViviendaRiesgo(e.parcial ?? {}, { hoy: e.hoy })
    if (!val.ok) return ko(val.errores)
    const actual = leerDatosVivienda(info.datosVivienda) ?? (e.precarga ? aplicarEdicionVivienda(null, e.precarga as never, op0()).datos : null)
    const { datos, cambios } = aplicarEdicionVivienda(actual, val.valor, op)
    const inc = incoherenciaVivienda(datos)
    if (inc) return ko([{ campo: 'anioUltimaReforma', motivo: inc }])
    if (e.confirmar) {
      const no = motivoNoConfirmableVivienda(datos)
      if (no) return ko([{ campo: 'referenciaCatastral', motivo: no }])
    }
    return cierre(datos, faltanDatosVivienda(datos), cambios)
  }

  if (e.clave === 'datosCapital') {
    const val = validarDatosCapitalRiesgo(e.parcial ?? {}, { hoy: e.hoy, ramo: e.ramo as 'vida' | 'salud' | 'decesos' })
    if (!val.ok) return ko(val.errores)
    const { datos, cambios } = aplicarEdicionCapital(leerDatosCapital(info.datosCapital), val.valor, op)
    if (e.confirmar) {
      const no = motivoNoConfirmableCapital(datos)
      if (no) return ko([{ campo: 'capital', motivo: no }])
    }
    return cierre(datos, faltanDatosCapital(datos, e.ramo as 'vida' | 'salud' | 'decesos'), cambios)
  }

  const val = validarDatosRiesgoLibre(e.parcial ?? {}, { hoy: e.hoy })
  if (!val.ok) return ko(val.errores)
  const actual = leerDatosRiesgoLibre(info.datosRiesgoLibre) ?? (e.precarga ? aplicarEdicionLibre(null, e.precarga as never, op0()).datos : null)
  const { datos, cambios } = aplicarEdicionLibre(actual, val.valor, op)
  if (e.confirmar) {
    const no = motivoNoConfirmableLibre(datos)
    if (no) return ko([{ campo: 'descripcion', motivo: no }])
  }
  return cierre(datos, [], cambios)
}

const op0 = () => ({ confirmar: false, ahora: '' })
