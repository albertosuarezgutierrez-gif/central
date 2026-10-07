// ¿El carné del conductor cubre la moto elegida? Cruce PURO, sin red.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Codeoscopic tarifica una moto de 600 cc con un carné A1 sin rechistar: el
// `risk` no lleva cilindrada (va implícita en `vehicle.code`) y nada del
// contrato dice que el vendor cruce una cosa con otra. El precio llega, se
// emite, y la póliza cubre a alguien que no puede conducir esa moto — el
// problema aparece el día del siniestro, no el de la cotización.
//
// Los dos lados salen de catálogos GRATIS del propio vendor:
//   · `/motorcycle/driving-licenses` → `maxDisplacement` (cc) y
//     `maxEnginePower` (kW) de cada tipo de carné
//     (`docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md`, tabla de catálogos).
//   · `/motorcycle/brands/{}/models/{}/vehicles` → la versión elegida, con
//     `engine.displacement` (cc) y `engine.powerKw` (kW).
//
// 🚨 Unidades: se compara cc con cc y kW con kW. `powerCv` NO se convierte: si
// la versión no trae kW, la potencia queda como «no se sabe», no se deriva.
//
// 🚨 Margen: Base7 puede guardar la potencia en CV y pasarla a kW, y una A2
// homologada a 48 CV sale a 35,3 kW. Con `>` estricto eso bloquearía una
// cotización legítima; por eso solo cuenta un exceso mayor que `MARGEN_*`.
//
// 🚨 «No se sabe» NO es «cubre». Si falta un límite o un dato de la versión, el
// cruce devuelve `null` y NO bloquea (el vendor no cobra por no saberlo), pero
// tampoco afirma nada: quien llama no lo pinta como «compatible».

import { extraerLista } from './crudo.ts'

/** Redondeos de ficha técnica que NO son exceso (ver cabecera). */
export const MARGEN_CC = 1
export const MARGEN_KW = 0.5

/** Límites de un tipo de carné. `null` = el catálogo no pone límite (o no lo trae). */
export type LimiteCarnet = { id: string; maxCc: number | null; maxKw: number | null }

/** Motor de una versión. `null` = la versión no lo trae. */
export type MotorVersion = { cc: number | null; kw: number | null }

function positivo(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function idDe(o: Record<string, unknown>): string | null {
  const id = o.id ?? o.code ?? o.value
  return id === undefined || id === null || String(id).trim() === '' ? null : String(id)
}

/** `/motorcycle/driving-licenses` crudo → límites por tipo. Entradas sin id se descartan. */
export function limitesDeCarnets(raw: unknown): LimiteCarnet[] {
  const out: LimiteCarnet[] = []
  for (const it of extraerLista(raw).lista ?? []) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    const id = idDe(o)
    if (id === null) continue
    out.push({ id, maxCc: positivo(o.maxDisplacement), maxKw: positivo(o.maxEnginePower) })
  }
  return out
}

/**
 * Las versiones crudas de un modelo → el motor de la que tiene ese código.
 * `null` si el código no está en la lista (no se ha podido mirar).
 */
export function motorDeVersion(raw: unknown, codigo: string): MotorVersion | null {
  for (const it of extraerLista(raw).lista ?? []) {
    if (typeof it !== 'object' || it === null) continue
    const o = it as Record<string, unknown>
    if (idDe(o) !== codigo) continue
    const motor = typeof o.engine === 'object' && o.engine !== null ? (o.engine as Record<string, unknown>) : {}
    return {
      cc: positivo(motor.displacement ?? o.displacement),
      kw: positivo(motor.powerKw ?? o.powerKw),
    }
  }
  return null
}

/**
 * El motivo por el que ese carné NO cubre esa versión, o `null` si no hay
 * choque DEMOSTRADO (cubre, o falta algún dato para saberlo).
 */
