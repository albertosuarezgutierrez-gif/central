// Tope de gasto de Codeoscopic / Avant2 en EUROS por mes natural. Lógica PURA (sin BD, sin red).
//
// ─── Decisión de Alberto (29/09/2026) ────────────────────────────────────────
//   - Cada llamada que cuesta (cotizar, ReRate, recomendación de capital, Submit) cuenta 0,50 €
//     mientras el coste de las tres últimas no esté confirmado por Codeoscopic.
//   - Al cruzar 60 € en el mes → aviso por Telegram, una sola vez.
//   - Al llegar a 70 € → BLOQUEO de toda llamada que cueste, hasta que Alberto pulse en Telegram
//     «Ampliar +30 €». Repetible: cada autorización suma 30 € más a ESE mes.
//
// Hasta ese día el guardián contaba CONSULTAS (200/mes) y bloqueaba en silencio. Los topes por
// consulta siguen (el diario es el freno de un bucle desbocado); el mensual de verdad es este.
//
// 🚨 Tres estados, no dos (regla de la casa): `null` = «no se ha podido leer el gasto» y NO es
// 0 €. Sin el gasto no hay tope, y sin tope no se llama al vendor (fail-closed).

/** Lo que cuenta cada llamada cuyo coste no ha confirmado Codeoscopic. */
export const COSTE_SIN_CONFIRMAR_CENTS = 50
/** Al cruzar esta cifra, aviso por Telegram (una vez por mes). */
export const AVISO_CENTS = 6000
/** Tope base del mes: al llegar aquí se bloquea hasta que Alberto amplíe. */
export const TOPE_BASE_CENTS = 7000
/** Lo que suma cada pulsación del botón de Telegram. */
export const AMPLIACION_CENTS = 3000

/** El gasto del mes tal como se ha podido leer. `null` = no se sabe (nunca 0). */
export type GastoMes = {
  /** Suma de las líneas `reservado` + `facturable` del mes natural (Madrid), en céntimos. */
  gastadoCents: number | null
  /** Suma de las ampliaciones autorizadas este mes, en céntimos. */
  ampliadoCents: number | null
}

export type DecisionTope =
  | {
      permitido: true
      gastadoCents: number
      topeCents: number
      /** `true` si ESTA llamada deja el mes en 60 € o más: hay que (intentar) anotar el aviso. */
      cruzaAviso: boolean
    }
  | { permitido: false; motivo: 'desconocido'; explicacion: string }
  | { permitido: false; motivo: 'bloqueado'; gastadoCents: number; topeCents: number; explicacion: string }

/** Tope vigente del mes: el base más lo que Alberto haya autorizado. */
export function topeDelMes(ampliadoCents: number): number {
  return TOPE_BASE_CENTS + Math.max(0, ampliadoCents)
}

/**
 * ¿Se puede hacer UNA llamada más que cuesta `costeCents`?
 *
 * Se permite si, sumándola, el mes no pasa del tope: con 69,50 € gastados entra la que deja el
 * mes en 70,00 € justos, y la siguiente se bloquea. Así el gasto nunca supera el tope autorizado.
 */
export function decidirTopeEuros(g: GastoMes, costeCents: number): DecisionTope {
  if (
    g.gastadoCents === null ||
    g.ampliadoCents === null ||
    !Number.isFinite(g.gastadoCents) ||
    !Number.isFinite(g.ampliadoCents)
  ) {
    return {
      permitido: false,
      motivo: 'desconocido',
      explicacion:
        'No se llama a la compañía: no se ha podido leer lo gastado este mes en Avant2, y sin esa ' +
        'cifra el tope en euros no existe. No es «0 € gastados»: es «no se sabe».',
    }
  }
  const coste = Math.max(0, costeCents)
  const tope = topeDelMes(g.ampliadoCents)
  const despues = g.gastadoCents + coste
  if (despues > tope) {
    return {
      permitido: false,
      motivo: 'bloqueado',
      gastadoCents: g.gastadoCents,
      topeCents: tope,
      explicacion:
        `Tope de gasto de Avant2 alcanzado: ${eur(g.gastadoCents)} de ${eur(tope)} este mes. ` +
        `No se llama a la compañía hasta que Alberto amplíe +${eur(AMPLIACION_CENTS)} con el botón ` +
        'de Telegram (el aviso llega en unos minutos).',
    }
  }
  return {
    permitido: true,
    gastadoCents: g.gastadoCents,
    topeCents: tope,
    cruzaAviso: despues >= AVISO_CENTS,
  }
}

