// La cuenta del widget «Tu ventana para decidir» de las páginas de ramo.
// Pura y sin fecha implícita, como `calculadora-vencimientos.ts`.
//
// Pinta los DOS plazos del art. 22 de la Ley de Contrato de Seguro, que no son
// simétricos y por eso dejan un hueco que casi nadie ve:
//   · la compañía tiene que comunicar cualquier cambio (también de precio) con
//     al menos DOS MESES de antelación al vencimiento;
//   · el tomador puede oponerse a la prórroga hasta UN MES antes.
// Entre los dos queda la «ventana»: el mes en que se decide con el precio
// nuevo delante. Solo se citan los plazos; qué pasa si la compañía NO avisa a
// tiempo no se afirma en ningún sitio (no está confirmado).
//
// El mes del tomador reusa `DIAS_PREAVISO` (30 días en UTC), la misma cuenta
// que la calculadora y el portal. Los dos meses de la compañía, 60 días.

import { DIAS_PREAVISO, parsearFecha } from './calculadora-vencimientos.ts'

export const DIAS_AVISO_COMPANIA = 60
/** El tramo que pinta la barra: de vencimiento − 90 días a vencimiento. */
export const DIAS_TRAMO = 90
const MS_DIA = 86_400_000

/**
 * Ramos donde NO se pinta: vida y salud tienen reglas de renovación propias y
 * el esquema de los dos plazos no se da por aplicable sin revisarlo.
 */
export const RAMOS_SIN_VENTANA: readonly string[] = ['vida-y-salud']

export function ramoTieneVentana(slug: string): boolean {
  return !RAMOS_SIN_VENTANA.includes(slug)
}

export type Fase = 'antes' | 'ventana' | 'tarde'

export type Ventana = {
  /** El vencimiento que cuenta: el escrito o, si ya pasó, su siguiente aniversario. */
  vence: Date
  /** `true` si la fecha escrita ya había pasado y se ha llevado al año siguiente. */
  avanzada: boolean
  /** Último día para que la compañía comunique cambios (vence − 60). */
  avisoCompania: Date
  /** Último día para oponerse a la prórroga (vence − 30). */
  limite: Date
  fase: Fase
  /** Días de hoy al inicio de la ventana (solo en fase `antes`). */
  diasHastaVentana: number
  /** Días de hoy al límite (negativo = pasado). */
  diasHastaLimite: number
  /** Posición de «hoy» en la barra, 0-100, o `null` si cae antes del tramo. */
  posHoy: number | null
}

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function restarDias(d: Date, n: number): Date {
  return new Date(d.getTime() - n * MS_DIA)
}

/** Mismo día y mes en otro año; un 29 de febrero cae al 28 si el año no es bisiesto. */
function enAnio(d: Date, anio: number): Date {
  const mes = d.getUTCMonth()
  const x = new Date(Date.UTC(anio, mes, d.getUTCDate()))
  return x.getUTCMonth() === mes ? x : new Date(Date.UTC(anio, mes + 1, 0))
}

/**
 * `vence` en `AAAA-MM-DD`. Si la fecha ya pasó se usa su próximo aniversario:
 * la gente copia la fecha de la póliza, que suele ser la del primer año, y la
 * póliza se prorroga sola cada año en el mismo día.
 */
export function calcularVentana(vence: string, hoy: Date): Ventana | null {
  const escrita = parsearFecha(vence)
  if (!escrita) return null
  const h = diaUtc(hoy)
  let v = escrita
  for (let anio = h.getUTCFullYear(); v.getTime() < h.getTime(); anio++) v = enAnio(escrita, anio)

  const avisoCompania = restarDias(v, DIAS_AVISO_COMPANIA)
  const limite = restarDias(v, DIAS_PREAVISO)
  const dias = (d: Date) => Math.round((d.getTime() - h.getTime()) / MS_DIA)
  const diasHastaLimite = dias(limite)
  const diasHastaVentana = dias(avisoCompania)
  const fase: Fase = diasHastaLimite < 0 ? 'tarde' : diasHastaVentana > 0 ? 'antes' : 'ventana'
  const desdeInicio = DIAS_TRAMO - dias(v)
  const posHoy = desdeInicio < 0 ? null : Math.min(100, (desdeInicio / DIAS_TRAMO) * 100)

  return {
    vence: v,
    avanzada: v.getTime() !== escrita.getTime(),
    avisoCompania,
    limite,
    fase,
    diasHastaVentana: Math.max(0, diasHastaVentana),
    diasHastaLimite,
    posHoy,
  }
}

/** Posiciones fijas de los hitos en la barra (tramo de 90 días). */
export const POS = {
  avisoCompania: ((DIAS_TRAMO - DIAS_AVISO_COMPANIA) / DIAS_TRAMO) * 100,
  limite: ((DIAS_TRAMO - DIAS_PREAVISO) / DIAS_TRAMO) * 100,
} as const
