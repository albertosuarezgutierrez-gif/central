// Importador del PDF de "Movimientos de tarjeta" de Kutxabank (visa dual). Produce el
// MISMO tipo `ExtractoN43` que Norma 43 / Excel, así la persistencia (lib/banca.ts) y el
// dedupe no cambian. El parseo del TEXTO es puro (testeable con `node --test`); la
// extracción PDF→texto usa pdf-parse en un wrapper aparte.
//
// Formato de línea (texto extraído del PDF):
//   cargo:  `19/06/2026 ******2019650302 COMPRA EN LEROY MERLIN SEVILLA -192,39 €`
//   abono:  `01/07/2026 ******2019650302 1.355,24 €PAGO RECIBO 4662032019650302`
// (en los abonos el importe va DELANTE del concepto y el € puede ir pegado al texto).
//
// Claves de diseño:
// - `ccc` = `TARJETA-KUTXA-<últimos 4 del PAN>` → casa con la cuenta ya creada de la
//   tarjeta (unique sociedad_id+iban en cuentas_bancarias), p. ej. `TARJETA-KUTXA-0302`.
// - `fechaValor` = `fechaOperacion` y conceptoComun/referencia/saldo VACÍOS: así el
//   `dedupeHash` coincide byte a byte con las filas ya cargadas de la tarjeta y
//   reimportar el mismo PDF no duplica nada (ON CONFLICT (cuenta, dedupe_hash)).
// - `banco` se deja en null salvo override: el upsert de importarExtracto hace COALESCE,
//   así un reimport NO renombra la cuenta existente (p. ej. `💳 Tarjeta Kutxabank Pilar`).

import type { ExtractoN43, MovimientoN43 } from './norma43'

// '1.234,56' / '-4,17' (formato es-ES) → número. null si no parsea.
function importeEs(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// 'DD/MM/YYYY' → 'YYYY-MM-DD'.
function fechaIso(d: string, m: string, y: string): string {
  return `${y}-${m}-${d}`
}

const RE_LINEA = /^(\d{2})\/(\d{2})\/(\d{4})\s+\*+\d+\s+(.+)$/
const RE_IMPORTE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/
const RE_PAN = /N[uú]mero:\s*(\d{15,19})/i

export function parseTarjetaPdfTexto(
  texto: string,
  opts: { iban?: string; banco?: string } = {},
): ExtractoN43[] {
  const pan = texto.match(RE_PAN)?.[1] ?? null
  const movimientos: MovimientoN43[] = []
  let fechaMin: string | null = null
  let fechaMax: string | null = null

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    const m = linea.match(RE_LINEA)
    if (!m) continue
    const [, dd, mm, yyyy, resto] = m
    const imp = resto.match(RE_IMPORTE)
    if (!imp) continue
    const importe = importeEs(imp[1])
    if (importe === null) continue
    const concepto = resto.replace(imp[0], ' ').replace(/\s+/g, ' ').trim()
    if (!concepto) continue
    const fecha = fechaIso(dd, mm, yyyy)
    if (!fechaMin || fecha < fechaMin) fechaMin = fecha
    if (!fechaMax || fecha > fechaMax) fechaMax = fecha
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: fecha,
      importe,
      conceptoComun: '',
      concepto,
      contraparte: '',
      referencia: '',
    })
  }

  if (movimientos.length === 0) return []

  const ccc = opts.iban || (pan ? `TARJETA-KUTXA-${pan.slice(-4)}` : 'TARJETA-PDF')
  return [{
    ccc,
    banco: opts.banco || '',
    divisa: 'EUR',
    saldoInicial: 0,
    saldoFinal: null,
    fechaInicio: fechaMin,
    fechaFin: fechaMax,
    movimientos,
  }]
}

// Wrapper con red de E/S: PDF (Buffer) → texto → parseo puro. Import perezoso del
// implementador interno de pdf-parse (mismo patrón que lib/concursos.ts: la raíz del
// paquete tiene un index con efectos secundarios que rompe el build).
export async function parseExtractoTarjetaPdf(
  buf: Buffer,
  opts: { iban?: string; banco?: string } = {},
): Promise<ExtractoN43[]> {
  const mod: any = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = mod.default ?? mod
  const { text } = await pdfParse(buf)
  return parseTarjetaPdfTexto(String(text ?? ''), opts)
}
