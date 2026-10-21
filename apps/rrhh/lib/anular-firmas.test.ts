import { describe, expect, it } from 'vitest'
import { ANULAR_MAX, validarIdsAnular } from './anular-firmas'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('validarIdsAnular', () => {
  it('acepta uuids válidos y quita duplicados', () => {
    expect(validarIdsAnular({ ids: [id(1), id(2), id(1)] })).toEqual({ ok: true, ids: [id(1), id(2)] })
  })
  it('acepta exactamente 500 y rechaza 501', () => {
    expect(validarIdsAnular({ ids: Array.from({ length: ANULAR_MAX }, (_, i) => id(i)) }).ok).toBe(true)
    expect(validarIdsAnular({ ids: Array.from({ length: ANULAR_MAX + 1 }, (_, i) => id(i)) }).ok).toBe(false)
  })
  it('rechaza vacío, sin ids o ids no array', () => {
    expect(validarIdsAnular({ ids: [] }).ok).toBe(false)
    expect(validarIdsAnular({}).ok).toBe(false)
    expect(validarIdsAnular(null).ok).toBe(false)
    expect(validarIdsAnular({ ids: id(1) }).ok).toBe(false)
  })
  it('un solo id mal formado o no string invalida todo', () => {
    expect(validarIdsAnular({ ids: [id(1), 'abc'] }).ok).toBe(false)
    expect(validarIdsAnular({ ids: [id(1), 12] }).ok).toBe(false)
    expect(validarIdsAnular({ ids: [id(1), "' OR 1=1 --"] }).ok).toBe(false)
  })
})
