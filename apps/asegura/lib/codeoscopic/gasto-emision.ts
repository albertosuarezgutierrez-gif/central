// El gasto de las DOS llamadas al vendor que NO pasan por `cotizar()`.
// Lógica PURA (sin BD, sin red), como `contador.ts`.
//
// ─── Por qué existe este fichero ─────────────────────────────────────────────
// `cotizar.ts` es el embudo de `POST /insurances` (0,50€ confirmados): config →
// ámbito → libro → tope → reserva ANTES de llamar → un solo intento → cierre.
// Pero hay otras dos llamadas al vendor que NO pasan por ahí y que hasta hoy no
// escribían NI UNA línea en `seguros.codeoscopic_consumo`:
//
//   - **ReRate**  `POST /insurances/{id}/offers`            (`/api/operador/codeoscopic/oferta`)
//   - **Submit**  `POST /insurances/{id}/policy-applications` (`/api/operador/codeoscopic/emitir`)
//
// [Seguro, medido 21/09/2026] `puedeCotizar()` no las veía, así que el tope
// diario/mensual no las contaba. [Probable] que facturen: el portal del
// fabricante **no documenta el coste de ninguna de las dos**, y la única razón
// para tratarlas como facturables es que el CRM de Manuel trata el ReRate como
// facturable y `noRetry` (`docs/CODEOSCOPIC-API-PORTAL.md:314`). Hasta que
// Codeoscopic lo confirme por escrito (borrador en
// `docs/BORRADOR-CODEOSCOPIC-COSTE-RERATE-SUBMIT.md`), lo conservador es
// CONTARLAS.
//
// ─── Las tres decisiones que lo hacen reversible ─────────────────────────────
//  1. **El coste va en una env y arranca en 0.** Si resultan ser gratis, hoy no
//     estamos inflando ningún euro; si resultan costar, se pone la cifra y el
//     libro empieza a sumarla sin tocar código. Y **0 aquí NO significa
//     «gratis»**: significa «no confirmado» — por eso `describirCoste()` lo dice
//     con palabras en vez de pintar un `0,00€` que se leería como «no cuesta».
//  2. **Los contadores van SEPARADOS de los de cotizar** (`consumo.ts` filtra
//     por `motivo`). Si se mezclaran, agotar el tope de cotizar apagaría la
//     emisión —y al revés— sin que nadie supiera por qué; y la cifra de
//     «cotizaciones que quedan hoy» que pinta la pantalla del corredor pasaría a
//     contar cosas que no son cotizaciones.
//  3. **Un tope por operación**, para que un bucle de reparación que se
//     desboque tenga freno propio.

import {
  entero,
  resolverTopes,
  TOPE_DIARIO_MAXIMO,
  TOPE_MENSUAL_MAXIMO,
  type Topes,
} from './config.ts'
import { consumidasHoy, consumidasMes, eurCents, type Consumo, type Veredicto } from './contador.ts'

/** Las operaciones. El valor ES el `motivo` que se escribe en el libro. */
export const MOTIVO_RERATE = 'rerate'
export const MOTIVO_SUBMIT = 'submit'
/**
 * `POST /home/recommend-limits` (23/09/2026): capitales recomendados de hogar.
 * No es de emisión, pero comparte el problema: [Probable] tarifica por dentro
 * con cada compañía (devuelve un capital POR PRODUCTO) y el portal no dice si
 * cuesta. Mismo embudo, contador propio.
 */
export const MOTIVO_LIMITES = 'limites_hogar'
export const MOTIVOS_EMISION = [MOTIVO_RERATE, MOTIVO_SUBMIT, MOTIVO_LIMITES] as const
export type OperacionEmision = (typeof MOTIVOS_EMISION)[number]

/** Cómo se llama cada una en un mensaje para el corredor. */
export const ETIQUETA_EMISION: Record<OperacionEmision, string> = {
  rerate: 'confirmaciones de precio (ReRate)',
  submit: 'envíos de emisión (Submit)',
  limites_hogar: 'recomendaciones de capital de hogar',
}

export const ENV_COSTE_CENTS: Record<OperacionEmision, string> = {
  rerate: 'CODEOSCOPIC_COSTE_RERATE_CENTS',
  submit: 'CODEOSCOPIC_COSTE_SUBMIT_CENTS',
  limites_hogar: 'CODEOSCOPIC_COSTE_LIMITES_CENTS',
}

export const ENV_TOPE_DIARIO: Record<OperacionEmision, string> = {
  rerate: 'CODEOSCOPIC_TOPE_RERATE_DIARIO',
  submit: 'CODEOSCOPIC_TOPE_SUBMIT_DIARIO',
  limites_hogar: 'CODEOSCOPIC_TOPE_LIMITES_DIARIO',
}

export const ENV_TOPE_MENSUAL: Record<OperacionEmision, string> = {
  rerate: 'CODEOSCOPIC_TOPE_RERATE_MENSUAL',
  submit: 'CODEOSCOPIC_TOPE_SUBMIT_MENSUAL',
  limites_hogar: 'CODEOSCOPIC_TOPE_LIMITES_MENSUAL',
}

