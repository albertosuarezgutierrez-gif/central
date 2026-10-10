/**
 * Una sola fuente de verdad para lo que se DICE del vencimiento de una póliza. PURO.
 *
 * Antes cada pieza (cabecera, tabla de pólizas, tarjeta, ficha de póliza) decidía por su cuenta y
 * una misma póliza decía a la vez «venció el 05/06», «avisar antes del 06/05», «vencimiento
 * desconocido» y «renueva otro año». Aquí hay UN estado:
 *
 *  - sin fecha utilizable (o centinela)  → `desconocido`: solo «Vencimiento desconocido».
 *  - fecha anterior a hoy                → `vencido`:     solo «Venció el dd/mm/aaaa». Nunca fecha de aviso.
 *  - hoy o después, aviso aún posible     → `en_plazo`:    «Vence …» + «avisar antes del …».
 *  - hoy o después, aviso ya pasado       → `aviso_pasado`: «Vence …» + «aviso pasado: renueva otro año».
 *
 * La fecha de aviso (un mes antes, LCS art. 22) solo aparece si es de hoy o futura, o con la
 * etiqueta explícita de aviso pasado.
 */
import { diaIsoPintable, fechaPintable } from './fecha-pintable.ts'

export type EstadoAlertaVencimiento = 'desconocido' | 'vencido' | 'en_plazo' | 'aviso_pasado'

export type AlertaVencimiento = {
  estado: EstadoAlertaVencimiento
  /** `YYYY-MM-DD` si hay fecha utilizable. */
  vencimiento: string | null
  /** Solo en `en_plazo` y `aviso_pasado`. */
  limiteAviso: string | null
  diasParaAvisar: number | null
  /** Rótulo principal: «Venció el 05/06/2026» · «Vence 05/06/2027» · «Vencimiento desconocido». */
  titular: string
  /** Segunda línea (aviso). `null` = no hay nada más que decir. */
  nota: string | null
}

const MS_DIA = 86_400_000

/** Hoy de Madrid en `YYYY-MM-DD`. */
export function hoyMadrid(hoy: Date = new Date()): string {
  return hoy.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/** El mismo día del mes anterior; si no existe (31/03 → febrero), el último de ese mes. */
function mesAntes(iso: string): string {
  const a = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1, d = Number(iso.slice(8, 10))
  const año = m === 0 ? a - 1 : a
  const mes = (m + 11) % 12
  const ultimo = new Date(Date.UTC(año, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(año, mes, Math.min(d, ultimo))).toISOString().slice(0, 10)
}

function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA)
}

export function alertaVencimiento(vencimiento: string | null | undefined, hoy: Date | string = new Date()): AlertaVencimiento {
  const dia = diaIsoPintable(vencimiento)
  if (dia === null) {
    return { estado: 'desconocido', vencimiento: null, limiteAviso: null, diasParaAvisar: null, titular: 'Vencimiento desconocido', nota: null }
  }
  const h = typeof hoy === 'string' ? hoy.slice(0, 10) : hoyMadrid(hoy)
  const fecha = fechaPintable(dia) as string
  if (dia < h) {
    return { estado: 'vencido', vencimiento: dia, limiteAviso: null, diasParaAvisar: null, titular: `Venció el ${fecha}`, nota: null }
  }
  const limite = mesAntes(dia)
  const d = dias(h, limite)
  const enPlazo = d >= 0
  return {
    estado: enPlazo ? 'en_plazo' : 'aviso_pasado',
    vencimiento: dia,
    limiteAviso: limite,
    diasParaAvisar: d,
    titular: `Vence ${fecha}`,
    nota: enPlazo ? `para no renovar, avisar antes del ${fechaPintable(limite)}` : 'aviso pasado: renueva otro año',
  }
}
