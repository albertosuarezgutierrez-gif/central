// Parser PURO del fichero Norma 43 / Cuaderno 43 (AEB-43). COPIA de apps/plataforma/lib/norma43.ts (plataforma no se toca aquí):
// ⚠️ pendiente deduplicar — cuando plataforma pase a consumir este paquete se borra su copia. Diferencia deliberada: importes en
// CÉNTIMOS enteros (la original usa euros en coma flotante; regla del monorepo: dinero sin float).
//
// Formato: registros de ancho fijo identificados por los 2 primeros dígitos.
//   11 cabecera de cuenta · 22 movimiento · 23 complementario de concepto (hasta 5) · 33 fin de cuenta · 88 fin de fichero.
// Clave D/H: 1 = debe/cargo (negativo), 2 = haber/abono (positivo).
import type { ExtractoBanco, MovimientoBanco } from './tipos.ts'

// YYMMDD → 'YYYY-MM-DD' (siglo 2000; los extractos son recientes). null si no es una fecha real.
function parseFecha(yymmdd: string): string | null {
  const s = yymmdd.trim()
  if (!/^\d{6}$/.test(s)) return null
  const iso = `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

/** Importe de 14 dígitos en céntimos + clave D/H → céntimos con signo. */
function parseImporte(claveDH: string, catorce: string): number {
  const cents = parseInt(catorce.replace(/\D/g, '') || '0', 10)
  return claveDH.trim() === '1' ? -cents : cents
}

// posiciones 1-indexadas como en la norma
const campo = (linea: string, desde: number, largo: number) => linea.slice(desde - 1, desde - 1 + largo)

export function parseNorma43(contenido: string): ExtractoBanco[] {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const extractos: ExtractoBanco[] = []
  let actual: ExtractoBanco | null = null
  let mov: MovimientoBanco | null = null

  const cerrarMov = () => {
    if (actual && mov) {
      mov.concepto = mov.concepto.trim()
      mov.contraparte = mov.contraparte.trim()
      mov.referencia = mov.referencia.trim()
      actual.movimientos.push(mov)
    }
    mov = null
  }

  for (const linea of lineas) {
    const tipo = linea.slice(0, 2)
    if (tipo === '11') {
      cerrarMov()
      if (actual) extractos.push(actual)
      actual = {
        ccc: `${campo(linea, 3, 4)}${campo(linea, 7, 4)}${campo(linea, 11, 10)}`.trim(),
        banco: campo(linea, 52, 26).trim(),
        divisa: campo(linea, 48, 3).trim() || 'EUR',
        saldoInicial: parseImporte(campo(linea, 33, 1), campo(linea, 34, 14)),
        saldoFinal: null,
        fechaInicio: parseFecha(campo(linea, 21, 6)),
        fechaFin: parseFecha(campo(linea, 27, 6)),
        movimientos: [],
      }
    } else if (tipo === '22' && actual) {
      cerrarMov()
      const referencia = [campo(linea, 43, 10).trim(), campo(linea, 53, 12).trim(), campo(linea, 65, 16).trim()].filter(Boolean).join(' ')
      mov = {
        fechaOperacion: parseFecha(campo(linea, 11, 6)) ?? '',
        fechaValor: parseFecha(campo(linea, 17, 6)) ?? '',
        importe: parseImporte(campo(linea, 28, 1), campo(linea, 29, 14)),
        conceptoComun: campo(linea, 23, 2).trim(),
        concepto: '',
        contraparte: '',
        referencia,
      }
    } else if (tipo === '23' && actual && mov) {
      const c1 = campo(linea, 5, 38).trim()
      const c2 = campo(linea, 43, 38).trim()
      if (!mov.contraparte) mov.contraparte = c1
      mov.concepto = `${mov.concepto} ${[c1, c2].filter(Boolean).join(' ')}`.trim()
    } else if (tipo === '33' && actual) {
      cerrarMov()
      actual.saldoFinal = parseImporte(campo(linea, 59, 1), campo(linea, 60, 14))
    } else if (tipo === '88') {
      cerrarMov()
      if (actual) { extractos.push(actual); actual = null }
    }
  }
  cerrarMov()
  if (actual) extractos.push(actual)
  return extractos
}
