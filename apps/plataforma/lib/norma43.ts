// Parser PURO del fichero Norma 43 / Cuaderno 43 (AEB-43): extracto de cuenta
// que cualquier banco español deja descargar. Sin red ni BD → testeable con
// `node --test`. La persistencia (Prisma) vive en lib/banca.ts.
//
// Formato: registros de ancho fijo identificados por los 2 primeros dígitos.
//   11 = cabecera de cuenta (CCC, saldo inicial, fechas)
//   22 = movimiento (fechas, clave D/H, importe en céntimos, referencias)
//   23 = complementario de concepto (texto libre; hasta 5 por movimiento)
//   33 = fin de cuenta (saldo final, nº apuntes)
//   88 = fin de fichero
// Importes en céntimos (14 díg.); clave D/H: 1 = debe/cargo (negativo), 2 = haber/abono (positivo).

import { createHash } from 'node:crypto'

export type MovimientoN43 = {
  fechaOperacion: string   // 'YYYY-MM-DD'
  fechaValor: string       // 'YYYY-MM-DD'
  importe: number          // negativo = cargo, positivo = abono
  conceptoComun: string    // código concepto común (2 díg.)
  concepto: string         // texto libre concatenado de los registros 23
  contraparte: string      // primera línea de concepto (suele ser el nombre)
  referencia: string       // nº documento + referencias
  saldoPosterior?: number  // saldo tras el apunte (Excel lo trae; N43 no)
}

export type ExtractoN43 = {
  ccc: string              // entidad+oficina+cuenta (18 díg.) — clave de casado
  banco: string            // nombre abreviado del registro 11
  divisa: string
  saldoInicial: number
  saldoFinal: number | null
  fechaInicio: string | null
  fechaFin: string | null
  movimientos: MovimientoN43[]
}

// YYMMDD → 'YYYY-MM-DD' (asume siglo 2000; los extractos son recientes).
function parseFecha(yymmdd: string): string | null {
  const s = yymmdd.trim()
  if (!/^\d{6}$/.test(s)) return null
  const yy = s.slice(0, 2), mm = s.slice(2, 4), dd = s.slice(4, 6)
  return `20${yy}-${mm}-${dd}`
}

// Importe de 14 dígitos en céntimos + clave D/H → euros con signo.
function parseImporte(claveDH: string, catorce: string): number {
  const cents = parseInt(catorce.replace(/\D/g, '') || '0', 10)
  const signo = claveDH.trim() === '1' ? -1 : 1   // 1 = debe (cargo)
  return (signo * cents) / 100
}

function field(line: string, from: number, len: number): string {
  // posiciones 1-indexadas como en la norma
  return line.slice(from - 1, from - 1 + len)
}

export function parseNorma43(contenido: string): ExtractoN43[] {
  const lineas = contenido.split(/\r?\n/).filter(l => l.trim().length > 0)
  const extractos: ExtractoN43[] = []
  let actual: ExtractoN43 | null = null
  let movActual: MovimientoN43 | null = null

  const cerrarMov = () => {
    if (actual && movActual) {
      movActual.concepto = movActual.concepto.trim()
      movActual.contraparte = movActual.contraparte.trim()
      movActual.referencia = movActual.referencia.trim()
      actual.movimientos.push(movActual)
      movActual = null
    }
  }

  for (const linea of lineas) {
    const tipo = linea.slice(0, 2)

    if (tipo === '11') {
      cerrarMov()
      if (actual) extractos.push(actual)
      const entidad = field(linea, 3, 4)
      const oficina = field(linea, 7, 4)
      const cuenta = field(linea, 11, 10)
      actual = {
        ccc: `${entidad}${oficina}${cuenta}`.trim(),
        banco: field(linea, 52, 26).trim(),
        divisa: field(linea, 48, 3).trim() || 'EUR',
        saldoInicial: parseImporte(field(linea, 33, 1), field(linea, 34, 14)),
        saldoFinal: null,
        fechaInicio: parseFecha(field(linea, 21, 6)),
        fechaFin: parseFecha(field(linea, 27, 6)),
        movimientos: [],
      }
    } else if (tipo === '22' && actual) {
      cerrarMov()
      const numDoc = field(linea, 43, 10).trim()
      const ref1 = field(linea, 53, 12).trim()
      const ref2 = field(linea, 65, 16).trim()
      movActual = {
        fechaOperacion: parseFecha(field(linea, 11, 6)) || '',
        fechaValor: parseFecha(field(linea, 17, 6)) || '',
        importe: parseImporte(field(linea, 28, 1), field(linea, 29, 14)),
        conceptoComun: field(linea, 23, 2).trim(),
        concepto: '',
        contraparte: '',
        referencia: [numDoc, ref1, ref2].filter(Boolean).join(' '),
      }
    } else if (tipo === '23' && actual && movActual) {
      // dos campos de concepto de 38 caracteres
      const c1 = field(linea, 5, 38).trim()
      const c2 = field(linea, 43, 38).trim()
      const trozo = [c1, c2].filter(Boolean).join(' ')
      if (!movActual.contraparte) movActual.contraparte = c1
      movActual.concepto = `${movActual.concepto} ${trozo}`.trim()
    } else if (tipo === '33' && actual) {
      cerrarMov()
      actual.saldoFinal = parseImporte(field(linea, 59, 1), field(linea, 60, 14))
    } else if (tipo === '88') {
      cerrarMov()
      if (actual) { extractos.push(actual); actual = null }
    }
  }

  cerrarMov()
  if (actual) extractos.push(actual)
  return extractos
}

// Hash estable de un movimiento para deduplicar reimportaciones del mismo extracto.
// El importador añade un ordinal si dos movimientos comparten hash base.
export function dedupeHash(m: MovimientoN43): string {
  const saldo = m.saldoPosterior != null ? m.saldoPosterior.toFixed(2) : ''
  const base = [m.fechaOperacion, m.fechaValor, m.importe.toFixed(2), m.conceptoComun, m.concepto, m.referencia, saldo].join('|')
  return createHash('sha1').update(base).digest('hex')
}
