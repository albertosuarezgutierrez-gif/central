// packages/module-seguros/src/seguimiento-devolucion.ts
//
// Qué hacer con un recibo DEVUELTO, día a día. PURO.
//
// Un devuelto es una venta en peligro, no solo un cobro: el cliente puede tener la cuenta mal (se
// arregla con el IBAN bueno), haber vendido el coche, haberse ido a otra compañía o encontrarlo caro
// (se le pasa presupuesto). Por eso el primer paso es LLAMAR y preguntar, y luego se escala con el
// reloj del art. 15 LCS, que corre desde el EFECTO del recibo (el día en que vence la prima):
//
//   día 0   llamar: ¿cuenta, venta, compañía o precio?
//   día 7   segunda llamada si sigue sin cobrarse
//   día 25  último aviso: en 5 días la cobertura queda en suspenso
//   día 30  sin cobertura: si paga, vuelve a estar cubierto en 24 h
//   día 180 extinguida: ya no hay póliza que rescatar, es una póliza nueva
//
// Sin fecha de efecto NO se calcula ningún hito más allá del primero: no se sabe desde cuándo corre.

import { DIAS_EXTINCION, DIAS_SUSPENSION } from './retencion.ts'
import type { TipoMotivoDevolucion } from './devolucion-correo.ts'

export const ORIGEN_DEVOLUCION = 'recibo_devuelto'

/**
 * Marca de las tareas que abre este seguimiento. Al pasar de hito se cierran SOLO las que la llevan:
 * una tarea escrita a mano que diga «devuelto» es de Alberto y no se toca.
 */
export const PREFIJO_TAREA_DEVOLUCION = '🧾 '

export const HITOS_DEVOLUCION = ['inicial', 'segunda_llamada', 'ultimo_aviso', 'sin_cobertura'] as const
export type HitoDevolucion = (typeof HITOS_DEVOLUCION)[number]

const DIA_HITO: Record<HitoDevolucion, number> = { inicial: 0, segunda_llamada: 7, ultimo_aviso: 25, sin_cobertura: DIAS_SUSPENSION }

function dias(desde: string, hoy: Date): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)))
  const b = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.floor((b - a) / 86_400_000)
}

function masDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Día desde el que la cobertura queda en suspenso. `null` = sin fecha de efecto. */
export function suspensionDesde(fechaEfecto: string | null): string | null {
  return fechaEfecto ? masDias(fechaEfecto, DIAS_SUSPENSION) : null
}

/**
 * El hito que TOCA hoy (el más avanzado alcanzado). `null` = extinguida: ya no se persigue el cobro.
 * Sin fecha de efecto solo existe el inicial.
 */
export function hitoDevolucion(fechaEfecto: string | null, hoy: Date): HitoDevolucion | null {
  if (!fechaEfecto) return 'inicial'
  const d = dias(fechaEfecto, hoy)
  if (d >= DIAS_EXTINCION) return null
  let hito: HitoDevolucion = 'inicial'
  for (const h of HITOS_DEVOLUCION) if (d >= DIA_HITO[h]) hito = h
  return hito
}

export type EntradaTareaDevolucion = {
  hito: HitoDevolucion
  ramo: string | null
  compania: string | null
  importe: number | null
  fechaEfecto: string | null
  tipoMotivo: TipoMotivoDevolucion | null
  motivo: string | null
}

const eur = (n: number): string => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`

/** Texto de la tarea para Alberto (no se le manda al cliente). */
export function textoTareaDevolucion(e: EntradaTareaDevolucion): string {
  return PREFIJO_TAREA_DEVOLUCION + cuerpoTarea(e)
}

function cuerpoTarea(e: EntradaTareaDevolucion): string {
  const seguro = [e.ramo ? e.ramo.replace(/_/g, ' ') : 'seguro', e.compania].filter(Boolean).join(' de ')
  const importe = e.importe !== null ? ` de ${eur(e.importe)}` : ''
  const efecto = e.fechaEfecto ? ` (efecto ${fechaEs(e.fechaEfecto)})` : ''
  const suspende = suspensionDesde(e.fechaEfecto)
  const plazo = suspende ? ` La cobertura queda en suspenso el ${fechaEs(suspende)} si no se paga.` : ' Sin fecha de efecto: mira el plazo en el portal de la compañía.'
  const porque =
    e.tipoMotivo === 'cuenta'
      ? ` Motivo del banco «${e.motivo}»: apunta a la CUENTA o al titular. Confirmar IBAN y titular de la domiciliación y pasar el bueno a la compañía.`
      : e.tipoMotivo === 'cliente_rechaza'
        ? ` Motivo «${e.motivo}»: lo devolvió el propio cliente. ¿Se va, ha vendido, otra compañía o es precio? Si es precio → presupuesto.`
        : e.tipoMotivo === 'fondos'
          ? ` Motivo «${e.motivo}»: sin fondos. Acordar cómo pagarlo.`
          : ` Preguntar: ¿cuenta mal, ha vendido, se ha ido a otra compañía o es precio? Si es precio → presupuesto.`
  switch (e.hito) {
    case 'inicial':
      return `Recibo DEVUELTO${importe} del ${seguro}${efecto}.${porque}${plazo}`
    case 'segunda_llamada':
      return `Segunda llamada: el recibo devuelto${importe} del ${seguro}${efecto} sigue sin cobrarse.${porque}${plazo}`
    case 'ultimo_aviso':
      return `ÚLTIMO AVISO: recibo devuelto${importe} del ${seguro}${efecto}.${plazo}${e.ramo === 'auto' || e.ramo === 'moto' ? ' Sin seguro obligatorio no puede circular.' : ''}`
    case 'sin_cobertura':
      return `SIN COBERTURA: el recibo devuelto${importe} del ${seguro}${efecto} no se ha pagado y la cobertura está en suspenso. Si paga, vuelve a estar cubierto a las 24 h.`
  }
}
