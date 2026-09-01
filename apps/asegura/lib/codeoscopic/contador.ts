// Contador y tope de cotizaciones de Codeoscopic. Lógica PURA (sin BD, sin red).
//
// ─── El problema que resuelve, y por qué no es un simple `count(*)` ──────────
// Cada `POST /insurances` cuesta 0,50€ y **no es idempotente**: si repites la
// llamada, Codeoscopic crea otro proyecto y te cobra otra vez. Además el timeout
// es de 150 s, así que el caso interesante no es el error limpio — es la llamada
// que se corta sin respuesta.
//
// Ahí está la trampa, y es la regla de `CLAUDE.md` aplicada al dinero: una
// cotización que salió y de la que no sabemos el desenlace **no es una
// cotización gratis**. Si la contamos como 0 porque «no tenemos la respuesta»,
// estamos convirtiendo un «no lo sé» en un «no pasó», que es justo la mentira
// que la casa tiene prohibida — y aquí encima se paga a fin de mes.
//
// Por eso el libro tiene TRES estados y solo UNO libera el cupo:
//   - `reservado`  → se escribió ANTES de llamar. Si nadie lo cerró, **cuenta
//                    como facturable**: es lo conservador y casi siempre lo
//                    cierto (el vendor cobra por recibir la petición).
//   - `facturable` → hubo respuesta del vendor. Cuenta, obviamente.
//   - `descartado` → tenemos PRUEBA de que no hubo cargo (fallo de auth, de
//                    conexión antes de enviar, o rechazo de validación). Solo
//                    este libera cupo, y solo con evidencia.
//
// Consecuencia deliberada: si la app se cae a media cotización, el cupo se
// consume. Preferimos perder un hueco a perder la cuenta.

import { COSTE_COTIZACION_CENTS, type Topes } from './config.ts'

/** Recuento del libro, ya agregado por ventana temporal. */
export type Consumo = {
  /** Cerradas con respuesta del vendor, hoy (día natural, hora de España). */
  diaFacturables: number
  /** Abiertas sin cerrar, hoy. Cuentan igual: no sabemos que fueran gratis. */
  diaEnVuelo: number
  mesFacturables: number
  mesEnVuelo: number
}

export type Veredicto =
  | { permitido: true; restantesHoy: number; restantesMes: number }
  | {
      permitido: false
      motivo: 'tope-diario' | 'tope-mensual'
      consumidas: number
      tope: number
      explicacion: string
    }

/** Lo consumido de verdad en el día: lo cerrado MÁS lo que quedó en el aire. */
export function consumidasHoy(c: Consumo): number {
  return c.diaFacturables + c.diaEnVuelo
}

export function consumidasMes(c: Consumo): number {
  return c.mesFacturables + c.mesEnVuelo
}

/**
 * ¿Se puede lanzar UNA cotización más?
 *
 * Se evalúa ANTES de llamar al vendor y sobre el libro ya persistido. El tope
 * diario se mira primero por ser el más estrecho.
 */
export function puedeCotizar(consumo: Consumo, topes: Topes): Veredicto {
  const hoy = consumidasHoy(consumo)
  const mes = consumidasMes(consumo)

  if (hoy >= topes.diario) {
    return {
      permitido: false,
      motivo: 'tope-diario',
      consumidas: hoy,
      tope: topes.diario,
      explicacion:
        `Tope diario alcanzado: ${hoy} de ${topes.diario} cotizaciones ` +
        `(${eurCents(hoy * COSTE_COTIZACION_CENTS)}). Se reanuda mañana, o sube ` +
        `CODEOSCOPIC_TOPE_DIARIO.`,
    }
  }

  if (mes >= topes.mensual) {
    return {
      permitido: false,
      motivo: 'tope-mensual',
      consumidas: mes,
      tope: topes.mensual,
      explicacion:
        `Tope mensual alcanzado: ${mes} de ${topes.mensual} cotizaciones ` +
        `(${eurCents(mes * COSTE_COTIZACION_CENTS)}). Sube CODEOSCOPIC_TOPE_MENSUAL ` +
        `si es intencionado.`,
    }
  }

  return { permitido: true, restantesHoy: topes.diario - hoy, restantesMes: topes.mensual - mes }
}

/**
 * ¿Cabe una TANDA de `n` cotizaciones? Para lo que de verdad quema cupo: una
 * pasada de defensa de cartera retarifica una póliza por cliente.
 *
 * Devuelve cuántas caben, que puede ser menos de las pedidas. El llamante NO
 * debe redondear hacia arriba «porque casi cabían».
 */
export function cabenEnTanda(n: number, consumo: Consumo, topes: Topes): {
  caben: number
  coste: string
  recortada: boolean
} {
  const hueco = Math.max(
    0,
    Math.min(topes.diario - consumidasHoy(consumo), topes.mensual - consumidasMes(consumo)),
  )
  const caben = Math.max(0, Math.min(n, hueco))
  return { caben, coste: eurCents(caben * COSTE_COTIZACION_CENTS), recortada: caben < n }
}

/** Coste en formato español (`54,50€`), como manda la regla global de la casa. */
export function eurCents(cents: number): string {
  return (
    (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    }) + '€'
  )
}
