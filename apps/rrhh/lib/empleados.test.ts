import { describe, it, expect } from 'vitest'
import { generarAccesoToken, normalizarEmpleado } from '@/lib/empleados'

describe('empleados', () => {
  it('genera un token de acceso url-safe de >= 20 chars', () => {
    const t = generarAccesoToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(20)
    expect(generarAccesoToken()).not.toBe(t)
  })
  it('normaliza recortando espacios y vaciando opcionales en blanco', () => {
    const e = normalizarEmpleado({ nombre: '  Ana  ', apellidos: '  Pérez  ', dni: '', email: ' a@b.com ', telefono: '   ' })
    expect(e).toEqual({ nombre: 'Ana', apellidos: 'Pérez', dni: null, email: 'a@b.com', telefono: null })
  })
  it('lanza si el nombre queda vacío', () => {
    expect(() => normalizarEmpleado({ nombre: '   ' })).toThrow()
  })
})
