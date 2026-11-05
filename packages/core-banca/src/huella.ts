// Huella estable de un movimiento para DEDUPLICAR reimportaciones. SHA-256 de los campos que identifican el apunte.
// Dos movimientos idénticos dentro del MISMO fichero (dos cafés de 1,50 € el mismo día) son legítimos: se distinguen con un ordinal
// por orden de aparición, de modo que reimportar el mismo fichero (o uno que lo solape) da las mismas huellas y no duplica.
import { createHash } from 'node:crypto'
import type { MovimientoBanco } from './tipos.ts'

export function huellaBase(cuentaRef: string, m: MovimientoBanco): string {
  const base = [cuentaRef.trim(), m.fechaOperacion, m.fechaValor, String(m.importe), m.conceptoComun, m.concepto.replace(/\s+/g, ' ').trim(), m.referencia.trim(),
    m.saldoPosterior !== undefined ? String(m.saldoPosterior) : ''].join('|')
  return createHash('sha256').update(base).digest('hex')
}

/** Huella de cada movimiento (mismo orden) con ordinal para los repetidos del fichero. */
export function huellasDeMovimientos(cuentaRef: string, movs: readonly MovimientoBanco[]): string[] {
  const vistos = new Map<string, number>()
  return movs.map((m) => {
    const h = huellaBase(cuentaRef, m)
    const n = (vistos.get(h) ?? 0) + 1
    vistos.set(h, n)
    return n === 1 ? h : createHash('sha256').update(`${h}#${n}`).digest('hex')
  })
}
