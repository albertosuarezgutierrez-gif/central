import { describe, it, expect, afterEach } from 'vitest'
import { requireSecret } from './secret'

const ORIG = { ...process.env }
afterEach(() => { process.env = { ...ORIG } })

describe('requireSecret', () => {
  it('devuelve el valor del entorno si está', () => {
    process.env.TEST_SECRET_X = 'real'
    expect(requireSecret('TEST_SECRET_X', 'dev')).toBe('real')
  })

  it('en desarrollo cae al fallback', () => {
    delete process.env.TEST_SECRET_X
    process.env.NODE_ENV = 'development'
    expect(requireSecret('TEST_SECRET_X', 'dev')).toBe('dev')
  })

  it('en producción lanza si falta', () => {
    delete process.env.TEST_SECRET_X
    process.env.NODE_ENV = 'production'
    expect(() => requireSecret('TEST_SECRET_X', 'dev')).toThrow(/producción/)
  })

  it('sin fallback de dev lanza aunque no sea producción', () => {
    delete process.env.TEST_SECRET_X
    process.env.NODE_ENV = 'test'
    expect(() => requireSecret('TEST_SECRET_X')).toThrow()
  })
})
