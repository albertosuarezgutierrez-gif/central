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
