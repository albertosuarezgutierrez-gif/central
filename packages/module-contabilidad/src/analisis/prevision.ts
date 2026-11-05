// Previsión de tesorería a 90 días: saldo de caja (57x) + vencimientos conocidos. PURO, reloj inyectado.
// Sin saldo de caja (ningún apunte en 57x) → `null`: no se inventa un saldo inicial de 0.
import { aFechaISO, sumarDias } from './periodos.ts'
import type { Vencimiento } from './antiguedad.ts'

export type PuntoPrevision = { fecha: string; saldo: number; movimiento: number }
export type Prevision = {
  saldoInicial: number
  puntos: PuntoPrevision[]
  /** false = no hay ningún vencimiento conocido: la línea es plana (solo el saldo actual), NO una promesa de que no habrá movimientos. */
  conVencimientos: boolean
  saldoMinimo: number
  /** Primera fecha de la previsión con saldo < 0 (null si nunca baja de 0). */
  primerNegativo: string | null
  horizonteDias: number
}

export function previsionTesoreria(entrada: {
  saldoCaja: number | null
  vencimientos: readonly Vencimiento[]
  hoy: Date
  dias?: number
  /** Separación entre puntos en días (7 por defecto). */
  paso?: number
}): Prevision | null {
  if (entrada.saldoCaja === null) return null
  const dias = entrada.dias ?? 90
  const paso = entrada.paso ?? 7
  if (!Number.isInteger(dias) || dias < 1 || dias > 365 || !Number.isInteger(paso) || paso < 1) throw new RangeError('dias/paso no válidos')
  const hoy = aFechaISO(entrada.hoy)
  const limite = sumarDias(hoy, dias)
  const dentro = entrada.vencimientos.filter((v) => v.fecha <= limite)
  const offsets: number[] = []
  for (let d = 0; d < dias; d += paso) offsets.push(d)
  offsets.push(dias)
  let previo = hoy
  let saldo = entrada.saldoCaja
  const puntos: PuntoPrevision[] = offsets.map((d) => {
    const fecha = sumarDias(hoy, d)
    // Lo vencido hasta hoy (incluido) entra en el día 0; después, lo que cae en (punto anterior, este punto].
    const mov = dentro.filter((v) => (d === 0 ? v.fecha <= fecha : v.fecha > previo && v.fecha <= fecha)).reduce((t, v) => t + v.importe, 0)
    saldo += mov
    previo = fecha
    return { fecha, saldo, movimiento: mov }
  })
  return {
    saldoInicial: entrada.saldoCaja,
    puntos,
    conVencimientos: dentro.length > 0,
    saldoMinimo: Math.min(...puntos.map((p) => p.saldo)),
    primerNegativo: puntos.find((p) => p.saldo < 0)?.fecha ?? null,
    horizonteDias: dias,
  }
}
