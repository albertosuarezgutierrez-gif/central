// CSV genérico de extractos (el que descarga cualquier banco): separador autodetectado (; , tab), comillas, importes con coma
// decimal, fechas dd/mm/aaaa, y MAPEO de columnas elegido por el usuario (por nombre de cabecera o por posición).
import { fechaAIso, importeACentimos } from './importes.ts'
import type { ExtractoBanco, MovimientoBanco } from './tipos.ts'

export type MapeoCsv = {
  /** Cada campo: nombre de cabecera (sin tildes/mayúsculas) o posición 0-based como número. */
  fecha: string | number
  fechaValor?: string | number
  concepto: string | number
  /** Importe con signo en una sola columna… */
  importe?: string | number
  /** …o dos columnas (cargo/debe y abono/haber, ambas positivas o una vacía). */
  cargo?: string | number
  abono?: string | number
  saldo?: string | number
  referencia?: string | number
  /** Por defecto true: la primera fila es la cabecera. Con false los campos deben ir por posición. */
  cabecera?: boolean
}

export type ErrorFila = { linea: number; motivo: string }
export type ResultadoCsv = { extracto: ExtractoBanco; errores: ErrorFila[]; separador: string }

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function detectarSeparador(texto: string): string {
  const primeras = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5)
  let mejor = ';'
  let max = -1
  for (const sep of [';', '\t', ',']) {
    const n = primeras.reduce((t, l) => t + dividir(l, sep).length - 1, 0)
    if (n > max) { max = n; mejor = sep }
  }
  return mejor
}

/** Divide una línea respetando comillas dobles (con "" como comilla escapada). */
export function dividir(linea: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let dentro = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (dentro) {
      if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++ } else dentro = false } else cur += c
    } else if (c === '"') dentro = true
    else if (c === sep) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

/** Cabeceras del fichero (para que la pantalla ofrezca el mapeo) y una sugerencia por nombres habituales. */
export function cabecerasCsv(texto: string): { separador: string; cabeceras: string[]; sugerido: Partial<MapeoCsv> } {
  const separador = detectarSeparador(texto)
  const primera = texto.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const cabeceras = dividir(primera, separador)
  const busca = (...claves: string[]) => cabeceras.find((h) => claves.some((k) => sinTildes(h).includes(k)))
  const sugerido: Partial<MapeoCsv> = {}
  const fecha = busca('fecha operacion', 'f. operacion', 'fecha') ; if (fecha) sugerido.fecha = fecha
  const valor = busca('fecha valor', 'f. valor', 'valor'); if (valor && valor !== fecha) sugerido.fechaValor = valor
  const concepto = busca('concepto', 'descripcion', 'detalle', 'movimiento'); if (concepto) sugerido.concepto = concepto
  const importe = busca('importe', 'cantidad'); if (importe) sugerido.importe = importe
  const cargo = busca('cargo', 'debe'); if (cargo) sugerido.cargo = cargo
  const abono = busca('abono', 'haber'); if (abono) sugerido.abono = abono
  const saldo = busca('saldo'); if (saldo) sugerido.saldo = saldo
  const ref = busca('referencia', 'ref.'); if (ref) sugerido.referencia = ref
  return { separador, cabeceras, sugerido }
}

function indice(ref: string | number | undefined, cabeceras: string[] | null, etiqueta: string, errores: string[]): number | undefined {
  if (ref === undefined) return undefined
  if (typeof ref === 'number') return Number.isInteger(ref) && ref >= 0 ? ref : (errores.push(`${etiqueta}: posición no válida`), undefined)
  if (!cabeceras) { errores.push(`${etiqueta}: sin cabecera hay que indicar la posición`); return undefined }
  const i = cabeceras.findIndex((h) => sinTildes(h) === sinTildes(ref))
  if (i < 0) errores.push(`${etiqueta}: no hay ninguna columna «${ref}»`)
  return i < 0 ? undefined : i
}

