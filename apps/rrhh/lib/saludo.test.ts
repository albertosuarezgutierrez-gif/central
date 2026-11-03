import { describe, it, expect } from 'vitest'
import { saludoEmpleado } from './saludo'

describe('saludoEmpleado', () => {
  it('saluda por el primer nombre', () => {
    expect(saludoEmpleado('Antonio')).toBe('Hola, Antonio')
    expect(saludoEmpleado('  María José ')).toBe('Hola, María')
  })
  it('sin nombre no inventa nada', () => {
    expect(saludoEmpleado(null)).toBe('Hola')
    expect(saludoEmpleado(undefined)).toBe('Hola')
    expect(saludoEmpleado('   ')).toBe('Hola')
  })
  it('suaviza los nombres en mayúsculas y respeta el resto', () => {
    expect(saludoEmpleado('ÁNGEL')).toBe('Hola, Ángel')
    expect(saludoEmpleado('luis')).toBe('Hola, luis')
    expect(saludoEmpleado('JC')).toBe('Hola, JC')
  })
})
