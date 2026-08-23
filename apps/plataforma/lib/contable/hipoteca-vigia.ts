// apps/plataforma/lib/contable/hipoteca-vigia.ts
// Vigía de hipoteca del agente contable: detecta desde los movimientos bancarios (a) un CAMBIO
// de cuota en un préstamo (suele significar revisión de tipo o bonificación perdida/recuperada)
// y (b) que la ficha de `patrimonio_activos` se quede desincronizada con lo que el banco cobra
// de verdad. Puro y testeado; las consultas viven en proactivo.ts.
//
// Regla de la casa: sin movimientos de cuota NO se afirma nada («no hay datos» ≠ «todo en
// orden») — simplemente no se emite línea. Solo se habla cuando hay evidencia positiva.
import { eur } from '../dinero.ts'

export type CuotaMov = { fecha: string; importe: number; concepto: string }
export type FichaHipoteca = {
  id: string
  nombre: string
  cuotaMensual: number | null
  notas: string | null
}

// Referencia del préstamo dentro del concepto bancario, p.ej. "CUOTA PTMO 856289293-5".
export function refPrestamo(concepto: string): string | null {
  const m = /CUOTA\s+PTMO\.?\s+([0-9][0-9-]*)/i.exec(concepto)
  return m ? m[1] : null
}

const mismaCuota = (a: number, b: number) => Math.abs(a - b) < 0.005

// Movimientos de cuota (importe negativo en banca) → avisos. `movs` puede venir en cualquier
// orden; se agrupa por préstamo y se ordena por fecha.
export function avisosHipoteca(movs: CuotaMov[], fichas: FichaHipoteca[]): string[] {
  const porRef = new Map<string, CuotaMov[]>()
  for (const mov of movs) {
    const ref = refPrestamo(mov.concepto)
    if (!ref) continue
    const lista = porRef.get(ref) ?? []
    lista.push(mov)
    porRef.set(ref, lista)
  }

  const avisos: string[] = []
  for (const [ref, lista] of porRef) {
    lista.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    const ultima = Math.abs(lista[0].importe)
    const anterior = lista.length > 1 ? Math.abs(lista[1].importe) : null

    if (anterior !== null && !mismaCuota(ultima, anterior)) {
      avisos.push(
        `🏦 La cuota del préstamo ${ref} ha cambiado: ${eur(anterior)} → ${eur(ultima)} (recibo del ${lista[0].fecha}). ` +
          `Suele ser revisión de tipo o una bonificación perdida/recuperada — conviene preguntar al banco el porqué.`,
      )
    }

    // Ficha de patrimonio del préstamo (la referencia va en las notas del activo).
    const ficha = fichas.find((f) => f.notas?.includes(ref))
    if (ficha && ficha.cuotaMensual !== null && !mismaCuota(ficha.cuotaMensual, ultima)) {
      avisos.push(
        `🏦 La ficha de patrimonio de «${ficha.nombre}» tiene cuota ${eur(ficha.cuotaMensual)} pero el banco cobra ${eur(ultima)} — actualizar patrimonio_activos (${ficha.id}).`,
      )
    }
  }
  return avisos
}
