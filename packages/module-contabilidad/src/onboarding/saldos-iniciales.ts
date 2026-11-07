// Onboarding · SALDOS INICIALES → asiento de APERTURA que CUADRA. PURO, céntimos enteros.
//
// CSV con columnas `cuenta` y (`debe`,`haber`) o `saldo` (+ deudor / − acreedor). Importes en formato español o ISO (ver `importeACentimos`).
// El asiento solo existe si el fichero CUADRA al céntimo: no se inventa una cuenta de descuadre ni se «plancha» la diferencia (null ≠ 0: un saldo
// que falta es un dato que falta). Si no cuadra se devuelve la diferencia para que la persona la localice.
// El asiento lleva origen `apertura` con referencia `apertura-inicial:AAAA` (distinta de `apertura:AAAA`, la del cierre del ejercicio anterior).
import { ErrorContable, type Centimos } from '../partida/dinero.ts'
import type { PlanDeCuentas } from '../partida/plan.ts'
import { crearAsiento, esFechaISO, type Asiento, type EjercicioContable } from '../partida/asiento.ts'
import { importeACentimos, tablaCsv } from './csv.ts'

export const refAperturaInicial = (anio: number) => `apertura-inicial:${anio}`

export type LineaSaldo = { cuenta: string; debe: Centimos; haber: Centimos }
export type ResultadoSaldos =
  | { ok: true; lineas: LineaSaldo[]; totalDebe: Centimos; totalHaber: Centimos; asiento: Asiento }
  | { ok: false; errores: { linea: number; motivo: string }[]; lineas: LineaSaldo[]; totalDebe: Centimos; totalHaber: Centimos; diferencia: Centimos }

/** Lee el CSV (sin construir el asiento). Una cuenta repetida SE SUMA por lado, sin compensar debe con haber. */
export function leerSaldosCsv(texto: string): { lineas: LineaSaldo[]; errores: { linea: number; motivo: string }[] } {
  const t = tablaCsv(texto, { cuenta: ['codigo', 'subcuenta'], debe: ['deudor'], haber: ['acreedor'], saldo: ['importe'] }, ['cuenta'])
  if (!t.ok) return { lineas: [], errores: t.errores.map((motivo) => ({ linea: 1, motivo })) }
  const errores: { linea: number; motivo: string }[] = []
  const por = new Map<string, LineaSaldo>()
  const hayDebeHaber = t.filas.some((f) => f.valores.debe !== undefined || f.valores.haber !== undefined)
  const haySaldo = t.filas.some((f) => f.valores.saldo !== undefined)
  if (!hayDebeHaber && !haySaldo) return { lineas: [], errores: [{ linea: 1, motivo: 'faltan columnas: usa `debe` y `haber`, o `saldo` (+ deudor, − acreedor)' }] }
  for (const { linea, valores: v } of t.filas) {
    const cuenta = v.cuenta.replace(/\s/g, '')
    if (!/^[1-9][0-9]{2,11}$/.test(cuenta)) { errores.push({ linea, motivo: `cuenta inválida «${v.cuenta}»` }); continue }
    let debe: Centimos | null = 0, haber: Centimos | null = 0
    if (hayDebeHaber) {
      debe = v.debe ? importeACentimos(v.debe) : 0
      haber = v.haber ? importeACentimos(v.haber) : 0
      if (debe === null || haber === null) { errores.push({ linea, motivo: `cuenta ${cuenta}: importe no válido` }); continue }
      if (debe < 0 || haber < 0) { errores.push({ linea, motivo: `cuenta ${cuenta}: debe y haber no pueden ser negativos` }); continue }
    } else {
      const s = v.saldo ? importeACentimos(v.saldo) : null
      if (s === null) { errores.push({ linea, motivo: `cuenta ${cuenta}: saldo vacío o no válido` }); continue }
      if (s >= 0) debe = s; else haber = -s
    }
    if (debe === 0 && haber === 0) continue // saldo cero: no genera apunte
    const x = por.get(cuenta) ?? { cuenta, debe: 0, haber: 0 }
    x.debe += debe; x.haber += haber
    por.set(cuenta, x)
  }
  return { lineas: [...por.values()].sort((a, b) => (a.cuenta < b.cuenta ? -1 : 1)), errores }
}

/** Asiento de apertura: una cuenta con debe Y haber se neta en el lado mayor (un apunte es debe XOR haber). */
export function asientoAperturaInicial(texto: string, plan: PlanDeCuentas, ejercicio: EjercicioContable, fecha: string): ResultadoSaldos {
  const { lineas, errores } = leerSaldosCsv(texto)
  const apuntes = lineas.map((l) => ({ cuenta: l.cuenta, debe: Math.max(0, l.debe - l.haber), haber: Math.max(0, l.haber - l.debe) })).filter((a) => a.debe + a.haber > 0)
  const totalDebe = apuntes.reduce((s, a) => s + a.debe, 0), totalHaber = apuntes.reduce((s, a) => s + a.haber, 0)
  const fallo = (extra: { linea: number; motivo: string }[]): ResultadoSaldos => ({ ok: false, errores: [...errores, ...extra], lineas, totalDebe, totalHaber, diferencia: totalDebe - totalHaber })
  if (!esFechaISO(fecha)) return fallo([{ linea: 0, motivo: 'la fecha de apertura no es válida' }])
  if (errores.length) return fallo([])
  if (apuntes.length === 0) return fallo([{ linea: 0, motivo: 'no hay ningún saldo distinto de cero' }])
  if (totalDebe !== totalHaber) return fallo([{ linea: 0, motivo: `el balance no cuadra: debe ${totalDebe} ≠ haber ${totalHaber} céntimos (diferencia ${totalDebe - totalHaber})` }])
  try {
    const asiento = crearAsiento({
      fecha, ejercicio: ejercicio.anio, concepto: `Asiento de apertura (saldos iniciales) del ejercicio ${ejercicio.anio}`,
      apuntes, origen: { tipo: 'apertura', ref: refAperturaInicial(ejercicio.anio) },
    }, plan, ejercicio)
    return { ok: true, lineas, totalDebe, totalHaber, asiento }
  } catch (e) {
    if (e instanceof ErrorContable) return fallo(e.message.split('; ').map((motivo) => ({ linea: 0, motivo })))
    throw e
  }
}
