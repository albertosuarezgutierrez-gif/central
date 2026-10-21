import { describe, it, expect } from 'vitest'
import { motivoFallo, debeAvisar, textoAvisoEnvio, VENTANA_DEDUPE_MS } from './avisos-admin-reglas'

const T0 = new Date('2026-10-21T10:00:00Z')
const despues = (ms: number) => new Date(T0.getTime() + ms)

describe('motivoFallo', () => {
  it('sin transporte = sin proveedor; con transporte que falla = error del servidor', () => {
    expect(motivoFallo(false)).toBe('sin_proveedor')
    expect(motivoFallo(true)).toBe('error_servidor')
  })
})

describe('debeAvisar (dedupe 6 h)', () => {
  it('sin aviso previo, avisa', () => {
    expect(debeAvisar(null, T0)).toBe(true)
    expect(debeAvisar(undefined, T0)).toBe(true)
  })
  it('con uno de hace menos de 6 h, no', () => {
    expect(debeAvisar(T0, despues(VENTANA_DEDUPE_MS - 1))).toBe(false)
    expect(debeAvisar(T0, despues(60_000))).toBe(false)
  })
  it('a las 6 h exactas o más, sí', () => {
    expect(debeAvisar(T0, despues(VENTANA_DEDUPE_MS))).toBe(true)
    expect(debeAvisar(T0, despues(VENTANA_DEDUPE_MS + 1))).toBe(true)
  })
})

describe('textoAvisoEnvio', () => {
  it('texto exacto del código de acceso', () => {
    expect(textoAvisoEnvio({ canal: 'acceso', motivo: 'sin_proveedor', nombre: 'Ana', email: 'ana@x.es' })).toBe(
      'No se pudo enviar el código de acceso a Ana (ana@x.es). Motivo: sin proveedor de correo. Puedes darle acceso con «Nuevo enlace» en su ficha.')
    expect(textoAvisoEnvio({ canal: 'acceso', motivo: 'error_servidor', nombre: 'Ana', email: 'ana@x.es' }))
      .toContain('Motivo: error del servidor de correo.')
  })
  it('no menciona ningún código numérico', () => {
    expect(textoAvisoEnvio({ canal: 'firma', motivo: 'error_servidor', nombre: 'Ana', email: 'a@x.es' })).not.toMatch(/\d{6}/)
  })
  it('aviso a responsables sin empleado', () => {
    expect(textoAvisoEnvio({ canal: 'notificacion', motivo: 'sin_proveedor' })).toContain('responsables de RR.HH.')
  })
})
