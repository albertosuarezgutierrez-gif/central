/**
 * Los datos del VEHÍCULO de un riesgo de auto/moto (30/09/2026), guardados estructurados en
 * `seguros.oportunidades.info_riesgo.datosVehiculo` para poder verlos, editarlos y CONFIRMARLOS
 * en la pantalla del riesgo sin salir de ella.
 *
 * Hasta hoy `info_riesgo` solo traía `matricula` y `vehiculo` (TEXTO: «SEAT Ibiza 1.0», datos viejos
 * del volcado) o marca+modelo sueltos. Esa clave `vehiculo` NO se pisa: se lee como fallback y
 * `datosVehiculo` es la clave nueva. Nombres alineados con `DatosAuto`/`DatosMoto` de asegura
 * (`codigoVehiculo`, `matricula`, `fechaMatriculacion`, `fechaCompra`, `kmAnuales`, `garaje`,
 * `cpCirculacion`, `municipioCirculacionId`, `remolqueLigero`).
 *
 * 🚨 `null` = «no se sabe», nunca `''` ni `0`. Un campo sin dato se pinta «sin dato», y para pedir
 * precio se cuenta como que FALTA (`faltanDatosVehiculo`).
 *
 * Solo TS puro (sin `node:*`): lo puede importar la pantalla y el puerto.
 */
import { normalizarMatricula } from './matricula.ts'
import { KM_ANUALES_MAXIMO, kilometrosDesdeTexto } from './supuestos-auto.ts'

/** Ramos donde el riesgo ES un vehículo y esta ficha tiene sentido. */
export function admiteDatosVehiculo(ramo: unknown): ramo is 'auto' | 'moto' {
  return ramo === 'auto' || ramo === 'moto'
}

export type DatosVehiculoRiesgo = {
  /** Normalizada: mayúsculas, sin espacios ni guiones. */
  matricula: string | null
  marca: string | null
  modelo: string | null
  /** Texto de la versión («1.0 TSI 95cv»). Distinto de `codigoVehiculo`, que es el id del catálogo. */
  version: string | null
  /** Código Base7 de la VERSIÓN en el catálogo de Codeoscopic. Sin él no se puede pedir precio. */
  codigoVehiculo: string | null
  /** Ids del catálogo (marca → modelo → motor) para volver a poblar el selector de la pantalla de precio. */
  marcaId: string | null
  modeloId: string | null
  motorId: string | null
  /** aaaa-mm-dd */
  fechaMatriculacion: string | null
  /** aaaa-mm-dd; null = sigue a la matriculación (no es «se compró el mismo día»). */
  fechaCompra: string | null
  kmAnuales: number | null
  /** Id del catálogo de garajes de Codeoscopic. */
  garaje: string | null
  cpCirculacion: string | null
  municipioCirculacion: string | null
  municipioCirculacionId: number | null
  remolqueLigero: boolean | null
  /** Instante (ISO) en que la corredora dijo «estos datos están bien». Cualquier edición posterior lo borra. */
  confirmadoAt: string | null
}

export type CampoVehiculo = Exclude<keyof DatosVehiculoRiesgo, 'confirmadoAt'>

/** Campos que se pueden escribir (todos menos el sello, que solo lo pone `confirmar`). */
export const CAMPOS_VEHICULO: readonly CampoVehiculo[] = [
  'matricula', 'marca', 'modelo', 'version', 'codigoVehiculo', 'marcaId', 'modeloId', 'motorId',
  'fechaMatriculacion', 'fechaCompra', 'kmAnuales', 'garaje', 'cpCirculacion', 'municipioCirculacion',
  'municipioCirculacionId', 'remolqueLigero',
]

export const ETIQUETA_CAMPO_VEHICULO: Record<CampoVehiculo, string> = {
  matricula: 'Matrícula',
  marca: 'Marca',
  modelo: 'Modelo',
  version: 'Versión',
  codigoVehiculo: 'Versión del catálogo',
  marcaId: 'Marca (catálogo)',
  modeloId: 'Modelo (catálogo)',
  motorId: 'Motor (catálogo)',
  fechaMatriculacion: 'Fecha de matriculación',
  fechaCompra: 'Fecha de compra',
  kmAnuales: 'Kilómetros al año',
  garaje: 'Garaje',
  cpCirculacion: 'Código postal de circulación',
  municipioCirculacion: 'Municipio de circulación',
  municipioCirculacionId: 'Municipio de circulación (catálogo)',
  remolqueLigero: 'Remolque ligero',
}

