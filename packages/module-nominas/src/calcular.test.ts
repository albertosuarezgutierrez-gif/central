import { describe, it, expect } from 'vitest'
import { calcularNomina, desgloseConfirmable } from './calcular'
import { eurosACentimos, pctAPpm, fraccionAPpm, aplicarTipo } from './dinero'
import { CifraPendienteError } from './cifras'
import type { ContratoLaboral } from './tipos'

const C: ContratoLaboral = { tipoContrato: 'indefinido', jornadaPct: 100, salarioBase: 3000, grupoCotizacion: 1, irpfRetencionPct: 15, conceptosFijos: [] }

describe('dinero', () => {
  it('convierte sin errores de float', () => {
    expect(eurosACentimos(1.005)).toBe(101)
    expect(eurosACentimos(0.1 + 0.2)).toBe(30)
    expect(eurosACentimos(1424.4)).toBe(142_440)
    expect(pctAPpm(4.7)).toBe(47_000)
    expect(fraccionAPpm(0.0155)).toBe(15_500)
    expect(aplicarTipo(198_930, 15_500)).toBe(3_083) // 3083,415
    expect(() => aplicarTipo(1.5, 10)).toThrow()
  })
})

describe('adaptador euros (llamadores de rrhh)', () => {
  it('devuelve el desglose en euros con la forma de siempre + MEI y pendientes', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' })
    expect(d.devengos.total).toBe(3000)
    expect(d.baseCotizacion).toBe(3000)
    expect(d.deducciones).toMatchObject({ contingencias_comunes: 141, desempleo: 46.5, fp: 3, mei: 4.5, irpf: 450, total: 645 })
    expect(d.netoAPagar).toBe(2355)
    expect(d.cuotaPatronal.total).toBe(964.5)
    expect(d.tablasAño).toBe(2026)
    expect(d.cifrasPendientes).toEqual([]) // Orden PJC/297/2026 verificada
    expect(d.irpfAlgoritmo).toBeNull() // % plano
  })
  it('«parcial» sin duración → pendiente; con duración explícita, no', () => {
    const p: ContratoLaboral = { ...C, tipoContrato: 'parcial', jornadaPct: 50, grupoCotizacion: 1 }
    expect(calcularNomina(p, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' }).cifrasPendientes).toContain('regla:duracion_contrato')
    expect(calcularNomina({ ...p, duracion: 'indefinido' }, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' }).cifrasPendientes).not.toContain('regla:duracion_contrato')
  })
  it('modo cálculo: 2026 verificada calcula; una regla pendiente (AT/EP sin resolver) lanza', () => {
    expect(calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' }).netoAPagar).toBe(2355)
    expect(() => calcularNomina(C, [], { periodo: '2026-04', atEp: null, modo: 'calculo' })).toThrow(CifraPendienteError)
  })
  it('irpfAlgoritmo: usa el algoritmo AEAT en vez del % plano (rrhh lo rellena desde situacion_familiar)', () => {
    const sf = { vigenteDesde: '2026-01-01', vigenteHasta: null, situacion: 3 as const, fechaNacimientoContribuyente: '1990-05-10', discapacidad: 'ninguna' as const, descendientes: [], ascendientes: [] }
    // 3.000 €/mes × 12 = 36.000 € · SS mensual 141 + 46,50 + 3 + 4,50 = 195 → 2.340/año · base = 36.000 − 2.340 − 2.000 = 31.660
    // esc = 4.225,50 + 11.460×30 % (3.438) = 7.663,50 · cuota 6.609 · RA > 35.200 (sin 85.3) · 18,3583 % → 18,36 · IRPF = 3.000 × 18,36 % = 550,80
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo', irpfAlgoritmo: { situacion: sf } })
    expect(d.irpfAlgoritmo).toEqual({ tipoPct: 18.36, motivo: 'algoritmo' })
    expect(d.deducciones.irpf).toBe(550.8)
    const sin = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo', irpfAlgoritmo: { situacion: null } })
    expect(sin.irpfAlgoritmo?.motivo).toBe('sin_145_sin_circunstancias')
  })
  it('AT/EP null («no se sabe») no se rellena en silencio: queda pendiente', () => {
    expect(calcularNomina(C, [], { periodo: '2026-04', atEp: null, modo: 'simulacion' }).cifrasPendientes).toContain('regla:at_ep_empresa')
  })
})

describe('desgloseConfirmable', () => {
  it('solo sin pendientes; un borrador antiguo (sin el campo) = no se sabe → no', () => {
    expect(desgloseConfirmable({ cifrasPendientes: [] })).toEqual({ ok: true })
    expect(desgloseConfirmable({ cifrasPendientes: ['mei_empresa'] }).ok).toBe(false)
    expect(desgloseConfirmable({ netoAPagar: 1 }).ok).toBe(false)
    expect(desgloseConfirmable(null).ok).toBe(false)
  })
})