export function choqueCarnetVersion(carnet: LimiteCarnet, motor: MotorVersion): string | null {
  const excesos: string[] = []
  if (carnet.maxCc !== null && motor.cc !== null && motor.cc > carnet.maxCc + MARGEN_CC) {
    excesos.push(`${motor.cc} cc (máximo ${carnet.maxCc} cc)`)
  }
  if (carnet.maxKw !== null && motor.kw !== null && motor.kw > carnet.maxKw + MARGEN_KW) {
    excesos.push(`${motor.kw} kW (máximo ${carnet.maxKw} kW)`)
  }
  if (excesos.length === 0) return null
  return `el carné ${carnet.id} no cubre esta versión: ${excesos.join(' y ')}`
}

// ─── Regla de tráfico FIJA (no del catálogo del vendor) ──────────────────────
// Caso real (Kymco Grand Dink 300, conductor con solo carné B en ficha): se mandó
// el B como supuesto y el vendor contestó 400 «cannot be used by the primary driver».
// No costó nada, pero la regla es de tráfico y no cambia: se corta ANTES, gratis y
// con la frase que explica qué hacer. Carné B (con ≥3 años) solo hasta 125 cc / 11 kW;
// AM ≤50 cc; A1 ≤125 cc y 11 kW; A2 ≤35 kW; A sin límite. Misma tolerancia de
// redondeo que arriba (`MARGEN_*`).
const REGLA_TRAFICO: Record<string, { maxCc: number | null; maxKw: number | null }> = {
  AM: { maxCc: 50, maxKw: null },
  A1: { maxCc: 125, maxKw: 11 },
  A2: { maxCc: null, maxKw: 35 },
  A: { maxCc: null, maxKw: null },
  B: { maxCc: 125, maxKw: 11 },
}

/**
 * El motivo por el que ese tipo de carné NO puede conducir esa moto según la
 * norma de tráfico, o `null` (cabe, tipo desconocido, o falta el dato: «no se sabe»
 * NO es «cabe»; el aviso de cilindrada desconocida lo da `avisoCilindradaDesconocida`).
 */
export function choqueReglaTrafico(tipo: string, motor: MotorVersion): string | null {
  const regla = REGLA_TRAFICO[tipo.trim().toUpperCase()]
  if (!regla) return null
  const tipoN = tipo.trim().toUpperCase()
  const pasaCc = regla.maxCc !== null && motor.cc !== null && motor.cc > regla.maxCc + MARGEN_CC
  const pasaKw = regla.maxKw !== null && motor.kw !== null && motor.kw > regla.maxKw + MARGEN_KW
  if (!pasaCc && !pasaKw) return null
  const que = pasaCc ? `${motor.cc} cc` : `${motor.kw} kW`
  if (tipoN === 'B') {
    return (
      `La moto tiene ${que} y exige carné A2 o A; en la ficha del conductor solo consta el B. ` +
      'Añade su carné de moto (con fecha) y vuelve a pedir precio.'
    )
  }
  return `La moto tiene ${que} y el carné ${tipoN} no la cubre (norma de tráfico). Revisa el carné de moto en la ficha del conductor y vuelve a pedir precio.`
}

/** B supuesto y versión sin cilindrada legible: no se puede descartar el choque. Aviso, no silencio. */
export function avisoCilindradaDesconocida(tipo: string, esSupuesto: boolean, motor: MotorVersion | null): string | null {
  if (!esSupuesto || tipo.trim().toUpperCase() !== 'B') return null
  if (motor !== null && motor.cc !== null) return null
  return (
    'AVISO: no se ha podido leer la cilindrada de esta versión y el carné B es un supuesto; ' +
    'si la moto supera 125 cc el vendor la rechazará (sin cargo). Comprueba la cilindrada o añade su carné de moto a la ficha.'
  )
}

/** El 400 del vendor «The motorbike with base7 code X cannot be used by the primary driver» → castellano. `null` = otro mensaje. */
export function traducirMotoNoApta400(detalle: string): string | null {
  if (!/motorbike[^\n]*cannot be used by the primary driver/i.test(detalle)) return null
  const code = /base7 code\s+([0-9A-Za-z]+)/i.exec(detalle)?.[1]
  return (
    `El carné del conductor no habilita esta moto${code ? ` (código Base7 ${code})` : ''}: ` +
    'añade su carné de moto (con fecha) en la ficha y vuelve a pedir precio. No se ha cobrado nada.'
  )
}
