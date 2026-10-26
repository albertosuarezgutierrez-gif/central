import { describe, it, expect } from 'vitest'
import { COBALTO_ASEGURA, PIE_ASEGURA, empresaConMarcaAsegura, estiloMarcaEmpresa, paletaEmpresa, urlPortalAsegura } from './marca-asegura'
import { estiloMarca } from './branding'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('marca Grupo ASegura', () => {
  it('solo las empresas de la lista llevan la marca', () => {
    const lista = ` ${A.toUpperCase()} , 33333333-3333-3333-3333-333333333333`
    expect(empresaConMarcaAsegura(A, lista)).toBe(true)
    expect(empresaConMarcaAsegura(B, lista)).toBe(false)
    expect(empresaConMarcaAsegura(A, '')).toBe(false)
    expect(empresaConMarcaAsegura(A, undefined)).toBe(false)
    expect(empresaConMarcaAsegura('', lista)).toBe(false)
  })
  it('con marca → paleta cobalto ASegura (ignora el color de la empresa)', () => {
    expect(paletaEmpresa(true, '#1B3461')?.accent).toBe(COBALTO_ASEGURA)
    expect(estiloMarcaEmpresa(true, null)['--accent']).toBe('#3364ee')
  })
  it('sin marca → la de siempre', () => {
    expect(estiloMarcaEmpresa(false, '#1B3461')).toEqual(estiloMarca('#1B3461'))
    expect(estiloMarcaEmpresa(false, null)).toEqual({})
  })
  it('el pie se escribe exactamente «Grupo ASegura»', () => {
    expect(PIE_ASEGURA).toBe('Herramienta gratuita de Grupo ASegura')
  })
})

describe('URL de la tarjeta «Mis seguros» (regla legal)', () => {
  it('solo lleva email y origen', () => {
    const u = new URL(urlPortalAsegura('ana+prueba@ejemplo.es', 'https://clientes.grupoasegura.es/'))
    expect([...u.searchParams.keys()].sort()).toEqual(['email', 'origen'])
    expect(u.searchParams.get('email')).toBe('ana+prueba@ejemplo.es')
    expect(u.searchParams.get('origen')).toBe('rrhh')
    expect(u.origin).toBe('https://clientes.grupoasegura.es')
  })
  it('sin email solo lleva origen y respeta la base de la env', () => {
    const u = new URL(urlPortalAsegura(null, 'https://otro.example'))
    expect([...u.searchParams.keys()]).toEqual(['origen'])
    expect(u.origin).toBe('https://otro.example')
  })
})
