import { describe, it, expect } from 'vitest'
import { calcularNomina } from '@central/module-nominas'
import type { ContratoLaboral } from '@central/module-nominas'
import { AVISO_TRABAJADOR_PENDIENTES, explicacionParaTrabajador, explicarNomina, explicacionPlana } from './nomina-explicacion'

const C: ContratoLaboral = { tipoContrato: 'indefinido', jornadaPct: 100, salarioBase: 3000, grupoCotizacion: 1, irpfRetencionPct: 15, conceptosFijos: [] }
const sf = { vigenteDesde: '2026-01-01', vigenteHasta: null, situacion: 3 as const, fechaNacimientoContribuyente: '1990-05-10', discapacidad: 'ninguna' as const, descendientes: [], ascendientes: [] }
const linea = (e: ReturnType<typeof explicarNomina>, id: string) => e.lineas.find(l => l.id === id)!

describe('explicarNomina', () => {
  it('explica cada concepto con base, tipo e importe (IRPF algoritmo AEAT)', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo', irpfAlgoritmo: { situacion: sf } })
    const e = explicarNomina(d)
    expect(linea(e, 'cc').explicacion).toContain('Contingencias comunes 4,70 % sobre la base de cotización 3.000,00€ = 141,00€')
    expect(linea(e, 'desempleo').explicacion).toContain('Desempleo 1,55 %')
    expect(linea(e, 'desempleo').explicacion).toContain('= 46,50€')
    expect(linea(e, 'fp').explicacion).toContain('0,10 %')
    expect(linea(e, 'mei').explicacion).toContain('0,15 %')
    expect(linea(e, 'irpf').explicacion).toContain('IRPF 18,36 % sobre el total devengado 3.000,00€ = 550,80€')
    expect(linea(e, 'irpf').explicacion).toContain('situación familiar (modelo 145)')
    expect(linea(e, 'neto').explicacion).toContain('3.000,00€ − total deducciones')
    expect(e.avisos).toEqual([])
  })

  it('IRPF sin modelo 145 y tipo plano del contrato se distinguen', () => {
    const sin = explicarNomina(calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo', irpfAlgoritmo: { situacion: null } }))
    expect(linea(sin, 'irpf').explicacion).toContain('porque no hay modelo 145')
    expect(linea(sin, 'irpf').avisos.join(' ')).toContain('sin modelo 145')
    const plano = explicarNomina(calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' }))
    expect(linea(plano, 'irpf').explicacion).toContain('Tipo plano del contrato 15,00 %')
  })

  it('topes de base y reglas pendientes se avisan', () => {
    const bajo = calcularNomina({ ...C, salarioBase: 1000 }, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' })
    expect(linea(explicarNomina(bajo), 'cc').avisos.join(' ')).toContain('base MÍNIMA')
    const alto = calcularNomina({ ...C, salarioBase: 6000 }, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' })
    expect(linea(explicarNomina(alto), 'cc').avisos.join(' ')).toContain('TOPE máximo')
    const parcial = calcularNomina({ ...C, tipoContrato: 'parcial', jornadaPct: 50 }, [], { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' })
    const ep = explicarNomina(parcial)
    expect(ep.avisos.join(' ')).toContain('regla:duracion_contrato')
    expect(ep.avisos.join(' ')).toContain('SIMULACIÓN')
  })

  it('dato ausente = «no consta», nunca 0', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' })
    const { tablasAño, irpfAlgoritmo, cifrasPendientes, baseContingenciasProfesionales, ...viejo } = d as typeof d & Record<string, unknown>
    void tablasAño; void irpfAlgoritmo; void cifrasPendientes; void baseContingenciasProfesionales
    const e = explicarNomina(viejo)
    expect(linea(e, 'irpf').explicacion).toContain('No consta cómo se calculó el tipo')
    expect(linea(e, 'cc').explicacion).toContain('No consta el tipo aplicado')
    expect(linea(e, 'desempleo').explicacion).toContain('No consta')
    expect(e.avisos.join(' ')).toContain('No consta con qué tablas')
    expect(e.avisos.join(' ')).toContain('No consta si había cifras')
    expect(explicarNomina(null).lineas).toEqual([])
    expect(explicarNomina({ ...d, deducciones: { ...d.deducciones, fp: undefined as unknown as number } }).lineas.find(l => l.id === 'fp')!.importe).toBe('no consta')
  })

  it('detecta un importe que no cuadra con el tipo de la tabla', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' })
    const e = explicarNomina({ ...d, deducciones: { ...d.deducciones, contingencias_comunes: 150 } })
    expect(linea(e, 'cc').avisos.join(' ')).toContain('No cuadra con la cuenta')
  })

  it('texto plano para el PDF', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' })
    const t = explicacionPlana(explicarNomina(d))
    expect(t.length).toBeGreaterThanOrEqual(6)
    expect(t.some(x => x.startsWith('Líquido a percibir (2.355,00€)'))).toBe(true)
  })

  it('anexo del TRABAJADOR: sin «No cuadra… Revisar», sin claves técnicas ni PENDIENTE_VERIFICAR; un mensaje humano', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo' })
    const admin = explicarNomina({ ...d, cifrasPendientes: ['mei.reparto', 'irpf.minimos_2_7'], avisos: ['clave_rara_del_motor'], deducciones: { ...d.deducciones, contingencias_comunes: 150 } })
    expect(JSON.stringify(admin)).toMatch(/No cuadra.*Revisar/)
    expect(JSON.stringify(admin)).toContain('PENDIENTE_VERIFICAR')
    const t = explicacionParaTrabajador(admin, ['mei.reparto', 'irpf.minimos_2_7'])
    const txt = JSON.stringify(t)
    for (const x of ['No cuadra', 'Revisar', 'PENDIENTE_VERIFICAR', 'mei.reparto', 'clave_rara_del_motor', 'Aviso del cálculo']) expect(txt).not.toContain(x)
    expect(t.avisos).toEqual([AVISO_TRABAJADOR_PENDIENTES])
    expect(t.lineas.length).toBe(admin.lineas.length)
  })
  it('anexo del trabajador sin pendientes ni descuadres: sin el aviso; sin dato de pendientes: con él (nunca «todo verificado»)', () => {
    const d = calcularNomina(C, [], { periodo: '2026-04', atEp: 0.015, modo: 'calculo', irpfAlgoritmo: { situacion: sf } })
    expect(explicacionParaTrabajador(explicarNomina({ ...d, cifrasPendientes: [] }), []).avisos).toEqual([])
    expect(explicacionParaTrabajador(explicarNomina(d), undefined).avisos).toContain(AVISO_TRABAJADOR_PENDIENTES)
  })
})

describe('guardián: el PDF del trabajador usa la versión para el trabajador', () => {
  it('nomina-pdf.tsx pasa la explicación por explicacionParaTrabajador', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./nomina-pdf.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/explicacionParaTrabajador\(explicarNomina\(desglose\)/)
  })
})
