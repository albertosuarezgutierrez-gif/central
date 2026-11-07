import { describe, it, expect } from 'vitest'
import {
  validarNifNie, validarNaf, validarIbanEmpleado, enmascarar, fechaIso, validarFechaNacimiento, validarFechaAlta, validarTelefono,
} from './alta-empleado-validadores'

describe('validarNifNie', () => {
  it('acepta DNI y NIE con su letra, normalizando', () => {
    expect(validarNifNie('12345678Z')).toEqual({ ok: true, valor: '12345678Z' })
    expect(validarNifNie(' 12.345.678-z ')).toEqual({ ok: true, valor: '12345678Z' })
    expect(validarNifNie('X1234567L')).toEqual({ ok: true, valor: 'X1234567L' })
    expect(validarNifNie('Y0000000Z')).toEqual({ ok: true, valor: 'Y0000000Z' })
    expect(validarNifNie('Z9999999H')).toEqual({ ok: true, valor: 'Z9999999H' })
  })
  it('rellena el 0 que Excel quita a un DNI', () => {
    expect(validarNifNie('1234567L')).toEqual({ ok: true, valor: '01234567L' })
  })
  it('rechaza letra equivocada, formato y vacío sin repetir el dato', () => {
    const r = validarNifNie('12345678A')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.motivo).not.toContain('12345678')
    expect(validarNifNie('X1234567T').ok).toBe(false)
    expect(validarNifNie('123456789').ok).toBe(false)
    expect(validarNifNie('B12345678').ok).toBe(false) // un CIF no es un trabajador
    expect(validarNifNie('').ok).toBe(false)
  })
})

describe('validarNaf (algoritmo TGSS, mod 97)', () => {
  it('acepta NAF reales de ejemplo', () => {
    expect(validarNaf('281234567840')).toEqual({ ok: true, valor: '281234567840' }) // número ≥ 10⁷: concatenado
    expect(validarNaf('28/12345678/40')).toEqual({ ok: true, valor: '281234567840' })
    expect(validarNaf('080123456774')).toEqual({ ok: true, valor: '080123456774' }) // número < 10⁷: provincia·10⁷ + número
    expect(validarNaf('411020304021')).toEqual({ ok: true, valor: '411020304021' })
  })
  it('rellena el 0 de provincia que Excel quita', () => {
    expect(validarNaf('80123456774')).toEqual({ ok: true, valor: '080123456774' })
  })
  it('rechaza control erróneo, longitud, letras y provincia 00', () => {
    expect(validarNaf('281234567841').ok).toBe(false)
    expect(validarNaf('2812345678').ok).toBe(false)
    expect(validarNaf('28123456784A').ok).toBe(false)
    expect(validarNaf('000000000000').ok).toBe(false)
    // Mismo número con el control de la otra fórmula: distinguir las dos ramas importa.
    expect(validarNaf('080123456700').ok).toBe(false)
  })
})

describe('validarIbanEmpleado (validarIban de module-pagos)', () => {
  it('acepta IBAN reales con y sin espacios', () => {
    expect(validarIbanEmpleado('ES91 2100 0418 4502 0005 1332')).toEqual({ ok: true, valor: 'ES9121000418450200051332' })
    expect(validarIbanEmpleado('es7921000813610123456789')).toEqual({ ok: true, valor: 'ES7921000813610123456789' })
    expect(validarIbanEmpleado('DE89370400440532013000').ok).toBe(true)
  })
  it('rechaza control erróneo y longitud española incorrecta', () => {
    expect(validarIbanEmpleado('ES9121000418450200051331').ok).toBe(false)
    expect(validarIbanEmpleado('ES912100041845020005133').ok).toBe(false)
    expect(validarIbanEmpleado('').ok).toBe(false)
  })
})

describe('fechas', () => {
  const hoy = '2026-11-07'
  it('fechaIso admite ISO y DD/MM/AAAA de días que existen', () => {
    expect(fechaIso('2026-02-28')).toBe('2026-02-28')
    expect(fechaIso('7/1/1990')).toBe('1990-01-07')
    expect(fechaIso('29/02/2024')).toBe('2024-02-29')
    expect(fechaIso('29/02/2026')).toBeNull()
    expect(fechaIso('31/04/2026')).toBeNull()
    expect(fechaIso('1990')).toBeNull()
  })
  it('nacimiento: entre 16 y 100 años', () => {
    expect(validarFechaNacimiento('07/11/2010', hoy)).toEqual({ ok: true, valor: '2010-11-07' })
    expect(validarFechaNacimiento('08/11/2010', hoy).ok).toBe(false)
    expect(validarFechaNacimiento('01/01/1900', hoy).ok).toBe(false)
  })
  it('alta: no más de un año vista', () => {
    expect(validarFechaAlta('2027-11-07', hoy).ok).toBe(true)
    expect(validarFechaAlta('2027-11-08', hoy).ok).toBe(false)
    expect(validarFechaAlta('2026-13-01', hoy).ok).toBe(false)
  })
})

describe('otros', () => {
  it('enmascarar deja solo los 4 últimos', () => {
    expect(enmascarar('ES9121000418450200051332')).toBe('••••••••1332')
    expect(enmascarar('12345678Z')).toBe('•••••678Z')
    expect(enmascarar('')).toBe('')
  })
  it('teléfono', () => {
    expect(validarTelefono('637 349 990')).toEqual({ ok: true, valor: '637349990' })
    expect(validarTelefono('+34637349990').ok).toBe(true)
    expect(validarTelefono('12345').ok).toBe(false)
  })
})
