// lib/sivra/pl-rango-logica.ts — lógica PURA del P&L por RANGO de meses (sin BD).
//
// El P&L de los pisos es de CAJA DEL MES (`pl-mensual.ts`: lavandería repartida por mes, facturas
// de Sique Brilla por caja), así que el rango va de mes a mes — un rango por días partiría gastos
// mensuales y mentiría. Aquí vive lo testeable: expandir el rango, agregar meses y las variaciones,
// con la regla de la casa: «no hay base» = null, nunca un 0 inventado.
import type { PLMensual, PLPiso, PLGastosPiso } from './pl-mensual'

/** Tope de meses por petición: 24 cubre el heatmap de estacionalidad y evita rangos absurdos. */
export const MAX_MESES_RANGO = 24

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/

export function esMesValido(mes: string): boolean {
  return RE_MES.test(mes)
}

/**
 * Lista de meses 'YYYY-MM' de `desde` a `hasta`, ambos incluidos.
 * null si el formato es inválido, el rango está invertido o supera el tope.
 */
export function mesesDelRango(desde: string, hasta: string, tope = MAX_MESES_RANGO): string[] | null {
  if (!esMesValido(desde) || !esMesValido(hasta)) return null
  if (desde > hasta) return null
  const out: string[] = []
  let [y, m] = desde.split('-').map(Number)
  for (;;) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    out.push(mes)
    if (mes === hasta) return out
    if (out.length >= tope) return null // se pasó del tope sin llegar a `hasta`
    m++
    if (m > 12) { m = 1; y++ }
  }
}

/** El mismo mes N años antes: '2026-07' → '2025-07'. */
export function mesAniosAtras(mes: string, anios = 1): string {
  const [y, m] = mes.split('-')
  return `${Number(y) - anios}-${m}`
}

/** Días naturales de un mes 'YYYY-MM'. */
export function diasDelMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function gastosVacios(): PLGastosPiso {
  return {
    lavanderia: 0,
    lavanderiaDetalle: { giraldillo: 0, siqueBrilla: 0 },
    limpieza: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0, total: 0,
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Agrega los meses de un rango en un P&L por piso (mismas columnas que un mes suelto).
 * El nombre/aforo del piso sale de su aparición más reciente; el margen se recalcula
 * sobre el agregado (nunca se promedian porcentajes).
 */
export function agregarPisos(meses: PLMensual[]): PLPiso[] {
  const acc = new Map<string, PLPiso>()
  for (const mes of meses) {
    for (const p of mes.pisos) {
      const a = acc.get(p.propertyId) ?? {
        propertyId: p.propertyId, nombre: p.nombre, maxHuespedes: p.maxHuespedes,
        ingresos: 0, reservas: 0, noches: 0, nochesSinDato: 0,
        gastos: gastosVacios(), resultado: 0, margen: 0,
      }
      a.nombre = p.nombre
      a.maxHuespedes = p.maxHuespedes
      a.ingresos = r2(a.ingresos + p.ingresos)
      a.reservas += p.reservas
      a.noches += p.noches ?? 0
      a.nochesSinDato += p.nochesSinDato ?? 0
      for (const k of ['lavanderia', 'limpieza', 'alquiler', 'suministros', 'comunidad', 'otros', 'total'] as const) {
        a.gastos[k] = r2(a.gastos[k] + p.gastos[k])
      }
      a.gastos.lavanderiaDetalle.giraldillo = r2(a.gastos.lavanderiaDetalle.giraldillo + (p.gastos.lavanderiaDetalle?.giraldillo ?? 0))
      a.gastos.lavanderiaDetalle.siqueBrilla = r2(a.gastos.lavanderiaDetalle.siqueBrilla + (p.gastos.lavanderiaDetalle?.siqueBrilla ?? 0))
      acc.set(p.propertyId, a)
    }
  }
  const out = [...acc.values()]
  for (const a of out) {
    a.resultado = r2(a.ingresos - a.gastos.total)
    a.margen = a.ingresos > 0 ? Math.round((a.resultado / a.ingresos) * 100) : 0
  }
  return out.sort((x, y) => x.nombre.localeCompare(y.nombre))
}

/**
 * Variación % contra el periodo anterior. null cuando NO se puede afirmar nada:
 * sin dato anterior o base ≤ 0 (una variación sobre base 0 es una invención).
 */
export function variacionPct(actual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior <= 0) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

/**
 * ADR (precio medio por noche): null si no hay noches con dato — jamás dividir entre 0 ni
 * fingir precisión cuando parte de las noches no consta.
 */
export function adr(ingresos: number, noches: number): number | null {
  if (noches <= 0) return null
  return r2(ingresos / noches)
}

/**
 * Ocupación % del periodo: noches vendidas (atribuidas por mes de ENTRADA, mismo criterio que el
 * ingreso) sobre las noches disponibles del rango. null sin noches disponibles.
 */
export function ocupacionPct(nochesVendidas: number, diasDisponibles: number): number | null {
  if (diasDisponibles <= 0) return null
  return Math.round((nochesVendidas / diasDisponibles) * 100)
}
