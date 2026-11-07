import { describe, it, expect } from 'vitest'
import { calcularFiniquito } from '@central/module-nominas'
import { entradaFiniquito, eurosACent } from './finiquito-entrada'

const BASE = {
  fechaAntiguedad: '2020-03-01',
  fechaBaja: '2026-10-31',
  causa: 'dimision',
  salarioMensual: '1500',
  salarioAnual: '21000',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutados: 10,
  pagasExtra: [{ concepto: 'Navidad', importe: '1500', inicioDevengo: '2026-07-01', finDevengo: '2026-12-31' }],
}

describe('entradaFiniquito → contrato real de calcularFiniquito', () => {
  it('euros → céntimos una vez y forma exacta de EntradaFiniquito', () => {
    const r = entradaFiniquito(BASE)
    if (typeof r === 'string') throw new Error(r)
    expect(r.entrada).toEqual({
      fechaAntiguedad: '2020-03-01', fechaBaja: '2026-10-31', causa: { tipo: 'dimision' },
      salarioMensual: 150_000, salarioAnual: 2_100_000,
      pagasExtra: [{ concepto: 'Navidad', importe: 150_000, inicioDevengo: '2026-07-01', finDevengo: '2026-12-31' }],
      vacaciones: { diasAnuales: 30, diasDisfrutados: 10 },
    })
    expect(r.supuestos).toEqual([])
    // El motor la acepta tal cual (sin `as`).
    expect(calcularFiniquito(r.entrada, 'simulacion').indemnizacion.obligatoria).toBe(0)
  })

  it('las cuatro causas del motor, con sus parámetros', () => {
    const c = (extra: Record<string, unknown>) => {
      const r = entradaFiniquito({ ...BASE, ...extra })
      return typeof r === 'string' ? r : r.entrada.causa
    }
    expect(c({ causa: 'fin_contrato_temporal', modalidad: 'ordinaria' })).toEqual({ tipo: 'fin_contrato_temporal', modalidad: 'ordinaria' })
    expect(c({ causa: 'objetivo', causa52c: true })).toEqual({ tipo: 'objetivo', causa52c: true })
    expect(c({ causa: 'improcedente', via: 'conciliacion_administrativa' })).toEqual({ tipo: 'improcedente', via: 'conciliacion_administrativa' })
    expect(typeof c({ causa: 'improcedente' })).toBe('string')
    expect(typeof c({ causa: 'fin_contrato_temporal' })).toBe('string')
    expect(typeof c({ causa: 'despido_objetivo' })).toBe('string')
  })

  it('sin salario anual: mensual × pagas y lo dice como supuesto; sin pagas, error (no se inventa)', () => {
    const r = entradaFiniquito({ ...BASE, salarioAnual: '', pagas: 14 })
    if (typeof r === 'string') throw new Error(r)
    expect(r.entrada.salarioAnual).toBe(2_100_000)
    expect(r.supuestos.length).toBe(1)
    expect(typeof entradaFiniquito({ ...BASE, salarioAnual: '' })).toBe('string')
  })

  it('indemnización pagada opcional; vacía = la obligatoria (no 0)', () => {
    const r = entradaFiniquito({ ...BASE, indemnizacionPagada: '' })
    if (typeof r === 'string') throw new Error(r)
    expect('indemnizacionPagada' in r.entrada).toBe(false)
    const r2 = entradaFiniquito({ ...BASE, indemnizacionPagada: '0' })
    if (typeof r2 === 'string') throw new Error(r2)
    expect(r2.entrada.indemnizacionPagada).toBe(0)
  })

  it('rechaza fechas invertidas y periodos de paga inválidos', () => {
    expect(typeof entradaFiniquito({ ...BASE, fechaBaja: '2019-01-01' })).toBe('string')
    expect(typeof entradaFiniquito({ ...BASE, pagasExtra: [{ concepto: 'X', importe: '1', inicioDevengo: '2026-12-31', finDevengo: '2026-01-01' }] })).toBe('string')
  })

  it('eurosACent: formato español y punto decimal', () => {
    expect(eurosACent('2.162,49')).toBe(216_249)
    expect(eurosACent('2162.49')).toBe(216_249)
    expect(eurosACent(12.5)).toBe(1250)
    expect(eurosACent('')).toBeNull()
    expect(eurosACent('-1')).toBeNull()
  })
})