/**
 * 🚨 **CERO por defecto, y a propósito.** No está confirmado que estas dos
 * llamadas facturen, así que el libro cuenta la LÍNEA (que es lo que arreglaba
 * el agujero) y no le pone precio. El día que Codeoscopic conteste, se pone la
 * cifra en la env y nada más cambia.
 */
export const COSTE_EMISION_CENTS_DEFECTO = 0

/** Techo contra el dedo gordo: un `5000` donde iba `50` serían 50,00€ por ReRate. */
export const COSTE_EMISION_CENTS_MAXIMO = 500

/**
 * Los topes de emisión salen de los de cotizar multiplicados por esto, y la
 * razón no es estética: **la cascada de reparación puede hacer hasta DOS
 * llamadas al vendor por cada acción del corredor** (un 400 se traduce, se
 * repara desde la ficha por PATCH y se repite UNA vez — ver `oferta/route.ts` y
 * `emitir/route.ts`), y cada ReRate/Submit va detrás de una cotización que ya
 * está topada. Con el factor 2, este tope **no puede ser el que corta en uso
 * normal**: solo caza un bucle desbocado, que es su trabajo. Poner aquí el
 * mismo número que cotizar convertiría el freno en un obstáculo, y la emisión
 * —que ya funciona en producción desde el 21/09/2026— se caería sola.
 */
export const FACTOR_TOPE_EMISION = 2

/** Céntimos que se apuntan por cada línea de esta operación. Puro. */
export function costeEmisionCents(
  operacion: OperacionEmision,
  env: Record<string, string | undefined>,
): number {
  return entero(env[ENV_COSTE_CENTS[operacion]], COSTE_EMISION_CENTS_DEFECTO, COSTE_EMISION_CENTS_MAXIMO)
}

/**
 * Topes de ESTA operación. Por defecto, los de cotizar × `FACTOR_TOPE_EMISION`;
 * se pisan con su propia env. Puro.
 */
export function topesEmision(
  operacion: OperacionEmision,
  env: Record<string, string | undefined>,
): Topes {
  const base = resolverTopes(env)
  return {
    diario: entero(
      env[ENV_TOPE_DIARIO[operacion]],
      base.diario * FACTOR_TOPE_EMISION,
      TOPE_DIARIO_MAXIMO * FACTOR_TOPE_EMISION,
    ),
    mensual: entero(
      env[ENV_TOPE_MENSUAL[operacion]],
      base.mensual * FACTOR_TOPE_EMISION,
      TOPE_MENSUAL_MAXIMO * FACTOR_TOPE_EMISION,
    ),
  }
}

/**
 * Cómo se dice lo que llevamos gastado en esta operación.
 *
 * 🚨 Con `costeCents = 0` **no se escribe «0,00€»**: eso afirmaría que estas
 * llamadas son gratis, y lo único cierto es que nadie lo ha confirmado. Es la
 * regla de la casa (`null` ≠ `0`) aplicada al único sitio donde se leería como
 * un dato.
 */
export function describirCoste(
  operacion: OperacionEmision,
  llamadas: number,
  costeCents: number,
): string {
  if (costeCents <= 0) {
    return `coste sin confirmar (${ENV_COSTE_CENTS[operacion]} está a 0: se cuentan las llamadas, no los euros)`
  }
  return eurCents(llamadas * costeCents)
}

/**
 * ¿Cabe UNA llamada más de esta operación? Mismo contrato que `puedeCotizar()`
 * —y por las mismas razones: se evalúa ANTES de llamar y sobre el libro ya
 * persistido— pero con su propio recuento y sus propias envs.
 */
export function puedeGastarEmision(
  operacion: OperacionEmision,
  consumo: Consumo,
  topes: Topes,
  costeCents: number,
): Veredicto {
  const hoy = consumidasHoy(consumo)
  const mes = consumidasMes(consumo)
  const que = ETIQUETA_EMISION[operacion]

  if (hoy >= topes.diario) {
    return {
      permitido: false,
      motivo: 'tope-diario',
      consumidas: hoy,
      tope: topes.diario,
      explicacion:
        `Tope diario de ${que} alcanzado: ${hoy} de ${topes.diario} ` +
        `(${describirCoste(operacion, hoy, costeCents)}). Se reanuda mañana, o sube ` +
        `${ENV_TOPE_DIARIO[operacion]}.`,
    }
  }

  if (mes >= topes.mensual) {
    return {
      permitido: false,
      motivo: 'tope-mensual',
      consumidas: mes,
      tope: topes.mensual,
      explicacion:
        `Tope mensual de ${que} alcanzado: ${mes} de ${topes.mensual} ` +
        `(${describirCoste(operacion, mes, costeCents)}). Sube ` +
        `${ENV_TOPE_MENSUAL[operacion]} si es intencionado.`,
    }
  }

  return { permitido: true, restantesHoy: topes.diario - hoy, restantesMes: topes.mensual - mes }
}
