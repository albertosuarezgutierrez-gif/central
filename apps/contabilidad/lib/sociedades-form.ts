// Entradas de los borradores 200/202 desde el formulario (query string). PURO.
// Regla del repo «dato que NO hay ≠ 0»: un campo vacío o ausente es `null` (no informado); solo un «0» escrito es un cero. Importes en formato español
// («1.234,56»); el porcentaje admite coma («25» o «25,5»).
import { PERIODOS_202, type EntradaModelo200, type EntradaModelo202, type Modalidad202, type Periodo202 } from '@central/module-contabilidad'
import { parsearImporte } from './importes.ts'

type Q = Record<string, string | string[] | undefined>
const uno = (q: Q, k: string): string => { const v = q[k]; return (Array.isArray(v) ? v[0] : v)?.trim() ?? '' }

/** Importe del campo: vacío → null; inválido → null (y el campo se marca en `errores`). */
function importe(q: Q, k: string, errores: string[], etiqueta: string): number | null {
  const t = uno(q, k)
  if (t === '') return null
  const c = parsearImporte(t)
  if (c === null) { errores.push(`${etiqueta}: importe no válido (usa 1.234,56)`); return null }
  return c
}

/** «25» / «25,5» → 2500 / 2550 puntos básicos. Vacío o fuera de 0–100 → null. */
export function parsearPorcentajePb(t: string): number | null {
  const m = /^(\d{1,3})(?:,(\d{1,2}))?$/.exec(t.trim().replace(/\s|%/g, ''))
  if (!m) return null
  const pb = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return pb >= 0 && pb <= 10000 ? pb : null
}

export function entrada200(q: Q, anio: number, resultadoAntesImpuestos: number): { entrada: EntradaModelo200; errores: string[] } {
  const errores: string[] = []
  const tipo = uno(q, 'tipo')
  const tipoPb = tipo === '' ? null : parsearPorcentajePb(tipo)
  if (tipo !== '' && tipoPb === null) errores.push('Tipo de gravamen no válido (0–100, p. ej. 25 o 25,5)')
  return {
    errores,
    entrada: {
      anio, resultadoAntesImpuestos,
      ajustesPositivos: importe(q, 'ajp', errores, 'Ajustes positivos'), ajustesNegativos: importe(q, 'ajn', errores, 'Ajustes negativos'),
      compensacionBasesNegativas: importe(q, 'comp', errores, 'Compensación'), tipoGravamenPb: tipoPb, deducciones: importe(q, 'ded', errores, 'Deducciones'),
      retenciones: importe(q, 'ret', errores, 'Retenciones'), pagosFraccionados: importe(q, 'pf', errores, 'Pagos fraccionados'),
    },
  }
}

export function entrada202(q: Q, anio: number): { entrada: EntradaModelo202; errores: string[] } {
  const errores: string[] = []
  const p = uno(q, 'periodo')
  const periodo: Periodo202 = (PERIODOS_202 as readonly string[]).includes(p) ? (p as Periodo202) : '1P'
  const m = uno(q, 'modalidad')
  const modalidad: Modalidad202 | null = m === 'art40_2' || m === 'art40_3' ? m : null
  const pct = uno(q, 'pct')
  const pb = pct === '' ? undefined : (parsearPorcentajePb(pct) ?? undefined)
  if (pct !== '' && pb === undefined) errores.push('Porcentaje no válido (0–100)')
  return {
    errores,
    entrada: {
      anio, periodo, modalidad,
      cuotaIntegraBase: importe(q, 'cib', errores, 'Cuota íntegra'), deduccionesBase: importe(q, 'dedb', errores, 'Deducciones'), retencionesBase: importe(q, 'retb', errores, 'Retenciones'),
      baseImponibleMeses: importe(q, 'bim', errores, 'Base imponible de los meses'), retencionesPeriodo: importe(q, 'retp', errores, 'Retenciones del periodo'),
      pagosAnteriores: importe(q, 'pag', errores, 'Pagos anteriores'),
      ...(pb !== undefined ? { porcentajePb: pb } : {}),
    },
  }
}
