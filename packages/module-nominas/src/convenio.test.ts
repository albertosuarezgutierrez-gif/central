import { describe, it, expect } from 'vitest'
import { buscarCategoria, buscarCategoriaPorAño, validarTablaSalarial, type TablaSalarial } from './convenio'

// Datos FICTICIOS (solo forma): el módulo no lleva tablas de ningún convenio real.
const t = (año: number, desde: string, hasta: string | null, base: number): TablaSalarial => ({
  convenio: 'X-99', nombreConvenio: 'Convenio de prueba', año, ambito: 'provincial', fuente: 'ficticia (test)',
  vigenteDesde: desde, vigenteHasta: hasta,
  categorias: [{ codigo: 'G2', nombre: 'Oficial', grupoCotizacion: 8, salarioBaseMensual: base, pagasExtra: 2, importePagaExtra: base, pluses: [{ concepto: 'Transporte', importe: 5_000, periodicidad: 'mensual' }] }],
})
const TABLAS = [t(2025, '2025-01-01', '2025-12-31', 150_000), t(2026, '2026-01-01', null, 155_000)]

describe('tablas salariales de convenio', () => {
  it('busca por fecha de vigencia: la tabla del año que cubre la fecha', () => {
    expect(buscarCategoria(TABLAS, { convenio: 'X-99', fecha: '2025-06-15', codigoCategoria: 'G2' })?.categoria.salarioBaseMensual).toBe(150_000)
    expect(buscarCategoria(TABLAS, { convenio: 'X-99', fecha: '2026-11-07', codigoCategoria: 'G2' })?.tabla.año).toBe(2026)
  })
  it('fail-closed: sin tabla vigente, otro convenio u otra categoría → null (nunca la del año anterior)', () => {
    expect(buscarCategoria(TABLAS, { convenio: 'X-99', fecha: '2024-12-31', codigoCategoria: 'G2' })).toBeNull()
    expect(buscarCategoria(TABLAS, { convenio: 'Y-1', fecha: '2026-03-01', codigoCategoria: 'G2' })).toBeNull()
    expect(buscarCategoria(TABLAS, { convenio: 'X-99', fecha: '2026-03-01', codigoCategoria: 'G3' })).toBeNull()
    expect(buscarCategoriaPorAño(TABLAS, { convenio: 'X-99', año: 2027, codigoCategoria: 'G2' })).toBeNull()
    expect(() => buscarCategoria(TABLAS, { convenio: 'X-99', fecha: '7/11/2026', codigoCategoria: 'G2' })).toThrow()
  })
  it('por año exacto; dos tablas del mismo año (revisión salarial) → error: hay que buscar por fecha', () => {
    expect(buscarCategoriaPorAño(TABLAS, { convenio: 'X-99', año: 2025, codigoCategoria: 'G2' })?.categoria.salarioBaseMensual).toBe(150_000)
    const conRevision = [...TABLAS, t(2026, '2026-07-01', null, 160_000)]
    expect(() => buscarCategoriaPorAño(conRevision, { convenio: 'X-99', año: 2026, codigoCategoria: 'G2' })).toThrow(/por fecha/)
    expect(buscarCategoria(conRevision, { convenio: 'X-99', fecha: '2026-08-01', codigoCategoria: 'G2' })?.categoria.salarioBaseMensual).toBe(160_000)
  })
  it('valida la forma: céntimos enteros, sin duplicados, con fuente y vigencia coherente', () => {
    expect(validarTablaSalarial(TABLAS[0])).toEqual([])
    const mala: TablaSalarial = { ...TABLAS[0], fuente: ' ', vigenteHasta: '2024-01-01', categorias: [...TABLAS[0].categorias, { ...TABLAS[0].categorias[0], salarioBaseMensual: 10.5 }] }
    expect(validarTablaSalarial(mala)).toEqual(expect.arrayContaining(['sin fuente oficial', 'vigenteHasta inválida', 'categoría duplicada: G2', 'G2: salario base no es céntimos enteros ≥ 0']))
  })
})
