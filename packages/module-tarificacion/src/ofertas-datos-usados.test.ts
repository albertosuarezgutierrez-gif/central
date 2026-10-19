// Datos que la compañía usó (18/10/2026): saneado PURO. Valores INVENTADOS.
import { describe, it, expect } from 'vitest'
import { conDatosUsados, datosUsadosDe, validarOfertas } from './index.ts'

describe('datosUsadosDe', () => {
  it('CP solo cifras (5), localidad sin «NNNNN - », vehículo por partes; lo ilegible es null (nunca de la ficha)', () => {
    expect(datosUsadosDe({ codigoPostal: ' 00001 ', localidad: '00001 - LOCALIDAD', vehiculo: { marca: 'MARCA', modelo: ' MODELO ', version: '' } }))
      .toEqual({ codigoPostal: '00001', localidad: 'LOCALIDAD', vehiculo: { marca: 'MARCA', modelo: 'MODELO', version: null } })
    expect(datosUsadosDe({ codigoPostal: '123', localidad: null, vehiculo: { denominacion: 'MARCA MODELO VERSION' } }))
      .toEqual({ codigoPostal: null, localidad: null, vehiculo: { marca: null, modelo: null, version: null, denominacion: 'MARCA MODELO VERSION' } })
  })
  it('nada legible → null; sin objeto → null', () => {
    expect(datosUsadosDe({ codigoPostal: '', vehiculo: {} })).toBeNull()
    expect(datosUsadosDe('00001')).toBeNull()
  })
  it('viaja por validarOfertas (y una oferta sin él no lo inventa)', () => {
    const base = { compania: 'allianz', producto: 'P', primaAnualEur: 100, avisos: [] }
    const v = validarOfertas(conDatosUsados([base as never], { codigoPostal: '00001', vehiculo: { marca: 'M' } }), 0)
    expect(v.ok && v.ofertas[0]!.datosUsados).toEqual({ codigoPostal: '00001', localidad: null, vehiculo: { marca: 'M', modelo: null, version: null } })
    const w = validarOfertas([base], 0)
    expect(w.ok && 'datosUsados' in w.ofertas[0]!).toBe(false)
  })
})
