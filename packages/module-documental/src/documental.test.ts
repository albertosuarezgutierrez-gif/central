import { describe, it, expect } from 'vitest'
import {
  indexarCarpetas, puedeSubir, puedeVer, carpetasVisibles,
  validarSubida, construirPathStorage, type ConfigCarpeta,
} from './index.ts'

const CARPETAS: ConfigCarpeta[] = [
  { id: 'datos_personales', etiqueta: 'Datos personales', titularPuedeSubir: true, titularPuedeVer: true },
  { id: 'contratos', etiqueta: 'Contratos', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'nominas', etiqueta: 'Nóminas', titularPuedeSubir: false, titularPuedeVer: true },
  { id: 'partes_medicos', etiqueta: 'Partes médicos', titularPuedeSubir: true, titularPuedeVer: true },
]
const idx = indexarCarpetas(CARPETAS)

describe('permisos por carpeta', () => {
  it('el gestor puede subir y ver en cualquier carpeta', () => {
    expect(puedeSubir(idx, 'contratos', 'gestor')).toBe(true)
    expect(puedeVer(idx, 'nominas', 'gestor')).toBe(true)
  })
  it('el titular solo sube donde la carpeta lo permite', () => {
    expect(puedeSubir(idx, 'partes_medicos', 'titular')).toBe(true)
    expect(puedeSubir(idx, 'contratos', 'titular')).toBe(false)
    expect(puedeSubir(idx, 'nominas', 'titular')).toBe(false)
  })
  it('carpetasVisibles filtra para el titular y devuelve todo al gestor', () => {
    expect(carpetasVisibles(CARPETAS, 'gestor')).toHaveLength(4)
    expect(carpetasVisibles(CARPETAS, 'titular').map(c => c.id)).toContain('contratos')
  })
  it('lanza ante carpeta desconocida y ids duplicados', () => {
    expect(() => puedeVer(idx, 'inexistente', 'titular')).toThrow(/desconocida/)
    expect(() => indexarCarpetas([CARPETAS[0], CARPETAS[0]])).toThrow(/duplicada/)
  })
})

describe('validarSubida', () => {
  it('normaliza el nombre y acepta una subida válida del gestor', () => {
    const r = validarSubida(idx, 'gestor', { carpeta: 'contratos', nombre: '  Contrato.pdf ', tipo: 'application/pdf', tamano: 1000 })
    expect(r).toEqual({ carpeta: 'contratos', nombre: 'Contrato.pdf', tipo: 'application/pdf', tamano: 1000 })
  })
  it('rechaza al titular subiendo a una carpeta de solo lectura', () => {
    expect(() => validarSubida(idx, 'titular', { carpeta: 'nominas', nombre: 'x.pdf' })).toThrow(/permiso/)
  })
  it('rechaza nombre vacío y archivos por encima del límite', () => {
    expect(() => validarSubida(idx, 'gestor', { carpeta: 'otros' as any, nombre: 'x' })).toThrow(/desconocida/)
    expect(() => validarSubida(idx, 'gestor', { carpeta: 'contratos', nombre: '   ' })).toThrow(/obligatorio/)
    expect(() => validarSubida(idx, 'gestor', { carpeta: 'contratos', nombre: 'x.pdf', tamano: 99 * 1024 * 1024 })).toThrow(/máximo/)
  })
})

describe('construirPathStorage', () => {
  it('compone <tipo>/<id>/<carpeta>/<uuid>.<ext> y respeta la extensión', () => {
    expect(construirPathStorage({ tipo: 'empleado', id: 'e1' }, 'nominas', 'Mayo 2026.PDF', 'u1'))
      .toBe('empleado/e1/nominas/u1.pdf')
    expect(construirPathStorage({ tipo: 'empleado', id: 'e1' }, 'otros', 'sin_extension', 'u2'))
      .toBe('empleado/e1/otros/u2')
  })
})
