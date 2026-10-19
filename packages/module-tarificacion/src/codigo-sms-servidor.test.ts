// Cepos del sello del código SMS (19/10/2026). Vistos en ROJO: AAD sin el trabajo, código de 3/9 dígitos y la privada en JSON.
import { inspect } from 'node:util'
import { describe, it, expect } from 'vitest'
import { ParCodigoSms, clavePublicaSmsValida, codigoSmsValido, sellarCodigoSms, selloCodigoSmsValido } from './codigo-sms-servidor.ts'

const T1 = '11111111-2222-4333-8444-555555555555'
const T2 = '99999999-2222-4333-8444-555555555555'

describe('código SMS · forma', () => {
  it('solo 4 a 8 dígitos, sin espacios ni signos', () => {
    for (const ok of ['1234', '123456', '12345678']) expect(codigoSmsValido(ok)).toBe(true)
    for (const malo of ['123', '123456789', ' 123456', '123 456', '12345a', '١٢٣٤', '', null, 123456]) expect(codigoSmsValido(malo)).toBe(false)
  })
  it('la clave pública es de 32 bytes en base64url', () => {
    expect(clavePublicaSmsValida(new ParCodigoSms().publica)).toBe(true)
    expect(clavePublicaSmsValida('x'.repeat(43) + '=')).toBe(false)
    expect(clavePublicaSmsValida('abc')).toBe(false)
  })
})

describe('código SMS · sello', () => {
  it('ida y vuelta: solo el par del trabajo lo abre, y solo para ESE trabajo', () => {
    const par = new ParCodigoSms()
    const s = sellarCodigoSms('482913', par.publica, T1)
    expect(selloCodigoSmsValido(s)).toBe(true)
    expect(s).not.toContain('482913')
    expect(par.abrir(s, T1)).toBe('482913')
    expect(par.abrir(s, T2)).toBeNull()
    expect(new ParCodigoSms().abrir(s, T1)).toBeNull()
  })
  it('un byte cambiado o un sello sin forma = null (nunca lanza)', () => {
    const par = new ParCodigoSms()
    const s = sellarCodigoSms('1234', par.publica, T1)
    // Primer carácter del cifrado, no el último: el último base64 lleva bits de relleno y cambiarlo
    // a veces no altera ningún byte (test intermitente).
    const i = s.lastIndexOf('.') + 1
    const otro = s[i] === 'A' ? 'B' : 'A'
    expect(par.abrir(s.slice(0, i) + otro + s.slice(i + 1), T1)).toBeNull()
    expect(par.abrir('c1.basura', T1)).toBeNull()
    expect(par.abrir('', T1)).toBeNull()
  })
  it('sellar un código sin forma lanza SIN el código en el mensaje', () => {
    const par = new ParCodigoSms()
    expect(() => sellarCodigoSms('12 34', par.publica, T1)).toThrow(/^codigo_sms_invalido$/)
    expect(() => sellarCodigoSms('1234', 'abc', T1)).toThrow(/^clave_publica_invalida$/)
  })
  it('la privada no se serializa', () => {
    const par = new ParCodigoSms()
    expect(JSON.stringify({ par })).toBe('{"par":"[par-codigo-sms]"}')
    expect(inspect(par)).toBe('[par-codigo-sms]')
  })
})
