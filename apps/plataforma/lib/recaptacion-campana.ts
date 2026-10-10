// apps/plataforma/lib/recaptacion-campana.ts
//
// Aviso de FIN DE CAMPAÑA del correo de recaptación (30/09/2026). Alberto quiere
// saber cuándo se ha escrito ya a todos los leads solo-correo para ponerse a
// analizar aperturas. PURO: lo usa el cron `recaptacion-email-lote`, que le
// pasa lo que dice la bitácora de avisos.
//
// Cuándo toca: la pasada que VACÍA la cola de PRIMEROS envíos
// (`pendientesPrimerEnvio === 0` y esta pasada mandó algún primer correo). No
// vale `enviados > 0`: incluye los SEGUIMIENTOS (tras el cooldown se vuelve a
// escribir a los ya contactados), y con la cola vacía el aviso saldría casi a
// diario. Y como cada día pueden entrar en ventana leads nuevos (cada uno vacía
// la cola otra vez), además no se repite si ya salió en los últimos
// `DIAS_SIN_REPETIR_FIN` días, según la bitácora `telegram_avisos_log`.
//
// 🚨 `null` ≠ 0 en todos los campos: `pendientesPrimerEnvio`/`primerosEnviados`
// a `null` es «no se sabe», así que NO se avisa; una bitácora que no se pudo
// leer tampoco autoriza a avisar (sería avisar a ciegas: lo que evita el
// dedupe); y unas aperturas que no se pudieron leer se dicen así, nunca «0 %».
import type { LoteEmailOk } from './recaptacion-asegura.ts'

/**
 * Id PROPIO del aviso (catalogado en `lib/telegram/catalogo.ts`). El cron lo
 * escribe LITERAL en `tgAviso(…)` (el guardián del catálogo lee el fuente) y
 * usa esta constante para buscarlo en la bitácora; `recaptacion-campana.test.ts`
 * vigila que los dos coincidan, porque si divergen el dedupe no encuentra nada
 * y el aviso vuelve a salir cada vez que la cola se vacía.
 */
export const AVISO_FIN_CAMPANA = 'correduria.recaptacion-fin'

/** Ventana en la que, si el aviso ya salió, no se repite. */
export const DIAS_SIN_REPETIR_FIN = 60

export type EntradaCampana = Pick<
  LoteEmailOk,
  | 'enviados' | 'primerosEnviados' | 'fallidos' | 'pendientesPrimerEnvio'
  | 'emailEnviadosTotal' | 'emailAbiertosTotal' | 'enEsperaVentanaSoloCorreo'
>

/** Punto de millar también en 4 cifras (regla de la casa): 1234 → «1.234». */
function miles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** «28,6 %» — un decimal como mucho, coma decimal. */
function porcentaje(parte: number, total: number): string {
  const p = Math.round((parte / total) * 1000) / 10
  return `${String(p).replace('.', ',')} %`
}

const APERTURAS_ILEGIBLES = 'Aperturas: no se han podido leer.'

/**
 * Aperturas ACUMULADAS de la campaña. Los totales de asegura se leen ANTES de
 * enviar, así que el denominador es `emailEnviadosTotal + enviados` (los de hoy
 * cuentan como enviados aunque aún no hayan tenido tiempo de abrirse).
 */
export function lineaAperturas(r: EntradaCampana): string {
  const { emailEnviadosTotal: previos, emailAbiertosTotal: abiertos, enviados } = r
  if (previos === null || abiertos === null) return APERTURAS_ILEGIBLES
  const total = previos + enviados
  // Un total a 0 o más aperturas que envíos no son una cifra: son un dato roto.
  if (total <= 0 || abiertos > total) return APERTURAS_ILEGIBLES
  return `Aperturas acumuladas: ${miles(abiertos)} de ${miles(total)} (${porcentaje(abiertos, total)}).`
}

function lineaEspera(enEspera: number | null): string | null {
  if (enEspera === null) return 'No se ha podido leer cuántas personas solo-correo esperan todavía su ventana.'
  if (enEspera === 0) return null
  if (enEspera === 1) {
    return 'Queda 1 persona solo-correo esperando su ventana (se le escribe ~45 días antes de su antiguo vencimiento), así que el lote seguirá mandando alguno.'
  }
  return `Quedan ${miles(enEspera)} personas solo-correo esperando su ventana (se les escribe ~45 días antes de su antiguo vencimiento), así que el lote seguirá mandando alguno.`
}

function lineaFallidos(fallidos: number): string | null {
  if (!(fallidos > 0)) return null
  if (fallidos === 1) return '1 dirección falla siempre (revísala en la ficha).'
  return `${miles(fallidos)} direcciones fallan siempre (revísalas en la ficha).`
}

/**
 * ¿Ha vaciado ESTA pasada la cola de primeros envíos? El cron solo mira la
 * bitácora si esto es `true` (si no, no hay nada que deduplicar).
 */
export function vaciaLaColaDePrimeros(r: EntradaCampana): boolean {
  return r.pendientesPrimerEnvio === 0 && r.primerosEnviados !== null && r.primerosEnviados > 0
}

export type DecisionFinCampana =
  | { estado: 'avisar'; texto: string }
  /** Esta pasada no vacía la cola (o no se sabe si la vacía). */
  | { estado: 'no_toca' }
  /** Tocaba, pero ya salió en los últimos `DIAS_SIN_REPETIR_FIN` días. */
  | { estado: 'ya_avisado' }
  /** Tocaba, pero la bitácora no se pudo leer: no se avisa a ciegas. */
  | { estado: 'bitacora_ilegible' }

/**
 * @param yaAvisadoDesde ¿salió `AVISO_FIN_CAMPANA` en los últimos
 *   `DIAS_SIN_REPETIR_FIN` días? `null` = la bitácora no se pudo leer.
 */
export function decidirAvisoFinCampana(r: EntradaCampana, yaAvisadoDesde: boolean | null): DecisionFinCampana {
  if (!vaciaLaColaDePrimeros(r)) return { estado: 'no_toca' }
  if (yaAvisadoDesde === null) return { estado: 'bitacora_ilegible' }
  if (yaAvisadoDesde) return { estado: 'ya_avisado' }
  return { estado: 'avisar', texto: textoFinCampana(r) }
}

/** Texto del aviso (sin decidir si toca: eso es `decidirAvisoFinCampana`). */
export function textoFinCampana(r: EntradaCampana): string {
  return [
    '📧 *Recaptación por email: ya se ha escrito a todos los leads solo-correo que hoy están en ventana.*',
    lineaAperturas(r),
    lineaEspera(r.enEsperaVentanaSoloCorreo),
    lineaFallidos(r.fallidos),
  ].filter((l): l is string => l !== null).join('\n')
}
