// lib/sivra/facturas/csv.ts — exportación CSV del libro de facturas a huéspedes. PURO.
// Formato para Excel en español: separador «;», coma decimal, sin símbolo € (columna numérica), BOM UTF-8.
// Celdas que empiezan por = + - @ se prefijan con «'» (inyección de fórmulas: el nombre lo escribe el huésped).

export type FilaLibro = {
  numeroCompleto: string | null
  fechaExpedicion: string | null
  estado: string
  piso: string
  reservationId: string
  receptorNombre: string
  receptorNif: string
  receptorPais: string
  base: number | null
  tipoIva: number | null
  cuota: number | null
  total: number
}

const num = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','))

export function celdaCsv(v: string): string {
  let s = v ?? ''
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function libroCsv(filas: FilaLibro[]): string {
  const cab = ['Número', 'Fecha expedición', 'Estado', 'Piso', 'Reserva', 'Destinatario', 'NIF/Id. fiscal', 'País', 'Base', 'Tipo IVA', 'Cuota IVA', 'Total']
  const lineas = filas.map((f) => [
    celdaCsv(f.numeroCompleto ?? '(borrador)'), celdaCsv(f.fechaExpedicion ?? ''), celdaCsv(f.estado), celdaCsv(f.piso),
    celdaCsv(f.reservationId), celdaCsv(f.receptorNombre), celdaCsv(f.receptorNif), celdaCsv(f.receptorPais),
    num(f.base), num(f.tipoIva), num(f.cuota), num(f.total),
  ].join(';'))
  return `﻿${[cab.join(';'), ...lineas].join('\r\n')}\r\n`
}

/** Totales del listado. Solo suman las EMITIDAS/ENVIADAS (un borrador no es una factura). Base/cuota de un borrador sin IVA no existen. */
export function totalesLibro(filas: FilaLibro[]): { base: number; cuota: number; total: number; n: number } {
  let b = 0, c = 0, t = 0, n = 0
  for (const f of filas) {
    if (f.estado !== 'emitida' && f.estado !== 'enviada') continue
    b += Math.round((f.base ?? 0) * 100); c += Math.round((f.cuota ?? 0) * 100); t += Math.round(f.total * 100); n++
  }
  return { base: b / 100, cuota: c / 100, total: t / 100, n }
}
