/**
 * La fecha que se le dice al usuario NO es la del vencimiento: es la última en
 * la que todavía puede oponerse a la prórroga (art. 22 LCS). Decirle «vence el
 * 15 de marzo» le deja creer que tiene hasta el 15; el plazo se le pasó el 13
 * de febrero.
 *
 * Se resta en DÍAS, no en meses: `setUTCMonth(m - 1)` sobre un 31 de marzo da
 * un 31 de febrero, que JavaScript normaliza al 3 de marzo sin avisar.
 */
export const DIAS_PREAVISO_TOMADOR = 30

const MS_DIA = 86_400_000

/** Medianoche UTC del día de `d`. Las columnas `date` ya llegan así; esto lo garantiza. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function fechaAccionable(fechaEvento: Date): Date {
  return new Date(diaUtc(fechaEvento).getTime() - DIAS_PREAVISO_TOMADOR * MS_DIA)
}

/**
 * Un ÚNICO disparo, a 7 días o menos de la fecha accionable. Una cadencia de
 * recordatorios («a 30, a 15, a 7…») es una decisión de producto que necesita
 * datos de apertura que hoy no existen; empezar con tres avisos y descubrir
 * después que sobraban dos ya ha quemado la bandeja del cliente.
 */
export const DIAS_VENTANA_AVISO = 7

export function entraEnVentana(x: { fechaAccionable: Date; hoy: Date }): boolean {
  const faltan = Math.round((diaUtc(x.fechaAccionable).getTime() - diaUtc(x.hoy).getTime()) / MS_DIA)
  return faltan >= 0 && faltan <= DIAS_VENTANA_AVISO
}

/**
 * 🚨 La regla que evita el desastre. Solo generan obligación las pólizas que
 * entran por CIMA (`import_ref IS NULL`). Las del volcado histórico se
 * consultan y nada más.
 *
 * `importRef: ''` cuenta como volcado a propósito: la cadena vacía es el valor
 * de cajón que se cuela por `IS NULL`, `??` y `COALESCE`. Ante la duda, el
 * estado conservador es NO avisar.
 */
export function polizaGeneraObligacion(p: {
  importRef: string | null
  fechaVencimiento: Date | null
}): boolean {
  if (p.importRef !== null) return false
  return p.fechaVencimiento !== null
}
