/**
 * Cada cifra legal lleva su FUENTE y su CERTEZA. Una cifra que no se ha podido contrastar con el BOE
 * queda como `PENDIENTE_VERIFICAR`: el motor la puede usar en modo «simulación» (borrador marcado), pero
 * en modo «cálculo» (nómina que se confirma y se publica) LANZA `CifraPendienteError` — fail-closed.
 * Si una cifra pendiente no tiene ni valor candidato (`valor: null`), no se puede usar en ningún modo.
 */
export const PENDIENTE_VERIFICAR = 'PENDIENTE_VERIFICAR' as const

/** seguro = norma citada y varias fuentes coinciden · probable = una fuente fiable · PENDIENTE = sin contrastar. */
export type Certeza = 'seguro' | 'probable' | typeof PENDIENTE_VERIFICAR

export interface Cifra<T = number> {
  clave: string
  /** null = «no se sabe» (no hay candidato fiable): nunca se rellena con 0 ni con el valor de otro año. */
  valor: T | null
  certeza: Certeza
  /** Norma (BOE) y, si la hay, fuente secundaria con la que se tomó. */
  fuente: string
}

export function cifra<T = number>(clave: string, valor: T | null, certeza: Certeza, fuente: string): Cifra<T> {
  return { clave, valor, certeza, fuente }
}

/** Modo «cálculo»: se usó al menos una cifra o regla PENDIENTE_VERIFICAR. */
export class CifraPendienteError extends Error {
  constructor(public readonly claves: string[]) {
    super(`Cálculo bloqueado: cifras/reglas ${PENDIENTE_VERIFICAR}: ${claves.join(', ')}`)
    this.name = 'CifraPendienteError'
  }
}

/** La cifra no tiene valor conocido (ni candidato): no se puede calcular en ningún modo. */
export class CifraDesconocidaError extends Error {
  constructor(public readonly clave: string) {
    super(`Cifra sin valor conocido (${PENDIENTE_VERIFICAR}, sin candidato): ${clave}`)
    this.name = 'CifraDesconocidaError'
  }
}

/** No hay tabla para el año del periodo: nunca se usa la de otro año en silencio. */
export class TablaNoDisponibleError extends Error {
  constructor(public readonly año: number) {
    super(`No hay tablas de cotización para ${año}`)
    this.name = 'TablaNoDisponibleError'
  }
}
