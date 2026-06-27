import { describe, it, expect } from 'vitest'
import { calcularNomina } from './calcular'
import { tablas2026 } from './tablas-2026'
import type { ContratoLaboral, IncidenciaMes } from './tipos'

const TABLAS = tablas2026(0.025, 22) // AT/EP hostelería, 22 días laborables

const CONTRATO_BASE: ContratoLaboral = {
  tipoContrato: 'indefinido',
  jornadaPct: 100,
  salarioBase: 1800,
  grupoCotizacion: 7,
  irpfRetencionPct: 10,
  conceptosFijos: [],
}

describe('calcularNomina', () => {
  it('calcula neto básico sin incidencias', () => {
    const r = calcularNomina(CONTRATO_BASE, [], TABLAS, '2026-06')
    expect(r.devengos.total).toBe(1800)
    // Deducciones: SS 4.70%+1.55%+0.10%=6.35% de base + IRPF 10%
    const ss = Math.round(1800 * 0.0635 * 100) / 100
    const irpf = Math.round(1800 * 0.10 * 100) / 100
    expect(r.deducciones.total).toBeCloseTo(ss + irpf, 1)
    expect(r.netoAPagar).toBeCloseTo(1800 - ss - irpf, 1)
  })

  it('aplica jornada parcial al salario base', () => {
    const contrato = { ...CONTRATO_BASE, jornadaPct: 50 }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    expect(r.devengos.salarioBase).toBeCloseTo(900, 1)
  })

  it('añade horas extra al devengo', () => {
    const incidencias: IncidenciaMes[] = [
      { tipo: 'horas_extra', concepto: 'Horas extra junio', horas: 8 },
    ]
    const r = calcularNomina(CONTRATO_BASE, incidencias, TABLAS, '2026-06')
    // €/hora = 1800 / 160
    const precioHora = 1800 / 160
    expect(r.devengos.horasExtra).toBeCloseTo(precioHora * 8, 1)
    expect(r.devengos.total).toBeGreaterThan(1800)
  })

  it('descuenta días de baja IT', () => {
    const incidencias: IncidenciaMes[] = [
      { tipo: 'baja_it', concepto: 'Baja médica', dias: 5 },
    ]
    const r = calcularNomina(CONTRATO_BASE, incidencias, TABLAS, '2026-06')
    // 5 de 22 días laborables
    const descuento = (1800 / 22) * 5
    expect(r.devengos.descuentos).toBeCloseTo(descuento, 1)
    expect(r.devengos.total).toBeLessThan(1800)
  })

  it('aplica base mínima SS si salario < mínimo del grupo', () => {
    const contrato = { ...CONTRATO_BASE, salarioBase: 500, grupoCotizacion: 7 as const }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    // Base mínima grupo 7 = 1184.10
    expect(r.baseCotizacion).toBe(1184.10)
  })

  it('calcula cuota patronal correctamente', () => {
    const r = calcularNomina(CONTRATO_BASE, [], TABLAS, '2026-06')
    // base = 1800 (dentro de rango grupo 7)
    expect(r.cuotaPatronal.contingencias_comunes).toBeCloseTo(1800 * 0.236, 1)
    expect(r.cuotaPatronal.at_ep).toBeCloseTo(1800 * 0.025, 1)
    expect(r.costeTotalEmpresa).toBeCloseTo(1800 + r.cuotaPatronal.total, 1)
  })

  it('añade complementos fijos al devengo', () => {
    const contrato = {
      ...CONTRATO_BASE,
      conceptosFijos: [
        { nombre: 'Plus transporte', importe: 50 },
        { nombre: 'Plus productividad', importe: 100 },
      ],
    }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    expect(r.devengos.total).toBeCloseTo(1800 + 150, 1)
    expect(r.devengos.complementosFijos).toHaveLength(2)
  })
})
