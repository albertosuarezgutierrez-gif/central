// SUPUESTOS de un precio de COCHE por bot (15/10/2026, decisión de Alberto). PURO: ni BD, ni red, ni Playwright.
//
// Los portales piden datos que nuestro formulario no recoge (compra nuevo/ya lo tenía, uso, fecha de efecto, tipo de garaje,
// segundo conductor, antecedentes). No se hacen obligatorios: la mayoría de clientes ya tiene seguro y se cambia por precio,
// así que el bot usa un valor «no determinante». Regla del repo: un dato no mirado no es «no» → cada valor SUPUESTO queda
// marcado (`supuesto: true` + motivo) y viaja junto al precio («Precio con supuestos: uso diario, garaje colectivo…»).
// La dirección NO se supone nunca: si el riesgo no la trae, sigue siendo un hueco del bot.
//
// Ningún valor ni motivo lleva datos personales (ni la dirección, ni el documento, ni la matrícula).
import type { FormularioAuto, TipoGaraje, UsoFrecuencia } from './formulario-auto.ts'

/** Un campo resuelto: el valor que usará el bot, si es SUPUESTO (no viene del riesgo) y por qué. `valor: null` = hueco. */
export type Supuesto<T> = {
  valor: T | null
  supuesto: boolean
  motivo: string
  /** Rótulo corto para «Precio con supuestos: …» (`null` = no se rotula: es dato o hueco). */
  etiqueta: string | null
}

/** `ya_lo_tenia` = «No, ya lo tenía y quiero cambiar de seguro»; `nuevo` = «Sí, lo he comprado nuevo». */
export type CompraVehiculo = 'nuevo' | 'ya_lo_tenia'
export type Antecedentes = {
  /** `otra_compania` = viene asegurado de otra compañía; `sin_seguro_anterior` = el riesgo dice 0 años asegurado. */
  procedencia: 'otra_compania' | 'sin_seguro_anterior'
  /** `null` = no consta (el bot no lo inventa: solo dice «procede de otra compañía»). */
  aniosAsegurado: number | null
  siniestrosUltimos5Anios: number
}

export type SupuestosAuto = {
  compra: Supuesto<CompraVehiculo>
  uso: Supuesto<UsoFrecuencia>
  /** ISO AAAA-MM-DD. */
  fechaEfecto: Supuesto<string>
  garaje: Supuesto<TipoGaraje>
  segundoConductor: Supuesto<boolean>
  antecedentes: Supuesto<Antecedentes>
  /** `consta` = el riesgo trae la dirección del tomador; `null` = hueco (no se inventa). Nunca supuesto. */
  direccion: Supuesto<'consta'>
}

/** Comienzo del aviso que viaja con la oferta (y que asegura deja pasar a plataforma). */
export const PREFIJO_SUPUESTOS = 'Precio con supuestos: '
/** Máximo del aviso de supuestos que cruza a plataforma. */
export const MAX_AVISO_SUPUESTOS = 500

const ISO = /^\d{4}-\d{2}-\d{2}$/
const esIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v

/** Fecha de HOY en España (AAAA-MM-DD): el worker corre en UTC y la fecha de efecto se teclea en un portal español. */
export function hoyEspana(hoy: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(hoy)
}

