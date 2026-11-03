// Pelayo (03/11/2026) · entradas del explorador: lista cerrada, SOLO LECTURA, sin avances ni excepciones de ningún tipo.
import { describe, expect, it } from 'vitest'
import { ENTRADAS_EXPLORACION, entradaSoloLectura, esEntradaExploracion, loginAsistidoDe } from './index.ts'

const PELAYO = ['pelayo:presupuestos:auto', 'pelayo:presupuestos:hogar']

describe('Pelayo · entradas del explorador', () => {
  it('exactamente auto y hogar, casadas con su ramo', () => {
    expect(Object.keys(ENTRADAS_EXPLORACION).filter((k) => k.startsWith('pelayo:')).sort()).toEqual(PELAYO)
    expect(ENTRADAS_EXPLORACION['pelayo:presupuestos:auto']).toMatchObject({ compania: 'pelayo', ramo: 'auto', producto: 'auto' })
    expect(ENTRADAS_EXPLORACION['pelayo:presupuestos:hogar']).toMatchObject({ compania: 'pelayo', ramo: 'hogar', producto: 'hogar' })
  })
  it('SOLO LECTURA, sin avances ni excepciones; sin login asistido', () => {
    for (const k of PELAYO) {
      const e = ENTRADAS_EXPLORACION[k]
      expect(esEntradaExploracion(k)).toBe(true)
      expect(e.soloLectura).toBe(true)
      expect(entradaSoloLectura(k)).toBe(true)
      expect([...e.avancesAutorizados]).toEqual([])
      expect(e.avancesPorId ?? []).toEqual([])
      expect(e.avancesSinTexto ?? []).toEqual([])
      expect(e.guardadosEnDialogo ?? []).toEqual([])
      expect(e.neutralizacionesOnclick ?? []).toEqual([])
      expect(e.rutasAppTolerables ?? []).toEqual([])
      expect(e.tomadorMediador).toBeUndefined()
      expect(loginAsistidoDe(k)).toBeNull()
      expect(k).toMatch(/^[a-z_]+:[a-z_]+:[a-z_]+$/)
    }
  })
  it('ninguna otra entrada es de solo lectura; una desconocida tampoco', () => {
    expect(Object.keys(ENTRADAS_EXPLORACION).filter(entradaSoloLectura).sort()).toEqual(PELAYO)
    expect(entradaSoloLectura('pelayo:presupuestos:vida')).toBe(false)
    expect(entradaSoloLectura('__proto__')).toBe(false)
  })
})
