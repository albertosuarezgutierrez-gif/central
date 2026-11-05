// F5 — Regularización, cierre y apertura del ejercicio. PURO, céntimos enteros. Los asientos son INMUTABLES: un ejercicio cerrado no admite
// más asientos (lo impone `validarAsiento`/la BD); un error posterior se corrige con un contraasiento en un ejercicio ABIERTO.
//
//   1. Regularización: salda las cuentas 6 y 7 contra la 129 (Resultado del ejercicio).
//   2. Cierre: salda TODAS las cuentas restantes (incluida la 129); el ejercicio queda a cero.
//   3. Apertura (1 de enero del siguiente): el cierre con debe/haber intercambiados → saldos de apertura ≡ saldos de cierre.
// La aplicación del resultado (129 → reservas, dividendos) la acuerda la junta: NO se hace aquí (asiento manual posterior).
import { ErrorContable, type Centimos } from '../partida/dinero.ts'
import { crearAsiento, type ApunteAsiento, type Asiento, type EjercicioContable } from '../partida/asiento.ts'
import type { PlanDeCuentas } from '../partida/plan.ts'

export type SaldoCuenta = { cuenta: string; debe: Centimos; haber: Centimos }

export const refRegularizacion = (anio: number) => `regularizacion:${anio}`
export const refCierre = (anio: number) => `cierre:${anio}`
export const refApertura = (anio: number) => `apertura:${anio}`

const esGestion = (c: string) => c[0] === '6' || c[0] === '7'

/** Σ debe / Σ haber por cuenta de los asientos dados (orden por cuenta). */
export function saldosDeAsientos(asientos: readonly Pick<Asiento, 'apuntes'>[]): SaldoCuenta[] {
  const m = new Map<string, SaldoCuenta>()
  for (const a of asientos) for (const p of a.apuntes) {
    const x = m.get(p.cuenta) ?? { cuenta: p.cuenta, debe: 0, haber: 0 }
    x.debe += p.debe; x.haber += p.haber
    m.set(p.cuenta, x)
  }
  return [...m.values()].sort((a, b) => (a.cuenta < b.cuenta ? -1 : a.cuenta > b.cuenta ? 1 : 0))
}

/** ¿Es un asiento de regularización o de cierre (los que NO cuentan para PyG ni balance del ejercicio)? */
export const esAsientoDeCierre = (a: Pick<Asiento, 'origen'>): boolean =>
  a.origen?.tipo === 'cierre' && (a.origen.ref.startsWith('regularizacion:') || a.origen.ref.startsWith('cierre:'))

/** Asientos para las cuentas anuales de un ejercicio: todos menos la regularización y el cierre (la apertura SÍ cuenta). */
export const asientosParaCuentasAnuales = <T extends Pick<Asiento, 'origen'>>(asientos: readonly T[]): T[] => asientos.filter((a) => !esAsientoDeCierre(a))

/** Resultado del ejercicio = Σ (haber − debe) de las cuentas 6 y 7 (beneficio > 0, pérdida < 0). */
export function resultadoDeAsientos(asientos: readonly Pick<Asiento, 'apuntes'>[]): Centimos {
  let r = 0
  for (const s of saldosDeAsientos(asientos)) if (esGestion(s.cuenta)) r += s.haber - s.debe
  return r
}

/** Regularización a 31/12: salda cada cuenta 6/7 con saldo y lleva el neto a la 129. `null` si las cuentas 6/7 ya están a cero. */
export function asientoRegularizacion(asientos: readonly Pick<Asiento, 'apuntes'>[], anio: number): Asiento | null {
  const apuntes: ApunteAsiento[] = []
  let neto = 0
  for (const s of saldosDeAsientos(asientos)) {
    if (!esGestion(s.cuenta)) continue
    const saldo = s.debe - s.haber
    if (saldo === 0) continue
    apuntes.push(saldo > 0 ? { cuenta: s.cuenta, debe: 0, haber: saldo } : { cuenta: s.cuenta, debe: -saldo, haber: 0 })
    neto -= saldo
  }
  if (!apuntes.length) return null
  if (neto > 0) apuntes.push({ cuenta: '129', debe: 0, haber: neto })
  else if (neto < 0) apuntes.push({ cuenta: '129', debe: -neto, haber: 0 })
  return {
    fecha: `${anio}-12-31`, ejercicio: anio, concepto: `Regularización del ejercicio ${anio}: resultado a la cuenta 129`,
    apuntes, origen: { tipo: 'cierre', ref: refRegularizacion(anio) },
  }
}

/** Cierre a 31/12: salda todas las cuentas con saldo. Exige las cuentas 6/7 ya regularizadas. `null` si no queda ningún saldo. */
export function asientoCierre(asientos: readonly Pick<Asiento, 'apuntes'>[], anio: number): Asiento | null {
  const apuntes: ApunteAsiento[] = []
  for (const s of saldosDeAsientos(asientos)) {
    const saldo = s.debe - s.haber
    if (saldo === 0) continue
    if (esGestion(s.cuenta)) throw new ErrorContable('regularizacion_pendiente', `la cuenta ${s.cuenta} (grupo 6/7) aún tiene saldo: regulariza antes de cerrar`)
    apuntes.push(saldo > 0 ? { cuenta: s.cuenta, debe: 0, haber: saldo } : { cuenta: s.cuenta, debe: -saldo, haber: 0 })
  }
  if (!apuntes.length) return null
  return { fecha: `${anio}-12-31`, ejercicio: anio, concepto: `Asiento de cierre del ejercicio ${anio}`, apuntes, origen: { tipo: 'cierre', ref: refCierre(anio) } }
}

