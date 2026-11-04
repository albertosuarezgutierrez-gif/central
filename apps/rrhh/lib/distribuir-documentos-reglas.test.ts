import { describe, it, expect } from 'vitest'
import { agruparPaginas, idEnvioDeterminista, nombresDocumentos, paginaMencionaEmpleado } from '@/lib/distribuir-documentos-reglas'

describe('agruparPaginas', () => {
  it('A,A,B,?,B → [A:1-2],[B:3],[?:4],[B:5] (consecutivas del mismo empleado = 1 documento)', () => {
    expect(agruparPaginas(['A', 'A', 'B', null, 'B'])).toEqual([
      { empleado_id: 'A', desde: 1, hasta: 2 },
      { empleado_id: 'B', desde: 3, hasta: 3 },
      { empleado_id: null, desde: 4, hasta: 4 },
      { empleado_id: 'B', desde: 5, hasta: 5 },
    ])
  })
  it('las páginas no identificadas NUNCA se funden con las vecinas', () => {
    expect(agruparPaginas([null, null, 'A', null])).toEqual([
      { empleado_id: null, desde: 1, hasta: 1 },
      { empleado_id: null, desde: 2, hasta: 2 },
      { empleado_id: 'A', desde: 3, hasta: 3 },
      { empleado_id: null, desde: 4, hasta: 4 },
    ])
  })
  it('vacío → vacío', () => expect(agruparPaginas([])).toEqual([]))
})

describe('idEnvioDeterminista', () => {
  const base = { empresaId: 'E', pdfHash: 'h', carpeta: 'contratos', desde: 1, hasta: 2, empleadoId: 'A' }
  it('mismo PDF + mismo grupo → mismo uuid (re-subida no duplica)', () => {
    expect(idEnvioDeterminista(base)).toBe(idEnvioDeterminista({ ...base }))
    expect(idEnvioDeterminista(base)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
  it('cambia con empresa, PDF, carpeta o páginas', () => {
    const id = idEnvioDeterminista(base)
    for (const p of [{ empresaId: 'F' }, { pdfHash: 'x' }, { carpeta: 'otros' }, { desde: 2 }, { hasta: 3 }]) {
      expect(idEnvioDeterminista({ ...base, ...p })).not.toBe(id)
    }
  })
})

describe('nombresDocumentos', () => {
  it('sufija las páginas solo si el empleado tiene más de un documento', () => {
    const n = nombresDocumentos('Contrato', [
      { empleado_id: 'A', desde: 1, hasta: 2 }, { empleado_id: 'B', desde: 3, hasta: 3 }, { empleado_id: 'B', desde: 5, hasta: 5 },
    ])
    expect(n).toEqual(['Contrato.pdf', 'Contrato (pág. 3).pdf', 'Contrato (pág. 5).pdf'])
  })
  it('rango de páginas', () => {
    expect(nombresDocumentos('X', [{ empleado_id: 'A', desde: 1, hasta: 2 }, { empleado_id: 'A', desde: 4, hasta: 4 }]))
      .toEqual(['X (págs. 1-2).pdf', 'X (pág. 4).pdf'])
  })
})

describe('paginaMencionaEmpleado (verificación en código de lo que dice la IA)', () => {
  const ana = { nombre: 'Ana', apellidos: 'Pérez Gil', dni: '12345678Z' }
  it('por DNI con separadores', () => expect(paginaMencionaEmpleado('DNI 12.345.678-Z firmado', ana)).toBe(true))
  it('por nombre completo sin tildes', () => expect(paginaMencionaEmpleado('Doña ANA PEREZ GIL', ana)).toBe(true))
  it('solo el nombre de pila NO basta', () => expect(paginaMencionaEmpleado('Ana López', ana)).toBe(false))
  it('sin DNI en ficha ni nombre en texto → false', () => expect(paginaMencionaEmpleado('Otra persona', { nombre: 'Ana', apellidos: null, dni: null })).toBe(false))
})
