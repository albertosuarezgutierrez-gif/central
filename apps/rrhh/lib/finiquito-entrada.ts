/**
 * Cuerpo de POST /api/admin/nominas/finiquito → `EntradaFiniquito` de @central/module-nominas. Puro, sin reloj.
 * ÚNICO sitio que conoce la forma de la entrada del motor. Importes del formulario en EUROS → céntimos UNA vez aquí.
 * Nada se rellena con un valor inventado: un campo obligatorio vacío es un error, no un 0.
 */
import { eurosACentimos, type CausaExtincion, type EntradaFiniquito, type PagaExtraPendiente } from '@central/module-nominas'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Euros (número o texto con coma o punto) → céntimos enteros ≥ 0; null si no es un importe. */
export function eurosACent(v: unknown): number | null {
  // «2.162,49» (formato español) o «2162.49» (input type=number).
  const s = typeof v === 'string' ? v.trim() : ''
  const n = typeof v === 'number' ? v : s ? Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) : NaN
  return Number.isFinite(n) && n >= 0 ? eurosACentimos(n) : null
}

function causaDe(b: Record<string, unknown>): CausaExtincion | string {
  switch (b.causa) {
    case 'dimision':
      return { tipo: 'dimision' }
    case 'fin_contrato_temporal': {
      const m = b.modalidad
      if (m !== 'ordinaria' && m !== 'sustitucion' && m !== 'formativo') return 'Indica la modalidad del contrato temporal'
      return { tipo: 'fin_contrato_temporal', modalidad: m }
    }
    case 'objetivo':
      return { tipo: 'objetivo', causa52c: b.causa52c === true }
    case 'improcedente': {
      const v = b.via
      if (v !== 'sentencia' && v !== 'conciliacion_administrativa' && v !== 'reconocimiento_empresa') return 'Indica cómo se reconoce la improcedencia'
      return { tipo: 'improcedente', via: v }
    }
    default:
      return 'Indica la causa de la baja'
  }
}

export interface EntradaFiniquitoArmada {
  entrada: EntradaFiniquito
  /** Supuestos que el cálculo ha tomado y que el responsable debe ver (p. ej. salario anual = mensual × pagas). */
  supuestos: string[]
}

export function entradaFiniquito(b: Record<string, unknown>): EntradaFiniquitoArmada | string {
  const fechaAntiguedad = String(b.fechaAntiguedad ?? '')
  const fechaBaja = String(b.fechaBaja ?? '')
  if (!FECHA.test(fechaAntiguedad) || !FECHA.test(fechaBaja)) return 'Fechas de antigüedad y baja obligatorias (AAAA-MM-DD)'
  if (fechaBaja < fechaAntiguedad) return 'La baja no puede ser anterior a la antigüedad'
  const causa = causaDe(b)
  if (typeof causa === 'string') return causa

  const salarioMensual = eurosACent(b.salarioMensual)
  if (!salarioMensual) return 'Salario mensual inválido'
  const supuestos: string[] = []
  let salarioAnual: number | null
  if (b.salarioAnual === undefined || b.salarioAnual === null || b.salarioAnual === '') {
    const pagas = Number(b.pagas)
    if (pagas !== 12 && pagas !== 14) return 'Indica el salario anual o el número de pagas (12 o 14)'
    salarioAnual = salarioMensual * pagas
    supuestos.push(`Salario anual estimado como mensual × ${pagas} pagas (sin complementos variables)`)
  } else {
    salarioAnual = eurosACent(b.salarioAnual)
    if (!salarioAnual) return 'Salario anual inválido'
  }

  const diasAnuales = Number(b.diasVacacionesAnuales)
  const diasDisfrutados = Number(b.diasVacacionesDisfrutados ?? 0)
  if (!Number.isFinite(diasAnuales) || diasAnuales <= 0) return 'Días de vacaciones al año inválidos'
  if (!Number.isFinite(diasDisfrutados) || diasDisfrutados < 0) return 'Días de vacaciones disfrutados inválidos'

  const pagasExtra: PagaExtraPendiente[] = []
  const crudas = Array.isArray(b.pagasExtra) ? b.pagasExtra : []
  for (const p of crudas as Record<string, unknown>[]) {
    const concepto = String(p?.concepto ?? '').trim() || 'Paga extra'
    const importe = eurosACent(p?.importe)
    const inicioDevengo = String(p?.inicioDevengo ?? '')
    const finDevengo = String(p?.finDevengo ?? '')
    if (importe === null) return `Paga «${concepto}»: importe inválido`
    if (!FECHA.test(inicioDevengo) || !FECHA.test(finDevengo) || finDevengo < inicioDevengo) return `Paga «${concepto}»: periodo de devengo inválido`
    pagasExtra.push({ concepto, importe, inicioDevengo, finDevengo })
  }

  let indemnizacionPagada: number | undefined
  if (b.indemnizacionPagada !== undefined && b.indemnizacionPagada !== null && b.indemnizacionPagada !== '') {
    const c = eurosACent(b.indemnizacionPagada)
    if (c === null) return 'Indemnización pagada inválida'
    indemnizacionPagada = c
  }

  return {
    entrada: {
      fechaAntiguedad,
      fechaBaja,
      causa,
      salarioMensual,
      salarioAnual,
      pagasExtra,
      vacaciones: { diasAnuales, diasDisfrutados },
      ...(indemnizacionPagada !== undefined ? { indemnizacionPagada } : {}),
    },
    supuestos,
  }
}