/**
 * Lee el CSV con el mapeo dado. Una fila mala NO tumba el fichero: se anota en `errores` (con su número de línea) y se sigue.
 * Si el mapeo en sí es inválido (falta columna, ni importe ni cargo/abono) lanza `Error` con todos los motivos.
 */
export function parseCsvBanco(texto: string, mapeo: MapeoCsv, opciones: { ccc?: string; banco?: string } = {}): ResultadoCsv {
  const separador = detectarSeparador(texto)
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const conCabecera = mapeo.cabecera !== false
  const primera = lineas.findIndex((l) => l.trim())
  const cabeceras = conCabecera && primera >= 0 ? dividir(lineas[primera], separador) : null
  const fallos: string[] = []
  const iFecha = indice(mapeo.fecha, cabeceras, 'fecha', fallos)
  const iValor = indice(mapeo.fechaValor, cabeceras, 'fechaValor', fallos)
  const iConcepto = indice(mapeo.concepto, cabeceras, 'concepto', fallos)
  const iImporte = indice(mapeo.importe, cabeceras, 'importe', fallos)
  const iCargo = indice(mapeo.cargo, cabeceras, 'cargo', fallos)
  const iAbono = indice(mapeo.abono, cabeceras, 'abono', fallos)
  const iSaldo = indice(mapeo.saldo, cabeceras, 'saldo', fallos)
  const iRef = indice(mapeo.referencia, cabeceras, 'referencia', fallos)
  if (iImporte === undefined && iCargo === undefined && iAbono === undefined) fallos.push('hay que indicar la columna de importe (o las de cargo y abono)')
  if (fallos.length) throw new Error(`mapeo de columnas no válido: ${fallos.join('; ')}`)

  const movimientos: MovimientoBanco[] = []
  const errores: ErrorFila[] = []
  for (let n = conCabecera ? primera + 1 : 0; n < lineas.length; n++) {
    if (!lineas[n].trim()) continue
    const c = dividir(lineas[n], separador)
    const linea = n + 1
    const fecha = fechaAIso(c[iFecha!])
    if (!fecha) { errores.push({ linea, motivo: `fecha no válida: «${c[iFecha!] ?? ''}»` }); continue }
    let importe: number | null
    if (iImporte !== undefined) importe = importeACentimos(c[iImporte])
    else {
      const cargo = iCargo !== undefined && c[iCargo] ? importeACentimos(c[iCargo]) : null
      const abono = iAbono !== undefined && c[iAbono] ? importeACentimos(c[iAbono]) : null
      importe = cargo === null && abono === null ? null : -Math.abs(cargo ?? 0) + Math.abs(abono ?? 0)
    }
    if (importe === null || importe === 0) { errores.push({ linea, motivo: `importe no válido: «${c[iImporte ?? iCargo ?? iAbono!] ?? ''}»` }); continue }
    const concepto = (c[iConcepto!] ?? '').trim()
    const saldo = iSaldo !== undefined ? importeACentimos(c[iSaldo]) : null
    movimientos.push({
      fechaOperacion: fecha,
      fechaValor: (iValor !== undefined ? fechaAIso(c[iValor]) : null) ?? fecha,
      importe, conceptoComun: '', concepto, contraparte: concepto.split(/\s{2,}|\s-\s/)[0] ?? concepto,
      referencia: iRef !== undefined ? (c[iRef] ?? '').trim() : '',
      ...(saldo !== null ? { saldoPosterior: saldo } : {}),
    })
  }
  const fechas = movimientos.map((m) => m.fechaOperacion).sort()
  return {
    separador, errores,
    extracto: {
      ccc: opciones.ccc ?? '', banco: opciones.banco ?? '', divisa: 'EUR', saldoInicial: null, saldoFinal: null,
      fechaInicio: fechas[0] ?? null, fechaFin: fechas.at(-1) ?? null, movimientos,
    },
  }
}
