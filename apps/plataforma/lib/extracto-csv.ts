// Importador de extractos en CSV. Cubre dos casos habituales:
//   1) El CSV que EXPORTA la propia plataforma (`/api/banca/export`): separador ';', coma
//      decimal y cabecera
//      "Fecha;Valor;Sociedad;Banco;Concepto;Contraparte;Categoría;Cuenta PGC;Negocio;Importe (€);Conciliado".
//   2) CSV genérico de banco con columnas Fecha / Concepto / Importe (separador ';' o ',').
// Produce el MISMO tipo `ExtractoN43` que el parser de Norma 43 y el de Excel, así la
// persistencia (lib/banca.ts) y la UI no cambian.
//
// Si el CSV trae una columna "Banco" con varios bancos (típico del export de la plataforma,
// que mezcla Kutxabank y BBVA), agrupamos en un `ExtractoN43` por banco — cada uno acaba en su
// propia cuenta importada, en vez de fundir Kutxabank y BBVA en una sola cuenta.

import type { ExtractoN43, MovimientoN43 } from './norma43'

// 'YYYY-MM-DD' o 'DD/MM/YYYY' (tolerante a '-', '/', '.') → 'YYYY-MM-DD'. '' si no parsea.
function aIso(v: unknown): string {
  const s = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return ''
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Número tolerante a formato es-ES ("1.234,56" / "-986,70") y a símbolos. null si no es número.
function num(v: unknown): number | null {
  let s = String(v ?? '').trim().replace(/[\s€]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim()

// Parser CSV tolerante a comillas (RFC4180-ish): campos entrecomillados con separador o salto
// de línea dentro, y comillas internas duplicadas ("").
function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

// Elige el separador a partir de la primera línea (la cabecera casi nunca va entrecomillada,
// y no lleva decimales, así que la coma es segura de contar).
function detectDelim(text: string): string {
  const header = text.split('\n', 1)[0] ?? ''
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 }
  for (const ch of header) if (ch in counts) counts[ch]++
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : ';'
}

type Cols = { fecha: number; valor: number; concepto: number; contraparte: number; importe: number; saldo: number; banco: number }

// Localiza los índices de columna a partir de una fila de cabecera.
function mapColumnas(fila: string[]): Cols | null {
  const buscar = (pred: (t: string) => boolean) => fila.findIndex(c => pred(norm(c)))

  const fechas: number[] = []
  fila.forEach((c, i) => { if (norm(c).startsWith('fecha')) fechas.push(i) })
  const valor = fechas.find(i => norm(fila[i]).includes('valor')) ?? -1
  const fecha = fechas.find(i => !norm(fila[i]).includes('valor')) ?? valor

  const concepto = buscar(t => t.includes('concepto') || t.includes('descrip'))
  const contraparte = buscar(t => t.includes('contraparte') || t.includes('beneficiario') || t.includes('ordenante'))
  const importe = buscar(t => t.includes('importe') || t === 'cargo/abono')
  const saldo = buscar(t => t.includes('saldo') || t.includes('disponible'))
  const banco = buscar(t => t === 'banco' || t === 'entidad')

  return fecha >= 0 && importe >= 0 && (concepto >= 0 || contraparte >= 0)
    ? { fecha, valor, concepto, contraparte, importe, saldo, banco }
    : null
}

// Cierra un grupo de movimientos (mismo banco) en un ExtractoN43.
function cerrarExtracto(movimientos: MovimientoN43[], ccc: string, banco: string): ExtractoN43 {
  const masReciente = movimientos.reduce((a, b) => Date.parse(b.fechaOperacion) >= Date.parse(a.fechaOperacion) ? b : a)
  const fechasOrden = movimientos.map(m => m.fechaOperacion).filter(Boolean).sort()
  return {
    ccc,
    banco,
    divisa: 'EUR',
    saldoInicial: 0,
    saldoFinal: masReciente.saldoPosterior ?? null,
    fechaInicio: fechasOrden[0] || null,
    fechaFin: fechasOrden[fechasOrden.length - 1] || null,
    movimientos,
  }
}

export function parseExtractoCsv(
  buf: Buffer,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  // El export de la plataforma es UTF-8 con BOM; lo quitamos para no ensuciar la 1ª cabecera.
  const text = buf.toString('utf8').replace(/^﻿/, '')
  if (!text.trim()) return []

  const delim = detectDelim(text)
  const filas = parseCsv(text, delim)
  if (filas.length === 0) return []

  // Busca la fila de cabecera (fecha + importe + concepto/contraparte).
  let cols: Cols | null = null
  let cabecera = -1
  for (let i = 0; i < filas.length; i++) {
    const c = mapColumnas(filas[i])
    if (c) { cols = c; cabecera = i; break }
  }
  if (!cols) return []

  // Agrupa por banco (columna "Banco" del export) para no mezclar cuentas de bancos distintos.
  const grupos = new Map<string, MovimientoN43[]>()
  for (let i = cabecera + 1; i < filas.length; i++) {
    const fila = filas[i]
    const fecha = aIso(fila[cols.fecha])
    const importe = num(fila[cols.importe])
    if (!fecha || importe == null) continue   // salta filas de total/pie/vacías

    const concepto = (cols.concepto >= 0 ? String(fila[cols.concepto] ?? '').trim() : '')
      || (cols.contraparte >= 0 ? String(fila[cols.contraparte] ?? '').trim() : '')
    const contraparte = (cols.contraparte >= 0 ? String(fila[cols.contraparte] ?? '').trim() : '')
      || concepto.split(' · ')[0] || concepto
    const saldoPosterior = cols.saldo >= 0 ? num(fila[cols.saldo]) : null
    const bancoFila = cols.banco >= 0 ? String(fila[cols.banco] ?? '').trim() : ''

    const mov: MovimientoN43 = {
      fechaOperacion: fecha,
      fechaValor: cols.valor >= 0 ? (aIso(fila[cols.valor]) || fecha) : fecha,
      importe,
      conceptoComun: '',
      concepto,
      contraparte,
      referencia: '',
      saldoPosterior: saldoPosterior ?? undefined,
    }
    const clave = bancoFila
    const lista = grupos.get(clave)
    if (lista) lista.push(mov)
    else grupos.set(clave, [mov])
  }

  const total = [...grupos.values()].reduce((n, l) => n + l.length, 0)
  if (total === 0) return []

  // Un solo banco (o sin columna Banco): respetamos el iban/banco del formulario si vienen.
  if (grupos.size <= 1) {
    const [bancoNombre, movimientos] = [...grupos.entries()][0]
    const ccc = (opts.iban || (bancoNombre ? `IMPORTADO-${bancoNombre}` : 'CUENTA-IMPORTADA')).trim()
    const banco = opts.banco || bancoNombre || 'Importado (CSV)'
    return [cerrarExtracto(movimientos, ccc, banco)]
  }

  // Varios bancos: una cuenta por banco (el iban del formulario no aplica a varias cuentas).
  return [...grupos.entries()].map(([bancoNombre, movimientos]) =>
    cerrarExtracto(movimientos, `IMPORTADO-${bancoNombre || 'CSV'}`, bancoNombre || 'Importado (CSV)'),
  )
}