/** Apertura del ejercicio siguiente: el cierre con debe/haber intercambiados, fechado el 1 de enero. */
export function asientoApertura(cierre: Asiento): Asiento {
  const sig = cierre.ejercicio + 1
  return {
    fecha: `${sig}-01-01`, ejercicio: sig, concepto: `Asiento de apertura del ejercicio ${sig}`,
    apuntes: cierre.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.haber, haber: p.debe })),
    origen: { tipo: 'apertura', ref: refApertura(sig) },
  }
}

/** Comprobación «apertura ≡ cierre»: cada cuenta con el mismo saldo (deudor/acreedor) a 31/12 y a 1/1. Lista de diferencias (vacía = ok). */
export function diferenciasAperturaCierre(cierre: Pick<Asiento, 'apuntes'>, apertura: Pick<Asiento, 'apuntes'>): string[] {
  // Saldo de cierre de una cuenta = −(su apunte en el asiento de cierre). Saldo de apertura = su apunte en la apertura.
  const cierreSaldo = new Map<string, number>()
  for (const p of cierre.apuntes) cierreSaldo.set(p.cuenta, (cierreSaldo.get(p.cuenta) ?? 0) - (p.debe - p.haber))
  const aperturaSaldo = new Map<string, number>()
  for (const p of apertura.apuntes) aperturaSaldo.set(p.cuenta, (aperturaSaldo.get(p.cuenta) ?? 0) + (p.debe - p.haber))
  const dif: string[] = []
  for (const c of new Set([...cierreSaldo.keys(), ...aperturaSaldo.keys()])) {
    const a = cierreSaldo.get(c) ?? 0
    const b = aperturaSaldo.get(c) ?? 0
    if (a !== b) dif.push(`cuenta ${c}: cierre ${a} ≠ apertura ${b}`)
  }
  return dif
}

export type EstadoEjercicioCierre = 'abierto' | 'en_cierre' | 'cerrado'

/** Transiciones permitidas del estado del ejercicio. `cerrado` es DEFINITIVO. */
export function transicionEjercicioValida(de: EstadoEjercicioCierre, a: EstadoEjercicioCierre): boolean {
  if (de === a) return true
  if (de === 'cerrado') return false
  if (de === 'abierto') return a === 'en_cierre' || a === 'cerrado'
  return a === 'abierto' || a === 'cerrado' // en_cierre
}

/** Lanza si el ejercicio no admite asientos (cerrado o en cierre). */
export function exigirEjercicioAbierto(e: EjercicioContable): void {
  if (!e.abierto) throw new ErrorContable('ejercicio_cerrado', `el ejercicio ${e.anio} está cerrado: no admite asientos (corrige con un contraasiento en un ejercicio abierto)`)
}

export type PlanDeCierre = {
  regularizacion: Asiento | null
  cierre: Asiento | null
  apertura: Asiento | null
  /** Resultado del ejercicio (+ beneficio, − pérdida). */
  resultado: Centimos
}

export type EntradaCierre = {
  /** TODOS los asientos del ejercicio (con su `origen`), incluida la apertura heredada. */
  asientos: readonly Asiento[]
  anio: number
  plan: PlanDeCuentas
  ejercicio: EjercicioContable
  /** Ejercicio siguiente (debe existir y estar abierto) para la apertura. */
  ejercicioSiguiente: EjercicioContable | null
}

/**
 * Prepara (sin persistir) regularización, cierre y apertura, YA validados contra el plan y el ejercicio. `errores` no vacío = no se puede cerrar.
 * Condiciones: ejercicio abierto, sin cierre previo, existe el ejercicio siguiente abierto, el diario cuadra.
 */
export function prepararCierre(e: EntradaCierre): { ok: true; plan: PlanDeCierre } | { ok: false; errores: string[] } {
  const errores: string[] = []
  if (e.ejercicio.anio !== e.anio) errores.push(`el ejercicio dado es el ${e.ejercicio.anio}, no el ${e.anio}`)
  if (!e.ejercicio.abierto) errores.push(`el ejercicio ${e.anio} ya está cerrado`)
  if (e.asientos.some(esAsientoDeCierre)) errores.push(`el ejercicio ${e.anio} ya tiene asientos de regularización o cierre`)
  if (!e.ejercicioSiguiente) errores.push(`no existe el ejercicio ${e.anio + 1} para asentar la apertura (créalo antes)`)
  else if (!e.ejercicioSiguiente.abierto) errores.push(`el ejercicio ${e.anio + 1} no está abierto`)
  let debe = 0
  let haber = 0
  for (const a of e.asientos) for (const p of a.apuntes) { debe += p.debe; haber += p.haber }
  if (debe !== haber) errores.push(`el diario del ejercicio está descuadrado (debe ${debe} ≠ haber ${haber})`)
  if (errores.length) return { ok: false, errores }

  try {
    const resultado = resultadoDeAsientos(e.asientos)
    const regRaw = asientoRegularizacion(e.asientos, e.anio)
    const regul = regRaw ? crearAsiento(regRaw, e.plan, e.ejercicio) : null
    const cierreRaw = asientoCierre([...e.asientos, ...(regul ? [regul] : [])], e.anio)
    const cierre = cierreRaw ? crearAsiento(cierreRaw, e.plan, e.ejercicio) : null
    const apertura = cierre ? crearAsiento(asientoApertura(cierre), e.plan, e.ejercicioSiguiente!) : null
    if (cierre && apertura) {
      const dif = diferenciasAperturaCierre(cierre, apertura)
      if (dif.length) return { ok: false, errores: dif }
    }
    return { ok: true, plan: { regularizacion: regul, cierre, apertura, resultado } }
  } catch (err) {
    if (err instanceof ErrorContable) return { ok: false, errores: err.message.split('; ') }
    throw err
  }
}
