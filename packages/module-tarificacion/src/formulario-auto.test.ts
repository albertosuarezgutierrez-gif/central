// Formulario auto/moto: ciclomotor en ramo auto (13/10/2026). Fixtures SINTÉTICAS.
import { describe, it, expect } from 'vitest'
import { validarFormularioAuto } from './index.ts'

const base = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
const hoy = new Date('2026-10-13T00:00:00Z')
const con = (ramo: string, sv?: Record<string, unknown>) => validarFormularioAuto({ ...base, ramo, ...(sv ? { seleccionVehiculo: { marca: 'MARCA PRUEBA', modelo: 'MODELO X', ...sv } } : {}) }, hoy)
const errs = (r: ReturnType<typeof con>) => (r.ok ? '' : r.errores.join(' | '))

describe('ramo auto: ciclomotor (≤50 cc) no soportado', () => {
  it('auto con cilindrada ≤50 → mismo rechazo que moto', () => {
    for (const cc of [1, 49, 50]) {
      expect(errs(con('auto', { cilindradaCc: cc }))).toMatch(/ciclomotor \(≤50 cc\)/)
      expect(errs(con('auto', { cilindradaCc: cc }))).toBe(errs(con('moto', { clase: 1, cilindradaCc: cc })))
    }
  })
  it('auto con cilindrada >50 o sin cilindrada → válido (no es obligatoria en coche)', () => {
    expect(con('auto', { cilindradaCc: 51 }).ok).toBe(true)
    expect(con('auto', { cilindradaCc: 1598 }).ok).toBe(true)
    expect(con('auto', { clase: null, cilindradaCc: null }).ok).toBe(true)
    expect(con('auto', {}).ok).toBe(true)
    expect(con('auto').ok).toBe(true)
  })
})
