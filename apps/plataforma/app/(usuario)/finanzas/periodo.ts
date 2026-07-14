// Helpers PUROS del selector de intervalo compartido. SIN 'use client' a propósito: así los
// server components (p. ej. /banca) pueden llamar a periodoLabel() sin el error de runtime
// "Attempted to call periodoLabel() from the server but periodoLabel is on the client".
// El componente cliente IntervaloSelector.tsx importa de aquí; no dupliques la lógica.

export type Periodo = { year: number; quarter: number; desde: string; hasta: string }

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function periodoLabel(p: Periodo): string {
  if (p.desde && p.hasta) {
    // Si el rango es exactamente un mes natural, etiquétalo como mes.
    const m = Number(p.desde.slice(5, 7))
    const esMesEntero = p.desde.slice(8) === '01' &&
      p.hasta === `${p.desde.slice(0, 7)}-${String(new Date(Number(p.desde.slice(0, 4)), m, 0).getDate()).padStart(2, '0')}`
    if (esMesEntero) return `${MESES[m - 1]} ${p.desde.slice(0, 4)}`
    return `${p.desde} → ${p.hasta}`
  }
  return p.quarter === 0 ? `Año ${p.year}` : `Q${p.quarter} ${p.year}`
}