/** Mes natural en Madrid como `AAAA-MM`. Es la clave del botón y de los eventos. */
export function mesClave(d: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' })
    .formatToParts(d)
  const y = partes.find((p) => p.type === 'year')?.value
  const m = partes.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

// ─── El botón de Telegram ───────────────────────────────────────────────────
// `cas_tope:<AAAAMM>-<nivelCents>`. El nivel es el tope que se alcanzó al bloquear: así el botón
// es IDEMPOTENTE (pulsarlo dos veces, o un reenvío del webhook, no suma 60 €) y uno viejo no
// amplía otro mes ni otro nivel.

export const PREFIJO_BOTON_TOPE = 'cas_tope'

export function callbackAmpliar(mes: string, nivelCents: number): string {
  return `${PREFIJO_BOTON_TOPE}:${mes.replace('-', '')}-${nivelCents}`
}

/** Lee el argumento del botón (lo que va detrás de `cas_tope:`). `null` si no tiene forma. */
export function leerArgAmpliar(arg: string): { mes: string; nivelCents: number } | null {
  const m = /^(\d{4})(\d{2})-(\d{1,7})$/.exec(arg.trim())
  if (!m) return null
  const mes = Number(m[2])
  const nivel = Number(m[3])
  if (mes < 1 || mes > 12 || !Number.isInteger(nivel) || nivel < TOPE_BASE_CENTS) return null
  return { mes: `${m[1]}-${m[2]}`, nivelCents: nivel }
}

/**
 * ¿Vale esta ampliación? Pura: el llamante le pasa lo que hay en BD.
 * Solo se amplía el mes EN CURSO y desde un nivel en el que de verdad se bloqueó.
 */
export function validarAmpliacion(
  pedida: { mes: string; nivelCents: number },
  ctx: { mesActual: string; bloqueoEnEseNivel: boolean },
): { ok: true } | { ok: false; motivo: string } {
  if (pedida.mes !== ctx.mesActual) {
    return { ok: false, motivo: `El botón es de ${pedida.mes} y ese mes ya no es el actual: no se amplía nada.` }
  }
  if (!ctx.bloqueoEnEseNivel) {
    return { ok: false, motivo: `No consta un bloqueo a ${eur(pedida.nivelCents)} este mes: no se amplía nada.` }
  }
  return { ok: true }
}

// ─── Textos de Telegram (HTML de `tgSend`; aquí no entra nada de fuera) ──────

export function textoAviso(gastadoCents: number, mes: string): string {
  return (
    `💶 <b>Avant2: ${eur(gastadoCents)} gastados en ${mes}</b>\n` +
    `Has cruzado los ${eur(AVISO_CENTS)}. A ${eur(TOPE_BASE_CENTS)} se bloquean las tarificaciones ` +
    'hasta que lo autorices (cada tarificación, ReRate, límites de hogar o envío cuenta 0,50 €).'
  )
}

export function textoBloqueo(gastadoCents: number, topeCents: number, mes: string): string {
  return (
    `🛑 <b>Avant2 BLOQUEADO: ${eur(gastadoCents)} de ${eur(topeCents)} en ${mes}</b>\n` +
    'No sale ninguna tarificación, ReRate, recomendación de capital ni envío hasta que lo autorices.\n' +
    `El botón amplía +${eur(AMPLIACION_CENTS)} solo este mes (nuevo tope ${eur(topeCents + AMPLIACION_CENTS)}).`
  )
}

/** Formato español de la casa: `2.162,49€`. */
export function eur(cents: number): string {
  return (
    (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) +
    '€'
  )
}
