/**
 * La fecha que se le dice al usuario NO es la del vencimiento: es la última en
 * la que todavía puede oponerse a la prórroga (art. 22 LCS). Decirle «vence el
 * 15 de marzo» le deja creer que tiene hasta el 15; el plazo se le pasó el 13
 * de febrero.
 *
 * Se resta en DÍAS, no en meses: `setUTCMonth(m - 1)` sobre un 31 de marzo da
 * un 31 de febrero, que JavaScript normaliza al 3 de marzo sin avisar.
 */
import { esCarteraViva } from '@central/module-seguros'

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
 * 🚨 La regla que evita el desastre. Solo generan obligación las pólizas de la
 * CARTERA VIVA; las del volcado histórico se consultan y nada más.
 *
 * Qué es «viva» NO se decide aquí: es `esCarteraViva()` de
 * `@central/module-seguros` (`cartera-viva.ts`), y no basta con
 * `import_ref IS NULL`. Una fila del volcado que la ingesta de CIMA mantiene al
 * día conserva su `import_ref` viejo y se marca con `eiac_xml_hash`: es cartera
 * de hoy y su vencimiento SÍ hay que avisarlo. Medido el 03/09/2026 sobre la
 * cartera real; con la regla de un solo brazo se caía un cliente entero.
 *
 * `importRef: ''` sigue contando como volcado a propósito: la cadena vacía es el
 * valor de cajón que se cuela por `IS NULL`, `??` y `COALESCE`. Ante la duda, el
 * estado conservador es NO avisar.
 */
export function polizaGeneraObligacion(p: {
  importRef: string | null
  /** OBLIGATORIO a propósito: si fuera opcional, quien olvide pedirlo a la BD
   *  volvería a la regla vieja de un solo brazo sin que nada fallase. */
  eiacXmlHash: string | null
  fechaVencimiento: Date | null
}): boolean {
  if (!esCarteraViva(p)) return false
  return p.fechaVencimiento !== null
}

/**
 * 🚨 El segundo cepo, y el que faltaba — medido contra la cartera real el
 * 02/09/2026. `import_ref IS NULL` NO significa «viva y actual»: de las 109
 * pólizas que entran por CIMA,
 *
 *   · **42 están `cancelada`** (5 de ellas con vencimiento futuro), y
 *   · **18 están `activa` con el vencimiento ya pasado** — la más vieja, de
 *     **enero de 2013**.
 *
 * Sin este cepo el calendario del cliente diría «tienes hasta el 13/02/2015
 * para decidir si la renuevas» de una póliza muerta, y las 5 canceladas con
 * fecha futura llegarían a disparar un correo real. Las dos cosas son la misma
 * mentira: un dato viejo presentado como actual.
 *
 * `vigencia` la decide `vigenciaPoliza()` de `@central/module-seguros`, que ya
 * es de tres estados: `'pendiente'` («no se sabe», sin fecha) tampoco deriva —
 * pero NO se calla, se cuenta aparte para que la pantalla lo diga.
 */
export type VigenciaObligacion = 'vigente' | 'no_vigente' | 'pendiente'

export function obligacionDerivable(p: {
  importRef: string | null
  eiacXmlHash: string | null
  fechaVencimiento: Date | null
  vigencia: VigenciaObligacion
}): boolean {
  if (!polizaGeneraObligacion(p)) return false
  return p.vigencia === 'vigente'
}