function diaSiguiente(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const fechaEsCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

type EntradaSupuestos = Pick<FormularioAuto, 'garajeNoche' | 'aniosAseguradoAnterior' | 'siniestrosUltimos5Anios'> &
  Partial<Pick<FormularioAuto, 'fechaMatriculacion' | 'usoFrecuencia' | 'fechaVencimiento' | 'tipoGaraje' | 'conductorOcasional' | 'companiaAnterior' | 'tomador'>>

/**
 * Formulario de coche → valor de cada dato que el portal pide y el formulario puede no traer, con su marca de supuesto. PURA.
 *   · compra (revisión del 15/10/2026): con póliza actual (vencimiento) → ya lo tenía (dato); matriculado hace más de 12 meses →
 *     ya lo tenía (supuesto); en los últimos 12 meses y sin póliza → nuevo (supuesto); sin fecha ni póliza → ya lo tenía (supuesto).
 *   · uso: el del formulario; si no, «diario» (supuesto).
 *   · fecha de efecto: el vencimiento de la póliza actual si es FUTURO; si no, mañana (supuesto).
 *   · garaje: duerme en la calle → calle; el tipo del formulario; si no, «colectivo» (supuesto).
 *   · segundo conductor: el del formulario; si no, «no» (supuesto).
 *   · antecedentes: años/siniestros/compañía anterior del formulario; lo que falte, «procede de otra compañía, sin siniestros» (supuesto).
 *   · dirección: la del riesgo o hueco (nunca se supone).
 */
export function supuestosAuto(f: EntradaSupuestos, hoy: Date = new Date()): SupuestosAuto {
  const hoyIso = hoyEspana(hoy)

  // Compra. La 2ª mano no se supone nunca (ningún dato del formulario la dice).
  const fm = esIso(f.fechaMatriculacion) && f.fechaMatriculacion <= hoyIso ? f.fechaMatriculacion : null
  const haceUnAnio = `${Number(hoyIso.slice(0, 4)) - 1}${hoyIso.slice(4)}`
  const YA_LO_TENIA = 'ya lo tenía (cambio de seguro)'
  const compra: Supuesto<CompraVehiculo> = esIso(f.fechaVencimiento)
    ? { valor: 'ya_lo_tenia', supuesto: false, motivo: 'tiene póliza actual', etiqueta: null }
    : fm === null
      ? { valor: 'ya_lo_tenia', supuesto: true, motivo: 'sin fecha de primera matriculación ni póliza actual', etiqueta: YA_LO_TENIA }
      : fm < haceUnAnio
        ? { valor: 'ya_lo_tenia', supuesto: true, motivo: 'matriculado hace más de 12 meses', etiqueta: YA_LO_TENIA }
        : { valor: 'nuevo', supuesto: true, motivo: 'matriculado en los últimos 12 meses y sin póliza actual', etiqueta: 'vehículo nuevo' }

  // Uso.
  const uso: Supuesto<UsoFrecuencia> = f.usoFrecuencia
    ? { valor: f.usoFrecuencia, supuesto: false, motivo: 'del formulario', etiqueta: null }
    : { valor: 'diario', supuesto: true, motivo: 'el formulario no trae el uso', etiqueta: 'uso diario' }

  // Fecha de efecto.
  const venc = esIso(f.fechaVencimiento) ? f.fechaVencimiento : null
  const manana = diaSiguiente(hoyIso)
  const fechaEfecto: Supuesto<string> =
    venc !== null && venc > hoyIso
      ? { valor: venc, supuesto: false, motivo: 'vencimiento de la póliza actual', etiqueta: null }
      : { valor: manana, supuesto: true, motivo: venc === null ? 'sin vencimiento de la póliza actual' : 'el vencimiento de la póliza actual ya pasó', etiqueta: `efecto ${fechaEsCorta(manana)}` }

  // Garaje.
  const tipo = f.tipoGaraje ?? null
  const casaConNoche = tipo !== null && (f.garajeNoche === null || f.garajeNoche === (tipo !== 'calle'))
  const garaje: Supuesto<TipoGaraje> =
    f.garajeNoche === false
      ? { valor: 'calle', supuesto: false, motivo: 'duerme en la calle', etiqueta: null }
      : casaConNoche
        ? { valor: tipo, supuesto: false, motivo: 'del formulario', etiqueta: null }
        : {
            valor: 'colectivo',
            supuesto: true,
            motivo: tipo !== null ? 'el tipo de garaje se contradice con dónde duerme' : f.garajeNoche === true ? 'duerme en garaje; colectivo o individual no consta' : 'no consta dónde duerme',
            etiqueta: 'garaje colectivo',
          }

  // Segundo conductor.
  const oc = f.conductorOcasional
  const segundoConductor: Supuesto<boolean> =
    typeof oc === 'boolean'
      ? { valor: oc, supuesto: false, motivo: 'del formulario', etiqueta: null }
      : { valor: false, supuesto: true, motivo: 'sin preguntar por otro conductor', etiqueta: 'sin 2º conductor' }

  // Antecedentes.
  const anios = f.aniosAseguradoAnterior
  const sin = f.siniestrosUltimos5Anios
  const compania = typeof f.companiaAnterior === 'string' && f.companiaAnterior.trim() !== '' ? f.companiaAnterior : null
  let antecedentes: Supuesto<Antecedentes>
  if (anios === null && sin === null && compania === null) {
    antecedentes = { valor: { procedencia: 'otra_compania', aniosAsegurado: null, siniestrosUltimos5Anios: 0 }, supuesto: true, motivo: 'el formulario no trae aseguradora anterior, años ni siniestros', etiqueta: 'procede de otra compañía, sin siniestros' }
  } else {
    const procedencia = anios === 0 && compania === null ? 'sin_seguro_anterior' : 'otra_compania'
    const faltan = [anios === null && procedencia === 'otra_compania' ? 'los años asegurado' : null, sin === null ? 'los siniestros' : null].filter((x): x is string => x !== null)
    antecedentes = {
      valor: { procedencia, aniosAsegurado: anios, siniestrosUltimos5Anios: sin ?? 0 },
      supuesto: faltan.length > 0,
      motivo: faltan.length > 0 ? `el formulario no trae ${faltan.join(' ni ')}` : 'del formulario',
      etiqueta: faltan.length === 0 ? null : faltan.length === 2 ? 'procede de otra compañía, sin siniestros' : sin === null ? 'sin siniestros en los últimos 5 años' : 'procede de otra compañía',
    }
  }

  // Dirección: nunca supuesta.
  const dir = typeof f.tomador?.direccion === 'string' && f.tomador.direccion.trim() !== ''
  const direccion: Supuesto<'consta'> = dir ? { valor: 'consta', supuesto: false, motivo: 'del riesgo', etiqueta: null } : { valor: null, supuesto: false, motivo: 'el riesgo no trae la dirección', etiqueta: null }

  return { compra, uso, fechaEfecto, garaje, segundoConductor, antecedentes, direccion }
}

/** Etiquetas cortas de lo SUPUESTO (en el orden de la pantalla del precio). Lo que es dato no sale. PURA. */
export function etiquetasSupuestos(s: SupuestosAuto): string[] {
  return [s.compra, s.uso, s.fechaEfecto, s.garaje, s.segundoConductor, s.antecedentes]
    .filter((x) => x.supuesto && x.valor !== null && x.etiqueta)
    .map((x) => x.etiqueta as string)
}

/** «Precio con supuestos: uso diario, garaje colectivo, sin 2º conductor.» o `null` si no hay ninguno. PURA. */
export function textoSupuestos(etiquetas: readonly string[]): string | null {
  const l = etiquetas.map((e) => e.replace(/\s+/g, ' ').trim()).filter((e) => e !== '')
  return l.length ? `${PREFIJO_SUPUESTOS}${l.join(', ')}.`.slice(0, MAX_AVISO_SUPUESTOS) : null
}

/** El aviso de supuestos de una oferta (`avisos[]` del worker), o `null`. Lectura defensiva para asegura. PURA. */
export function supuestosDeAvisos(avisos: unknown): string | null {
  if (!Array.isArray(avisos)) return null
  const a = avisos.find((x): x is string => typeof x === 'string' && x.startsWith(PREFIJO_SUPUESTOS))
  return a ? a.slice(0, MAX_AVISO_SUPUESTOS) : null
}
