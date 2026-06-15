import { describe, it, expect } from 'vitest'
import { contraparte, noLeidos, ordenarCronologico, validarTexto, type Mensaje } from './index.ts'

const m = (over: Partial<Mensaje>): Mensaje => ({
  id: Math.random().toString(), remitente: 'gestor', texto: 'x',
  leido_gestor: false, leido_titular: false, creada_at: '2026-01-01T00:00:00Z', ...over,
})

describe('module-chat', () => {
  it('contraparte invierte la parte', () => {
    expect(contraparte('gestor')).toBe('titular')
    expect(contraparte('titular')).toBe('gestor')
  })
  it('noLeidos cuenta los del otro lado sin leer', () => {
    const ms = [
      m({ remitente: 'titular', leido_gestor: false }), // gestor no lo ha leído → cuenta
      m({ remitente: 'titular', leido_gestor: true }),  // ya leído → no
      m({ remitente: 'gestor', leido_titular: false }), // lo envió el propio gestor → no cuenta para gestor
    ]
    expect(noLeidos(ms, 'gestor')).toBe(1)
    expect(noLeidos(ms, 'titular')).toBe(1) // el del gestor sin leer por titular
  })
  it('ordenarCronologico no muta y ordena ascendente', () => {
    const a = m({ creada_at: '2026-02-01T00:00:00Z' })
    const b = m({ creada_at: '2026-01-01T00:00:00Z' })
    const entrada = [a, b]
    const out = ordenarCronologico(entrada)
    expect(out[0]).toBe(b)
    expect(entrada[0]).toBe(a) // no mutado
  })
  it('validarTexto recorta y rechaza vacío / demasiado largo', () => {
    expect(validarTexto('  hola ')).toBe('hola')
    expect(() => validarTexto('   ')).toThrow(/vac/)
    expect(() => validarTexto('a'.repeat(5000))).toThrow(/supera/)
  })
})