export function datosVehiculoVacios(): DatosVehiculoRiesgo {
  return {
    matricula: null, marca: null, modelo: null, version: null, codigoVehiculo: null, marcaId: null, modeloId: null,
    motorId: null, fechaMatriculacion: null, fechaCompra: null, kmAnuales: null, garaje: null, cpCirculacion: null,
    municipioCirculacion: null, municipioCirculacionId: null, remolqueLigero: null, confirmadoAt: null,
  }
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_CP = /^\d{5}$/
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const FECHA_MINIMA = '1900-01-01'

/** «Hoy» en Madrid (aaaa-mm-dd). */
export function hoyMadridVehiculo(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
  return p
}

function fechaReal(f: string): boolean {
  if (!RE_FECHA.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

export type ErrorVehiculo = { campo: CampoVehiculo; motivo: string }
export type ValidacionVehiculo =
  | { ok: true; valor: Partial<Omit<DatosVehiculoRiesgo, 'confirmadoAt'>> }
  | { ok: false; errores: ErrorVehiculo[] }

/** Texto libre con tope. Vacío o solo espacios = null (no se sabe). */
function texto(v: unknown, max: number): string | null | 'invalido' {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'invalido'
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '') return null
  return t.length > max ? 'invalido' : t
}

/**
 * Valida lo que llega para EDITAR: un objeto PARCIAL. Solo se devuelven las claves que vinieron:
 * una clave ausente = «no se toca»; una clave con `null`/`''` = «borrar este dato» (queda en null).
 * `confirmadoAt` no se acepta aquí: lo pone `aplicarEdicionVehiculo` con `confirmar`.
 *
 * - Matrícula normalizada (mayúsculas, sin espacios ni guiones), 4-10 caracteres alfanuméricos.
 * - Fechas aaaa-mm-dd reales, NO futuras (una matriculación o una compra futura es un error de teclado);
 *   la compra no es anterior a la matriculación (el vendor no lo comprueba y tarificaría el disparate).
 * - Km entero positivo (acepta «15.000»), CP de 5 cifras, municipio id entero positivo.
 */
export function validarDatosVehiculoRiesgo(parcial: unknown, opciones: { hoy?: string } = {}): ValidacionVehiculo {
  if (typeof parcial !== 'object' || parcial === null || Array.isArray(parcial)) {
    return { ok: false, errores: [{ campo: 'matricula', motivo: 'Los datos del vehículo tienen que ser un objeto.' }] }
  }
  const hoy = opciones.hoy ?? hoyMadridVehiculo()
  const e = parcial as Record<string, unknown>
  const valor: Record<string, unknown> = {}
  const errores: ErrorVehiculo[] = []
  const mal = (campo: CampoVehiculo, motivo: string) => errores.push({ campo, motivo })
  const tiene = (k: CampoVehiculo) => Object.prototype.hasOwnProperty.call(e, k)

  if (tiene('matricula')) {
    const t = texto(e.matricula, 20)
    if (t === 'invalido') mal('matricula', 'La matrícula no es válida.')
    else if (t === null) valor.matricula = null
    else {
      const m = normalizarMatricula(t)
      // Aceptamos series raras (históricas, extranjeras) pero no basura: 4-10 y con al menos una cifra.
      if (!/^[A-Z0-9]{4,10}$/.test(m) || !/\d/.test(m)) mal('matricula', 'La matrícula no tiene un formato válido (4 a 10 letras y cifras, con alguna cifra).')
      else valor.matricula = m
    }
  }
  for (const [k, max] of [['marca', 60], ['modelo', 80], ['version', 120], ['municipioCirculacion', 80]] as const) {
    if (!tiene(k)) continue
    const t = texto(e[k], max)
    if (t === 'invalido') mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: texto no válido o demasiado largo.`)
    else valor[k] = t
  }
  for (const k of ['codigoVehiculo', 'marcaId', 'modeloId', 'motorId', 'garaje'] as const) {
    if (!tiene(k)) continue
    const t = texto(e[k], 40)
    if (t === 'invalido' || (t !== null && /[\s"'<>]/.test(t))) mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: identificador no válido.`)
    else valor[k] = t
  }
  for (const k of ['fechaMatriculacion', 'fechaCompra'] as const) {
    if (!tiene(k)) continue
    const t = texto(e[k], 10)
    if (t === 'invalido') mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: fecha no válida.`)
    else if (t === null) valor[k] = null
    else if (!fechaReal(t)) mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: usa el formato aaaa-mm-dd con una fecha que exista.`)
    else if (t < FECHA_MINIMA) mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: anterior a 1900.`)
    else if (t > hoy) mal(k, `${ETIQUETA_CAMPO_VEHICULO[k]}: no puede ser futura.`)
    else valor[k] = t
  }
  if (tiene('kmAnuales')) {
    const v = e.kmAnuales
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) valor.kmAnuales = null
    else {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? kilometrosDesdeTexto(v) : null
      if (n === null || !Number.isInteger(n) || n <= 0 || n > KM_ANUALES_MAXIMO) mal('kmAnuales', 'Kilómetros al año: un número entero positivo (por ejemplo 12.000).')
      else valor.kmAnuales = n
    }
  }
  if (tiene('cpCirculacion')) {
    const t = texto(e.cpCirculacion, 10)
    if (t === 'invalido' || (t !== null && !RE_CP.test(t))) mal('cpCirculacion', 'Código postal: 5 cifras.')
    else valor.cpCirculacion = t
  }
  if (tiene('municipioCirculacionId')) {
    const v = e.municipioCirculacionId
    if (v === null || v === undefined || v === '') valor.municipioCirculacionId = null
    else {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN
      if (!Number.isInteger(n) || n <= 0) mal('municipioCirculacionId', 'Municipio de circulación: identificador no válido.')
      else valor.municipioCirculacionId = n
    }
  }
  if (tiene('remolqueLigero')) {
    const v = e.remolqueLigero
    if (v === null || v === undefined) valor.remolqueLigero = null
    else if (typeof v === 'boolean') valor.remolqueLigero = v
    else mal('remolqueLigero', 'Remolque ligero: sí o no.')
  }

  // Coherencia entre fechas, con lo que venga en esta edición (la comparación con lo ya guardado la hace `aplicarEdicionVehiculo`).
  const fm = valor.fechaMatriculacion, fc = valor.fechaCompra
  if (typeof fm === 'string' && typeof fc === 'string' && fc < fm) mal('fechaCompra', 'La fecha de compra no puede ser anterior a la de matriculación.')

  return errores.length > 0 ? { ok: false, errores } : { ok: true, valor: valor as Partial<Omit<DatosVehiculoRiesgo, 'confirmadoAt'>> }
}

/**
 * Lo que FALTA para poder pedir precio (lo que `DatosAuto`/`DatosMoto` exige del vehículo y que el
 * riesgo aún no sabe). `null` (no hay ficha) se trata como «falta todo»: nunca como «nada falta».
 *
 * No cuentan CP ni municipio de circulación: por defecto son los del tomador (su ficha), y la
 * pantalla de precio los resuelve. `codigoVehiculo` es la versión del catálogo: marca y modelo sin
 * ella no bastan para tarificar.
 */
export function faltanDatosVehiculo(datos: Partial<DatosVehiculoRiesgo> | null | undefined): CampoVehiculo[] {
  const d = datos ?? {}
  const f: CampoVehiculo[] = []
  if (!d.matricula) f.push('matricula')
  if (!d.codigoVehiculo) f.push('codigoVehiculo')
  if (!d.fechaMatriculacion) f.push('fechaMatriculacion')
  if (d.kmAnuales === null || d.kmAnuales === undefined) f.push('kmAnuales')
  if (!d.garaje) f.push('garaje')
  return f
}

/** «Falta para pedir precio: matrícula, versión del catálogo…» o `null` si no falta nada. */
export function textoFaltanVehiculo(faltan: readonly CampoVehiculo[] | null | undefined): string | null {
  if (faltan === null || faltan === undefined) return null
  if (faltan.length === 0) return null
  return `Falta para pedir precio: ${faltan.map((c) => ETIQUETA_CAMPO_VEHICULO[c].toLowerCase()).join(', ')}.`
}

/**
 * Lee `info_riesgo.datosVehiculo` tal como está en la BD, sin fiarse: un campo con otro tipo es
 * «no se sabe» (null), no un valor inventado.
 */
export function leerDatosVehiculo(bruto: unknown): DatosVehiculoRiesgo | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null
  const o = bruto as Record<string, unknown>
  const s = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() !== '' ? (o[k] as string).trim() : null)
  const n = (k: string) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : null)
  const iso = s('confirmadoAt')
  return {
    matricula: s('matricula'), marca: s('marca'), modelo: s('modelo'), version: s('version'), codigoVehiculo: s('codigoVehiculo'),
    marcaId: s('marcaId'), modeloId: s('modeloId'), motorId: s('motorId'), fechaMatriculacion: s('fechaMatriculacion'),
    fechaCompra: s('fechaCompra'), kmAnuales: n('kmAnuales'), garaje: s('garaje'), cpCirculacion: s('cpCirculacion'),
    municipioCirculacion: s('municipioCirculacion'), municipioCirculacionId: n('municipioCirculacionId'),
    remolqueLigero: typeof o.remolqueLigero === 'boolean' ? o.remolqueLigero : null,
    confirmadoAt: iso !== null && RE_ISO.test(iso) ? iso : null,
  }
}

/**
 * Los datos del vehículo de un riesgo con FALLBACK de lectura: si `datosVehiculo` no existe, lo que
 * haya en las claves antiguas (`matricula`, `vehiculo` texto, `marca`, `modelo`). El fallback NO se
 * escribe de vuelta y nunca cuenta como confirmado.
 *
 * `vehiculo` (texto libre) solo alimenta `marca`/`modelo` si no hay marca+modelo sueltos: es un
 * texto, no se trocea a ojo — se enseña entero como `marca` para que la corredora lo corrija.
 */
export function datosVehiculoDeInfoRiesgo(info: unknown): DatosVehiculoRiesgo {
  const o = typeof info === 'object' && info !== null && !Array.isArray(info) ? (info as Record<string, unknown>) : {}
  const propios = leerDatosVehiculo(o.datosVehiculo)
  const t = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() !== '' ? (o[k] as string).trim() : null)
  const base = propios ?? datosVehiculoVacios()
  const matAntigua = t('matricula')
  const marcaAntigua = t('marca')
  const modeloAntiguo = t('modelo')
  const textoViejo = t('vehiculo')
  return {
    ...base,
    matricula: base.matricula ?? (matAntigua ? normalizarMatricula(matAntigua) : null),
    marca: base.marca ?? marcaAntigua ?? (modeloAntiguo ? null : textoViejo),
    modelo: base.modelo ?? modeloAntiguo,
  }
}

export type CambioVehiculo = { campo: CampoVehiculo; antes: string | number | boolean | null; despues: string | number | boolean | null }

/**
 * Aplica una edición ya validada sobre lo que hay y decide el sello de confirmación:
 *  - hay cambios y NO se confirma → `confirmadoAt` se BORRA (lo confirmado dejó de serlo);
 *  - se confirma → `confirmadoAt = ahora` (con o sin cambios);
 *  - sin cambios y sin confirmar → todo igual, sello incluido.
 * Devuelve también QUÉ cambió (para `oportunidad_historial`). Compara con lo guardado, no con lo mandado.
 */
export function aplicarEdicionVehiculo(
  actual: DatosVehiculoRiesgo | null,
  valor: Partial<Omit<DatosVehiculoRiesgo, 'confirmadoAt'>>,
  opciones: { confirmar: boolean; ahora: string },
): { datos: DatosVehiculoRiesgo; cambios: CambioVehiculo[] } {
  const previo = actual ?? datosVehiculoVacios()
  const datos: DatosVehiculoRiesgo = { ...previo }
  const cambios: CambioVehiculo[] = []
  const trae = (k: CampoVehiculo) => Object.prototype.hasOwnProperty.call(valor, k)
  // El código de versión, los ids del catálogo y los textos marca/modelo/versión describen EL MISMO vehículo:
  //  - cambia el código sin ids nuevos → los ids y los textos de catálogo viejos ya no son de esta versión;
  //  - se teclea a mano marca/modelo/versión (con otro texto) sin código nuevo → el código y los ids viejos
  //    apuntan a otro coche. Mejor «sin versión elegida» que un precio de un coche que ya no es.
  const IDS_Y_TEXTOS: readonly CampoVehiculo[] = ['marcaId', 'modeloId', 'motorId', 'marca', 'modelo', 'version']
  const cambiaCodigo = trae('codigoVehiculo') && (valor.codigoVehiculo ?? null) !== previo.codigoVehiculo
  const aBorrar = new Set<CampoVehiculo>()
  if (cambiaCodigo) {
    for (const k of IDS_Y_TEXTOS) if (!trae(k)) aBorrar.add(k)
  } else if (!trae('codigoVehiculo') && !trae('marcaId') && !trae('modeloId') && !trae('motorId')) {
    const aMano = (['marca', 'modelo', 'version'] as const).some((k) => trae(k) && (valor[k] ?? null) !== previo[k])
    if (aMano) for (const k of ['codigoVehiculo', 'marcaId', 'modeloId', 'motorId'] as const) aBorrar.add(k)
  }
  for (const k of CAMPOS_VEHICULO) {
    if (aBorrar.has(k)) {
      if (previo[k] !== null) {
        cambios.push({ campo: k, antes: previo[k], despues: null })
        ;(datos as Record<string, unknown>)[k] = null
      }
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(valor, k)) continue
    const nuevo = (valor[k] ?? null) as DatosVehiculoRiesgo[CampoVehiculo]
    if (nuevo === previo[k]) continue
    cambios.push({ campo: k, antes: previo[k], despues: nuevo })
    ;(datos as Record<string, unknown>)[k] = nuevo
  }
  if (opciones.confirmar) datos.confirmadoAt = opciones.ahora
  else if (cambios.length > 0) datos.confirmadoAt = null
  return { datos, cambios }
}

/**
 * Lo que `info_riesgo` queda tras guardar `datosVehiculo`: la clave nueva se pone (o se sustituye) y
 * TODAS las demás se conservan tal cual, incluida la `vehiculo` de texto (datos viejos que no se
 * pisan). Devuelve un objeto nuevo; no muta la entrada.
 */
export function fusionarInfoRiesgo(info: unknown, datosVehiculo: DatosVehiculoRiesgo): Record<string, unknown> {
  const base = typeof info === 'object' && info !== null && !Array.isArray(info) ? (info as Record<string, unknown>) : {}
  return { ...base, datosVehiculo }
}

/**
 * ¿Se puede confirmar? Sin matrícula no hay nada que confirmar: un «confirmado» sobre un riesgo
 * vacío sería un sello que afirma lo que no se ha mirado.
 */
export function motivoNoConfirmable(datos: DatosVehiculoRiesgo): string | null {
  return datos.matricula ? null : 'No se puede confirmar un vehículo sin matrícula.'
}

/** La compra no es anterior a la matriculación, contando lo ya guardado (la validación solo ve lo que llega). */
export function incoherenciaFechasVehiculo(datos: DatosVehiculoRiesgo): string | null {
  if (datos.fechaCompra && datos.fechaMatriculacion && datos.fechaCompra < datos.fechaMatriculacion) {
    return 'La fecha de compra no puede ser anterior a la de matriculación.'
  }
  return null
}

/**
 * Lo que una cotización con `?oportunidad=` deja anotado en el riesgo (write-back). Lee el cuerpo de
 * `auto-nuevo`/`moto-nuevo`: `resueltos` (versión, matrícula, fecha de matriculación, garaje),
 * `correcciones` (km, fecha de compra, remolque) y `resueltos.vehiculoRiesgo` (marca/modelo/versión
 * y sus ids de catálogo, que la pantalla manda para no perderlos).
 *
 * SOLO devuelve claves con valor: un dato que la cotización no trae NUNCA borra el que ya estaba
 * guardado. Un campo que no valida se descarta (mejor no anotarlo que anotarlo mal); el resto sí.
 * El garaje y los km solo constan si la pantalla los da por DECLARADOS (`vehiculoRiesgo.garaje` /
 * `.kmAnuales`): el garaje por defecto y los 10.000 km del supuesto no son un dato del cliente.
 */
export function datosVehiculoDeCotizacion(cuerpo: unknown, opciones: { hoy?: string } = {}): Partial<Omit<DatosVehiculoRiesgo, 'confirmadoAt'>> {
  const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const c = obj(cuerpo)
  const res = obj(c.resueltos)
  const cor = obj(c.correcciones)
  const extra = obj(res.vehiculoRiesgo)
  const candidato: Record<string, unknown> = {
    matricula: res.matricula,
    codigoVehiculo: res.codigoVehiculo,
    fechaMatriculacion: res.fechaMatriculacion,
    fechaCompra: cor.fechaCompra,
    remolqueLigero: cor.remolqueLigero === true ? true : undefined,
    kmAnuales: extra.kmAnuales,
    garaje: extra.garaje,
    marca: extra.marca,
    modelo: extra.modelo,
    version: extra.version,
    marcaId: extra.marcaId,
    modeloId: extra.modeloId,
    motorId: extra.motorId,
  }
  for (const k of Object.keys(candidato)) {
    const v = candidato[k]
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) delete candidato[k]
  }
  for (let i = 0; i < CAMPOS_VEHICULO.length; i++) {
    const v = validarDatosVehiculoRiesgo(candidato, opciones)
    if (v.ok) return v.valor
    for (const e of v.errores) delete candidato[e.campo]
  }
  return {}
}
