// Regla de la RENOVACIÓN (Alberto, 05/11/2026), aplicada ANTES de pagar:
//
// Fecha de efecto de la renovación (coordinador, 05/11/2026, con datos de BD): si `fecha_efecto_actual` > hoy
// (la compañía YA emitió la anualidad nueva y aún no empezó) → efecto = fecha_efecto_actual; si no → el
// vencimiento. La ventana de 90 días se mide sobre ESA fecha. «Sospechoso» = duración efecto→vencimiento
// > 400 días, vencimiento no posterior al efecto, o fecha ausente (NO se usa «año distinto»).
//
//   «En una RENOVACIÓN solo se cotiza en Avant2 cuando el vencimiento de la póliza está confirmado
//    y dentro de la ventana de 90 días; la fecha de efecto = el vencimiento exacto; y se emite con
//    esa misma fecha.»
//
// Por qué: cada `POST /insurances` cuesta 0,50 € y no es idempotente, y emitir con otra fecha de efecto
// que la cotizada obliga a re-tarificar (ReRate) y a pagar otra vez. PURO (`hoy` inyectado): el
// guardián lo ve fallar sin reloj real. La fecha de efecto que SÍ puede forzar el operador queda
// registrada (`forzada`), nunca silenciosa.

import { RE_FECHA_ISO, MAX_DIAS_VISTA, sumarDias } from './fecha-efecto.ts'

/** Duración efecto→vencimiento por encima de la cual la fecha es «sospechosa» (anual + margen; medido: ninguna póliza viva pasa de 400). */
export const MAX_DIAS_EFECTO_A_VENCIMIENTO = 400

export type CausaCorteRenovacion =
  | 'sin_vencimiento'
  | 'vencimiento_pasado'
  | 'fuera_de_ventana'
  | 'vencimiento_sospechoso'

export type EvaluacionRenovacion =
  | { ok: true; fechaEfecto: string; forzada: false }
  /** El operador pidió OTRA fecha (o saltó un corte) a propósito: se permite y se registra. */
  | { ok: true; fechaEfecto: string; forzada: true; saltaCorte: CausaCorteRenovacion | null; aviso: string }
  | { ok: false; causa: CausaCorteRenovacion; motivo: string }

/** `f` (aaaa-mm-dd) más `n` meses en UTC, sin desbordar el día (31/01 + 1 mes = 28/29-02). */
export function sumarMeses(f: string, n: number): string {
  const d = new Date(`${f}T00:00:00Z`)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return d.toISOString().slice(0, 10)
}

function iso(v: unknown): string | null {
  return typeof v === 'string' && RE_FECHA_ISO.test(v.trim()) ? v.trim() : null
}

/** Días entre dos fechas ISO (b - a). */
function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * La fecha de efecto de la renovación: `fecha_efecto_actual` si es futura (anualidad nueva ya emitida),
 * si no el vencimiento. `null` = no consta ninguna.
 */
export function fechaBaseRenovacion(
  vencimiento: string | null | undefined,
  efectoActual: string | null | undefined,
  hoy: string,
): string | null {
  const e = iso(efectoActual)
  if (e !== null && e > hoy) return e
  return iso(vencimiento)
}

/** El corte (si lo hay) de la renovación, sin tener en cuenta lo que fuerce el operador. */
export function corteDeVencimiento(
  vencimiento: string | null | undefined,
  efectoActual: string | null | undefined,
  hoy: string,
): { causa: CausaCorteRenovacion; motivo: string } | null {
  const v = iso(vencimiento)
  const e = iso(efectoActual)
  const base = fechaBaseRenovacion(vencimiento, efectoActual, hoy)
  if (base === null) {
    return {
      causa: 'sin_vencimiento',
      motivo:
        'la póliza no tiene fecha de vencimiento ni de efecto de la nueva anualidad confirmadas: una renovación solo se cotiza con la fecha exacta ' +
        '(es la fecha de efecto), y cotizar sin ella obliga a re-tarificar y pagar otra vez al emitir',
    }
  }
  if (base < hoy) {
    return {
      causa: 'vencimiento_pasado',
      motivo: `el vencimiento (${base}) ya pasó (hoy es ${hoy}): la compañía no emite con efecto pasado y habría que confirmar la fecha real de la póliza`,
    }
  }
  const tope = sumarDias(hoy, MAX_DIAS_VISTA)
  if (base > tope) {
    return {
      causa: 'fuera_de_ventana',
      motivo: `la fecha de efecto de la renovación (${base}) está a más de ${MAX_DIAS_VISTA} días vista (la ventana abre el ${sumarDias(base, -MAX_DIAS_VISTA)}): todavía no se cotiza`,
    }
  }
  // Sospechoso: la duración efecto→vencimiento no es la de una póliza anual.
  if (e !== null) {
    if (v === null) {
      return { causa: 'vencimiento_sospechoso', motivo: `consta el efecto ${e} pero no el vencimiento: hay que revisar las fechas de la póliza` }
    }
    if (v <= e) {
      return { causa: 'vencimiento_sospechoso', motivo: `el vencimiento (${v}) no es posterior al efecto (${e}): hay que revisar las fechas` }
    }
    if (dias(e, v) > MAX_DIAS_EFECTO_A_VENCIMIENTO) {
      return {
        causa: 'vencimiento_sospechoso',
        motivo: `entre el efecto (${e}) y el vencimiento (${v}) hay más de ${MAX_DIAS_EFECTO_A_VENCIMIENTO} días: una póliza anual no es así, hay que revisar si las fechas están actualizadas`,
      }
    }
  }
  return null
}

/**
 * La decisión entera de una RENOVACIÓN: la fecha de efecto con la que se cotiza, o el corte GRATIS.
 * `explicita` = la fecha de efecto que el operador puso a mano (correcciones): manda, y queda registrada.
 * Las reglas duras del vendor (no pasada, ≤90 días) las sigue vigilando `motivoFechaEfectoInvalida`.
 */
export function evaluarEfectoRenovacion(entrada: {
  vencimiento: string | null | undefined
  /** `fecha_efecto_actual` de la póliza (CIMA). */
  efectoActual?: string | null
  hoy: string
  explicita?: unknown
}): EvaluacionRenovacion {
  const corte = corteDeVencimiento(entrada.vencimiento, entrada.efectoActual, entrada.hoy)
  const base = fechaBaseRenovacion(entrada.vencimiento, entrada.efectoActual, entrada.hoy)
  const explicitaTxt = typeof entrada.explicita === 'string' ? entrada.explicita.trim() : ''
  if (explicitaTxt !== '') {
    if (corte === null && explicitaTxt === base) return { ok: true, fechaEfecto: explicitaTxt, forzada: false }
    return {
      ok: true,
      fechaEfecto: explicitaTxt,
      forzada: true,
      saltaCorte: corte?.causa ?? null,
      aviso:
        `fecha de efecto forzada por el operador (${explicitaTxt}) en una renovación` +
        (base ? ` con fecha de renovación ${base}` : ' sin fecha de renovación confirmada') +
        (corte ? ` — se salta el corte «${corte.causa}»` : ''),
    }
  }
  if (corte !== null) return { ok: false, causa: corte.causa, motivo: corte.motivo }
  return { ok: true, fechaEfecto: base as string, forzada: false }
}
