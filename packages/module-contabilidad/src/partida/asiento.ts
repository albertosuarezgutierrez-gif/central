// Asiento contable: INMUTABLE. Se corrige con un contraasiento (rectificar), nunca editando.

import { ErrorContable, esCentimos, type Centimos } from './dinero.ts'
import type { PlanDeCuentas } from './plan.ts'

export type TipoOrigen = 'venta' | 'cobro' | 'compra' | 'pago' | 'nomina' | 'banco' | 'manual' | 'amortizacion' | 'cierre'

export interface OrigenAsiento {
  tipo: TipoOrigen
  ref: string
}

export interface ApunteAsiento {
  cuenta: string
  debe: Centimos
  haber: Centimos
  documento?: string
}

export interface Asiento {
  /** Nº correlativo dentro del ejercicio (lo asigna quien persiste). Desempata el diario a igual fecha. */
  numero?: number
  /** ISO `AAAA-MM-DD`. */
  fecha: string
  ejercicio: number
  concepto: string
  apuntes: readonly ApunteAsiento[]
  origen?: OrigenAsiento
  /** Si es un contraasiento: número (o ref) del asiento que rectifica. */
  rectificaA?: number | string
}

export interface EjercicioContable {
  anio: number
  /** Inicio y fin inclusivos, ISO. */
  inicio: string
  fin: string
  abierto: boolean
}

export function ejercicioNatural(anio: number, abierto = true): EjercicioContable {
  return { anio, inicio: `${anio}-01-01`, fin: `${anio}-12-31`, abierto }
}

export function esFechaISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function totalesAsiento(a: Pick<Asiento, 'apuntes'>): { debe: Centimos; haber: Centimos } {
  let debe = 0
  let haber = 0
  for (const p of a.apuntes) { debe += p.debe; haber += p.haber }
  return { debe, haber }
}

/** Devuelve la lista de problemas (vacía = válido). No lanza. */
export function validarAsiento(a: Asiento, plan: PlanDeCuentas, ejercicio: EjercicioContable): string[] {
  const errs: string[] = []
  if (!a.concepto || !a.concepto.trim()) errs.push('concepto vacío')
  if (!esFechaISO(a.fecha)) errs.push(`fecha inválida: ${String(a.fecha)}`)
  if (a.ejercicio !== ejercicio.anio) errs.push(`el asiento es del ejercicio ${a.ejercicio} y el abierto es ${ejercicio.anio}`)
  if (!ejercicio.abierto) errs.push(`el ejercicio ${ejercicio.anio} está cerrado`)
  if (esFechaISO(a.fecha) && (a.fecha < ejercicio.inicio || a.fecha > ejercicio.fin)) {
    errs.push(`la fecha ${a.fecha} queda fuera del ejercicio ${ejercicio.inicio}..${ejercicio.fin}`)
  }
  if (!Array.isArray(a.apuntes) || a.apuntes.length < 2) {
    errs.push('un asiento necesita al menos 2 apuntes')
    return errs
  }
  a.apuntes.forEach((p, i) => {
    const n = i + 1
    if (!esCentimos(p.debe) || !esCentimos(p.haber)) { errs.push(`apunte ${n}: importes deben ser enteros en céntimos`); return }
    if (p.debe < 0 || p.haber < 0) errs.push(`apunte ${n}: importes negativos no permitidos`)
    if ((p.debe > 0) === (p.haber > 0)) errs.push(`apunte ${n}: debe XOR haber (exactamente uno mayor que 0)`)
    const c = plan.cuentas[p.cuenta]
    if (!c) errs.push(`apunte ${n}: la cuenta ${p.cuenta} no existe en el plan`)
    else if (!c.admiteApuntes) errs.push(`apunte ${n}: la cuenta ${p.cuenta} no es de nivel hoja (usa una subcuenta)`)
  })
  if (a.apuntes.every(p => esCentimos(p.debe) && esCentimos(p.haber))) {
    const t = totalesAsiento(a)
    if (t.debe !== t.haber) errs.push(`asiento descuadrado: debe ${t.debe} ≠ haber ${t.haber}`)
  }
  return errs
}

function congelar(a: Asiento): Asiento {
  for (const p of a.apuntes) Object.freeze(p)
  Object.freeze(a.apuntes)
  if (a.origen) Object.freeze(a.origen)
  return Object.freeze(a)
}

/** Valida y devuelve el asiento congelado (inmutable). Lanza ErrorContable('asiento_invalido') si hay problemas. */
export function crearAsiento(entrada: Asiento, plan: PlanDeCuentas, ejercicio: EjercicioContable): Asiento {
  const copia: Asiento = {
    ...entrada,
    apuntes: entrada.apuntes.map(p => ({ ...p })),
    ...(entrada.origen ? { origen: { ...entrada.origen } } : {}),
  }
  const errs = validarAsiento(copia, plan, ejercicio)
  if (errs.length) throw new ErrorContable('asiento_invalido', errs.join('; '))
  return congelar(copia)
}

/**
 * Contraasiento: mismos apuntes con debe/haber intercambiados. El original no se toca.
 * `fecha` y `ejercicio` son los del contraasiento (pueden ser de otro ejercicio abierto).
 */
export function rectificar(
  original: Asiento,
  opts: { fecha: string; ejercicio?: number; concepto?: string; numero?: number },
): Asiento {
  const asiento: Asiento = {
    ...(opts.numero !== undefined ? { numero: opts.numero } : {}),
    fecha: opts.fecha,
    ejercicio: opts.ejercicio ?? Number(opts.fecha.slice(0, 4)),
    concepto: opts.concepto ?? `Rectificación: ${original.concepto}`,
    apuntes: original.apuntes.map(p => ({
      cuenta: p.cuenta,
      debe: p.haber,
      haber: p.debe,
      ...(p.documento ? { documento: p.documento } : {}),
    })),
    ...(original.origen ? { origen: { ...original.origen } } : {}),
    rectificaA: original.numero ?? original.origen?.ref ?? original.concepto,
  }
  return congelar(asiento)
}
