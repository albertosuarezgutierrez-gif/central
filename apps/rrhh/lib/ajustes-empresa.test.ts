import { describe, it, expect } from 'vitest'
import { validarPermiteFicharSinUbicacion as v } from './ajustes-empresa'

describe('validarPermiteFicharSinUbicacion', () => {
  it('acepta true y false', () => {
    expect(v({ permite_fichar_sin_ubicacion: true })).toEqual({ ok: true, valor: true })
    expect(v({ permite_fichar_sin_ubicacion: false })).toEqual({ ok: true, valor: false })
  })
  it('rechaza todo lo que no sea booleano estricto', () => {
    for (const x of ['true', 'false', 1, 0, null, undefined, {}, []]) {
      expect(v({ permite_fichar_sin_ubicacion: x }).ok).toBe(false)
    }
  })
  it('rechaza cuerpo ausente, no objeto o sin el campo', () => {
    for (const b of [null, undefined, 'x', 5, [], {}, { otro: true }]) expect(v(b).ok).toBe(false)
  })
})
