// Importador de extractos en EXCEL (.xls/.xlsx). Muchos bancos españoles (Kutxa,
// BBVA, Santander, Sabadell…) exportan los movimientos en Excel, no en Norma 43.
// Produce el MISMO tipo `ExtractoN43` que el parser de Norma 43, así la persistencia
// (lib/banca.ts) y la UI no cambian. Detección de columnas por nombre de cabecera
// (tolerante al orden y a filas de título/pie).

import * as XLSX from 'xlsx'
import type { ExtractoN43, MovimientoN43 } from './norma43'

// 'DD/MM/YYYY' (o Date) → 'YYYY-MM-DD'. '' si no parsea.
function aIso(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return ''
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Número tolerante a formato es-ES ("1.234,56") y a símbolos. null si no es número.
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v ?? '').trim().replace(/[\s€]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim()

// Localiza los índices de columna a partir de una fila de cabecera.
function mapColumnas(fila: unknown[]): { fecha: number; concepto: number; importe: number; saldo: number; valor: number } | null {
  let fecha = -1, concepto = -1, importe = -1, saldo = -1, valor = -1
  fila.forEach((c, i) => {
    const t = norm(c)
    if (t.includes('valor') && fecha >= 0) valor = i
    else if (t.startsWith('fecha') && fecha < 0) fecha = i
    else if (t.includes('concepto') || t.includes('descrip')) concepto = i
    else if (t.includes('importe') || t === 'cargo/abono') importe = i
    else if (t.includes('saldo')) saldo = i
  })
  return fecha >= 0 && concepto >= 0 && importe >= 0 ? { fecha, concepto, importe, saldo, valor } : null
}

export function parseExtractoXls(
  buf: Buffer,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const filas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })

  // Busca la fila de cabecera (la que tiene fecha+concepto+importe).
  let cols: ReturnType<typeof mapColumnas> = null
  let cabecera = -1
  for (let i = 0; i < filas.length; i++) {
    const c = mapColumnas(filas[i])
    if (c) { cols = c; cabecera = i; break }
  }
  if (!cols) return []

  const movimientos: MovimientoN43[] = []
  for (let i = cabecera + 1; i < filas.length; i++) {
    const fila = filas[i]
    const fecha = aIso(fila[cols.fecha])
    const importe = num(fila[cols.importe])
    if (!fecha || importe == null) continue   // salta títulos/pie/filas vacías
    const saldoPosterior = cols.saldo >= 0 ? num(fila[cols.saldo]) : null
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: cols.valor >= 0 ? (aIso(fila[cols.valor]) || fecha) : fecha,
      importe,
      conceptoComun: '',
      concepto: String(fila[cols.concepto] ?? '').trim(),
      contraparte: String(fila[cols.concepto] ?? '').trim(),
      referencia: '',
      saldoPosterior: saldoPosterior ?? undefined,
    })
  }
  if (movimientos.length === 0) return []

  const saldoFinal = movimientos[movimientos.length - 1].saldoPosterior ?? null
  return [{
    ccc: (opts.iban || 'CUENTA-IMPORTADA').trim(),
    banco: opts.banco || 'Importado (Excel)',
    divisa: 'EUR',
    saldoInicial: 0,
    saldoFinal,
    fechaInicio: movimientos[0].fechaOperacion || null,
    fechaFin: movimientos[movimientos.length - 1].fechaOperacion || null,
    movimientos,
  }]
}
