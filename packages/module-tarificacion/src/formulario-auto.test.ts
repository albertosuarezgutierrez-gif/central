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

describe('documentoTomador (Mapfre paso 1, 14/10/2026)', () => {
  it('opcional; si viene, DNI/NIE/CIF válido y normalizado', async () => {
    const { documentoTomadorDe } = await import('./index.ts')
    const r = validarFormularioAuto({ ...base, documentoTomador: ' 00000000-t ' }, hoy)
    expect(r.ok && r.formulario.documentoTomador).toBe('00000000T')
    expect(r.ok && documentoTomadorDe(r.formulario)).toBe('00000000T')
    const sin = validarFormularioAuto(base, hoy)
    expect(sin.ok && 'documentoTomador' in sin.formulario).toBe(false)
    expect(sin.ok && documentoTomadorDe(sin.formulario)).toBe(null)
  })
  it('inválido → error SIN repetir el valor', () => {
    const r = validarFormularioAuto({ ...base, documentoTomador: '12345678A' }, hoy)
    expect(r.ok).toBe(false)
    expect(errs(r as ReturnType<typeof con>)).toMatch(/documentoTomador: no es un DNI\/NIE\/CIF válido/)
    expect(errs(r as ReturnType<typeof con>)).not.toContain('12345678')
  })
  it('secretosDelRiesgo: el documento y sus variantes con separador; nada si no hay', async () => {
    const { secretosDelRiesgo } = await import('./index.ts')
    expect(secretosDelRiesgo({ documentoTomador: '00000000T' })).toEqual(expect.arrayContaining(['00000000T', '00000000-T', '00000000 T']))
    expect(secretosDelRiesgo({ tomador: { documentoIdentidad: 'X0000000T' } })).toEqual(expect.arrayContaining(['X0000000T', 'X-0000000-T']))
    expect(secretosDelRiesgo({ ramo: 'moto' })).toEqual([])
    expect(secretosDelRiesgo(null)).toEqual([])
  })
})
