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

type Cols = { fecha: number; valor: number; concepto: number; detalle: number; importe: number; saldo: number }

// Localiza los índices de columna a partir de una fila de cabecera. Tolerante a los
// formatos de Kutxa (fecha, concepto, fecha valor, importe, saldo) y BBVA (fecha valor,
// fecha, concepto, movimiento, importe, …, disponible).
function mapColumnas(fila: unknown[]): Cols | null {
  const buscar = (pred: (t: string) => boolean) => fila.findIndex(c => pred(norm(c)))

  // Columnas de fecha: la que lleva "valor" es fecha valor; la otra es la de operación.
  const fechas: number[] = []
  fila.forEach((c, i) => { if (norm(c).startsWith('fecha')) fechas.push(i) })
  const valor = fechas.find(i => norm(fila[i]).includes('valor')) ?? -1
  const fecha = fechas.find(i => !norm(fila[i]).includes('valor')) ?? valor

  const concepto = buscar(t => t.includes('concepto') || t.includes('descrip'))
  const detalle = buscar(t => t.includes('movimiento') || t.includes('observ') || t.includes('detalle') || t.includes('beneficiario') || t.includes('ordenante'))
  const importe = buscar(t => t.includes('importe') || t === 'cargo/abono')
  const saldo = buscar(t => t.includes('saldo') || t.includes('disponible'))

  return fecha >= 0 && importe >= 0 && (concepto >= 0 || detalle >= 0)
    ? { fecha, valor, concepto, detalle, importe, saldo }
    : null
}

export function parseExtractoXls(
  buf: Buffer,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const filas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })

  // Busca la fila de cabecera (la que tiene fecha+importe+concepto/detalle).
  let cols: Cols | null = null
  let cabecera = -1
  for (let i = 0; i < filas.length; i++) {
    const c = mapColumnas(filas[i])
    if (c) { cols = c; cabecera = i; break }
  }
  if (!cols) return []

  const texto = (fila: unknown[]) => [
    cols!.concepto >= 0 ? String(fila[cols!.concepto] ?? '').trim() : '',
    cols!.detalle >= 0 ? String(fila[cols!.detalle] ?? '').trim() : '',
  ].filter(Boolean).join(' · ').trim()

  const movimientos: MovimientoN43[] = []
  for (let i = cabecera + 1; i < filas.length; i++) {
    const fila = filas[i]
    const fecha = aIso(fila[cols.fecha])
    const importe = num(fila[cols.importe])
    if (!fecha || importe == null) continue   // salta títulos/pie/filas vacías
    const saldoPosterior = cols.saldo >= 0 ? num(fila[cols.saldo]) : null
    const concepto = texto(fila)
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: cols.valor >= 0 ? (aIso(fila[cols.valor]) || fecha) : fecha,
      importe,
      conceptoComun: '',
      concepto,
      contraparte: concepto.split(' · ')[0] || concepto,
      referencia: '',
      saldoPosterior: saldoPosterior ?? undefined,
    })
  }
  if (movimientos.length === 0) return []

  // Saldo actual = saldo del movimiento más reciente (robusto al orden del fichero:
  // Kutxa lista ascendente, BBVA descendente). Fechas = min/max.
  const masReciente = movimientos.reduce((a, b) => Date.parse(b.fechaOperacion) >= Date.parse(a.fechaOperacion) ? b : a)
  const fechasOrden = movimientos.map(m => m.fechaOperacion).filter(Boolean).sort()
  return [{
    ccc: (opts.iban || 'CUENTA-IMPORTADA').trim(),
    banco: opts.banco || 'Importado (Excel)',
    divisa: 'EUR',
    saldoInicial: 0,
    saldoFinal: masReciente.saldoPosterior ?? null,
    fechaInicio: fechasOrden[0] || null,
    fechaFin: fechasOrden[fechasOrden.length - 1] || null,
    movimientos,
  }]
}
