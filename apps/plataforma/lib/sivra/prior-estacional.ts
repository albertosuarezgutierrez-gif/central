// Prior estacional del pricing: qué dice MI propio histórico (`incomes`) sobre cada mes.
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`. Lo consume `pricing/apply`.
//
// 🚨 LA ASIMETRÍA ES EL MÓDULO (06/08/2026). Subir y bajar NO se deciden con el mismo índice:
//
//   · Para SUBIR vale el índice completo, ADR × ocupación relativa. Octubre destaca más en noches
//     vendidas que en precio (históricamente también se vendió barato), así que mirar solo el ADR
//     dejaría fuera el mes que más llena. Es como estaba y no cambia.
//
//   · Para BAJAR solo vale el ADR. Regla de negocio de Alberto: «Sevilla en verano, julio y sobre
//     todo agosto, está vacía; es normal que no haya reservas». Cuando la ciudad no tiene demanda,
//     las pocas noches vendidas NO son la señal de que el precio esté alto — son la señal de que
//     no hay a quién vendérselo. Bajar el precio por eso regala margen sin traer un solo huésped:
//     el que no viene a Sevilla en agosto no viene tampoco un 20% más barato. Lo único que sí
//     informa es cuánto pagaron los que SÍ vinieron, que es el ADR.
//
// Y una segunda guarda encima: la bajada está topada (`BAJADA_MAX`). Con el ADR de agosto en 0,77
// del medio, el índice crudo pediría −23%; el tope lo deja en −15%, y el suelo del piso
// (`floor`/`min_price`) manda siempre por encima de esto. «Bajar, pero sin regalar el precio».

/** Ventas históricas de un mes concreto de un piso. */
export interface MesHistorico {
  /** 1-12 */
  mes: number
  /** ADR del mes (ingreso bruto / noches). */
  adr: number
  /** Noches vendidas en ese mes, sumando todos los años del histórico. */
  nights: number
}

export interface IndicePrior {
  /** Índice para SUBIR: ADR × ocupación relativa. 1 = mes del montón. */
  alza: number
  /** Índice para BAJAR: solo ADR, topado. 1 = no bajar. */
  baja: number
}

/** Noches mínimas de un mes para que su histórico diga algo. Por debajo, no hay prior. */
export const MIN_NOCHES_MES = 30
/** Cuánto puede bajar el prior como MÁXIMO respecto del ancla (0,85 = −15%). */
export const BAJADA_MAX = 0.85
/** Techo del índice de subida (se conserva del comportamiento anterior). */
export const ALZA_MAX = 1.6
/** Suelo del índice de subida crudo antes de recortar (se conserva). */
export const ALZA_MIN = 0.7
/**
 * Rampa del suelo CON bucket del mes (27/10/2026). Antes era un escalón en 1,15: House dic pasó
 * de alza 1,145 a 1,193 al entrar UNA reserva y el suelo saltó de 0 a ~441 € (+20 % de golpe).
 * Ahora el suelo entra lineal: 0 en RAMPA_DESDE, pleno en RAMPA_HASTA. Centrada en el 1,15 de
 * siempre (mismo punto medio, así no desplaza en promedio dónde actúa la red) y de 0,10 de ancho:
 * un movimiento de 0,01 del índice mueve el suelo como mucho ~10 % del ancla, nunca de 0 a pleno.
 */
export const RAMPA_DESDE = 1.10
export const RAMPA_HASTA = 1.20
/** Rebaja del suelo cuando hay bucket del mes: el mercado fresco manda. */
export const REBAJA_CON_BUCKET = 0.9

/** Fracción del suelo que aplica con bucket del mes: 0 → 1 lineal entre RAMPA_DESDE y RAMPA_HASTA. */
export function factorRampa(alza: number): number {
  return clamp((alza - RAMPA_DESDE) / (RAMPA_HASTA - RAMPA_DESDE), 0, 1)
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Índices por mes (array de 12, posición 0 = enero) a partir del histórico de un piso.
 * Un mes sin muestra suficiente queda en `{ alza: 1, baja: 1 }`: ni sube ni baja.
 */
export function indicesPrior(rows: MesHistorico[]): IndicePrior[] {
  const idx: IndicePrior[] = Array.from({ length: 12 }, () => ({ alza: 1, baja: 1 }))
  const totalNoches = rows.reduce((s, x) => s + x.nights, 0)
  if (!totalNoches) return idx

  const adrMedio = rows.reduce((s, x) => s + x.adr * x.nights, 0) / totalNoches
  const nochesMedia = totalNoches / (rows.length || 1)
  if (adrMedio <= 0) return idx

  for (const x of rows) {
    if (x.nights < MIN_NOCHES_MES) continue
    if (x.mes < 1 || x.mes > 12) continue
    const adrIdx = x.adr / adrMedio
    const occIdx = clamp(x.nights / (nochesMedia || 1), 0.85, 1.25)
    idx[x.mes - 1] = {
      alza: clamp(adrIdx * occIdx, ALZA_MIN, ALZA_MAX),
      // Solo ADR, y solo hacia abajo: un mes con ADR alto no baja nada por esta vía (queda en 1),
      // de eso ya se encarga `alza`.
      baja: clamp(Math.min(adrIdx, 1), BAJADA_MAX, 1),
    }
  }
  return idx
}

/**
 * Objetivo corregido por el prior. Devuelve el `target` nuevo (o el mismo si no toca).
 *
 * - Al alza actúa como SUELO, igual que antes: sin bucket del mes sustituye al global plano; con
 *   bucket entra en RAMPA (0 en 1,10 → pleno en 1,20, ver `RAMPA_DESDE`) y rebajado un 10%,
 *   porque el mercado fresco manda. Antes era un escalón en 1,15 y oscilaba (+20 % por una reserva).
 * - A la baja actúa como TECHO y **solo sin bucket del mes**: si hay mercado medido de ese mes,
 *   ese mercado ya dice el precio y no hace falta el histórico. Nunca perfora `floor`.
 */
export function aplicarPrior(params: {
  target: number
  indice: IndicePrior
  anclaGlobal: number
  floor: number
  hayBucketMes: boolean
}): number {
  const { target, indice, anclaGlobal, floor, hayBucketMes } = params

  if (indice.alza > 1) {
    const suelo = !hayBucketMes
      ? Math.round(anclaGlobal * indice.alza)
      : Math.round(anclaGlobal * indice.alza * REBAJA_CON_BUCKET * factorRampa(indice.alza))
    return suelo > target ? suelo : target
  }

  if (indice.baja < 1 && !hayBucketMes) {
    // El suelo del piso manda: «bajar, pero sin regalar el precio».
    const techo = Math.max(Math.round(anclaGlobal * indice.baja), floor)
    return techo < target ? techo : target
  }

  return target
}
