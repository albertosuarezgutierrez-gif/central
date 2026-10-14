import { describe, expect, it } from 'vitest'
import { cortarEnLimiteDeLinea, redactarAriaSnapshot, crearTraza } from './index.ts'

describe('redactarAriaSnapshot (compartida worker/servidor)', () => {
  it('nombre con «:» conserva el [ref]; sin valor no inventa «valor»; con valor lo tapa', () => {
    expect(redactarAriaSnapshot('- textbox "Hora: inicio" [ref=e7]')).toBe('- textbox "Hora: inicio" [ref=e7]')
    expect(redactarAriaSnapshot('- textbox "Hora: fin" [ref=e8]: 10:30')).toBe('- textbox "Hora: fin" [ref=e8]: «valor»')
  })
  it('opciones elegidas pierden el nombre; el resto se conserva; idempotente', () => {
    const t = redactarAriaSnapshot('- option "Sevilla" [selected]\n- option "Cádiz"\n- radio "Mujer" [checked] [ref=e2]\n- checkbox "Acepto" [checked]')
    expect(t).toBe('- option «valor» [selected]\n- option "Cádiz"\n- radio «valor» [checked] [ref=e2]\n- checkbox "Acepto" [checked]')
    expect(redactarAriaSnapshot(t)).toBe(t)
  })
})

describe('cortarEnLimiteDeLinea', () => {
  it('corta en salto de línea, y si no hay, en espacio', () => {
    expect(cortarEnLimiteDeLinea('aaaa\nbbbb 12345678Z', 14)).toBe('aaaa')
    expect(cortarEnLimiteDeLinea('hola 12345678Z', 11)).toBe('hola')
    expect(cortarEnLimiteDeLinea('corto', 50)).toBe('corto')
  })
})

describe('traza.anotar con código fijo y fin', () => {
  it('el código fijo manda sobre el clasificador y el fin fija la duración', () => {
    const t = crearTraza(() => 'portal')
    t.anotar('login', 1000, { e: null, codigo: 'credenciales' }, 1400)
    expect(t.pasos()[0]).toMatchObject({ paso: 'login', ok: false, errorCodigo: 'credenciales', duracionMs: 400 })
  })
})
