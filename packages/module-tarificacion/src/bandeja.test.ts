import { describe, it, expect } from 'vitest'
import { ESTADOS_TRABAJO, decidirAccionBandeja, motivoLegible, puedeTransitar } from './index.ts'

describe('bandeja · acciones válidas solo desde los estados permitidos', () => {
  it('reintentar: solo desde requiere_humano y error_definitivo, y lleva a pendiente', () => {
    for (const e of ESTADOS_TRABAJO) {
      const d = decidirAccionBandeja('reintentar', e)
      expect(d.ok, e).toBe(e === 'requiere_humano' || e === 'error_definitivo')
      if (d.ok) expect(d.a).toBe('pendiente')
    }
  })
  it('cancelar: desde requiere_humano, error_definitivo y error_reintentable; nunca un trabajo vivo, ok o ya cancelado', () => {
    for (const e of ESTADOS_TRABAJO) {
      const d = decidirAccionBandeja('cancelar', e)
      expect(d.ok, e).toBe(['requiere_humano', 'error_definitivo', 'error_reintentable'].includes(e))
      if (d.ok) expect(d.a).toBe('cancelado')
    }
  })
  it('un error de emisión no se reintenta (pero sí se cancela)', () => {
    expect(decidirAccionBandeja('reintentar', 'error_definitivo', 'emision').ok).toBe(false)
    expect(decidirAccionBandeja('cancelar', 'error_definitivo', 'emision').ok).toBe(true)
  })
  it('acción o estado desconocidos → no', () => {
    expect(decidirAccionBandeja('borrar', 'requiere_humano').ok).toBe(false)
    expect(decidirAccionBandeja('reintentar', 'inventado').ok).toBe(false)
    expect(decidirAccionBandeja('reintentar', undefined).ok).toBe(false)
  })
  it('la máquina de estados del orquestador no cambia: requiere_humano solo pasa a cancelado', () => {
    expect(puedeTransitar('requiere_humano', 'pendiente')).toBe(false)
    expect(puedeTransitar('error_definitivo', 'pendiente')).toBe(false)
  })
})

describe('bandeja · motivo legible', () => {
  it('usa una frase por tipo y no vuelca el mensaje técnico', () => {
    const m = motivoLegible({ tipo: 'portal', mensaje: 'locator(#x) timeout 30000ms at /app/src/foo.ts' })
    expect(m).not.toContain('locator')
    expect(m).toContain('portal')
  })
  it('el aviso de verificación humana sale tal cual, sin el prefijo técnico', () => {
    const m = motivoLegible({ tipo: 'captcha', mensaje: 'requiere_verificacion_humana: Generali pide un código SMS' })
    expect(m).toBe('Generali pide un código SMS')
  })
  it('sin error o con basura → texto neutro, nunca vacío ni undefined', () => {
    for (const e of [null, undefined, 'x', [], {}, { tipo: 'rarísimo' }]) expect(motivoLegible(e, 'requiere_humano').length).toBeGreaterThan(10)
    expect(motivoLegible(null, 'error_definitivo')).toContain('sin un motivo')
  })
})
