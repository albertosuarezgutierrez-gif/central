import { test } from 'node:test'
import assert from 'node:assert/strict'

import { aE164, formasHashTelefono, telefonoParaFicha } from './whatsapp-telefono.ts'
import { redactarPii } from './redactar-pii.ts'

test('aE164: las cuatro formas de escribir un móvil español dan el mismo E.164', () => {
  for (const v of ['600123456', '0034600123456', '+34 600 123 456', '34600123456', '600-12-34-56', '(+34) 600.123.456']) {
    assert.equal(aE164(v), '+34600123456', v)
  }
})

test('aE164: extranjeros con +, 00 o como los manda Meta (wa_id sin +)', () => {
  assert.equal(aE164('+44 7700 900123'), '+447700900123')
  assert.equal(aE164('0044 7700 900123'), '+447700900123')
  assert.equal(aE164('447700900123'), '+447700900123')
  assert.equal(aE164('15551234567'), '+15551234567')
})

test('aE164: inválidos → null (no se «arregla» un número)', () => {
  for (const v of ['', 'hola', '12345', '500123456', '+34 500 123 456', '+34 60012345', '0600123456', '+0123456789', '+1234567890123456', null, undefined, {}]) {
    assert.equal(aE164(v as unknown), null, String(v))
  }
  // 9 dígitos sin prefijo solo se sabe leer si el país por defecto es España.
  assert.equal(aE164('600123456', 'PT'), null)
})

test('telefonoParaFicha: como lo guarda la ficha (normalizarTelefono)', () => {
  assert.equal(telefonoParaFicha('+34600123456'), '600123456')
  assert.equal(telefonoParaFicha('+447700900123'), '+447700900123')
  assert.equal(telefonoParaFicha('600123456'), null)
})

test('formasHashTelefono: todas las formas con que puede estar hasheado en la cartera, la canónica primero', () => {
  assert.deepEqual(formasHashTelefono('+34600123456'), ['600123456', '34600123456', '0034600123456'])
  assert.deepEqual(formasHashTelefono('+447700900123'), ['447700900123', '00447700900123'])
  assert.deepEqual(formasHashTelefono(null), [])
})

test('redactarPii: DNI, NIE, CIF, IBAN, tarjeta, email, teléfono, matrícula → marcadores', () => {
  const t =
    'Soy yo, mi DNI 12345678Z y el de mi mujer X1234567L, la empresa B12345678. ' +
    'Cuenta ES91 2100 0418 4502 0005 1332, tarjeta 4111 1111 1111 1111. ' +
    'Escribe a pepe.perez@gmail.com o llama al +34 600 123 456 o al 954123456. ' +
    'El coche es 1234 BCD y el viejo SE-1234-AB.'
  const r = redactarPii(t)
  for (const m of ['[DNI]', '[NIE]', '[CIF]', '[IBAN]', '[TARJETA]', '[EMAIL]', '[TELEFONO]', '[MATRICULA]']) assert.ok(r.includes(m), `${m} en «${r}»`)
  for (const dato of ['12345678Z', 'X1234567L', 'B12345678', '2100 0418', '4111', 'pepe.perez', '600 123 456', '954123456', '1234 BCD', 'SE-1234-AB']) {
    assert.ok(!r.includes(dato), `«${dato}» sigue en «${r}»`)
  }
})

test('redactarPii: no se come fechas, importes ni años', () => {
  const t = 'Me vence el 12/03/2026, pago 350,50 € al año y en 2026 te digo. Son 1.200 €.'
  assert.equal(redactarPii(t), t)
})

test('redactarPii: un número de 16 dígitos que no pasa Luhn no es tarjeta, pero tampoco se queda', () => {
  const r = redactarPii('póliza 1234567812345678')
  assert.ok(!r.includes('[TARJETA]'))
  assert.ok(!r.includes('1234567812345678'), r)
})

test('redactarPii: los nombres conocidos del contacto se tapan; las partículas no', () => {
  const r = redactarPii('Hola, soy María del Carmen Ruiz, del barrio', { nombres: ['María del Carmen', 'Ruiz', '(sin nombre)'] })
  assert.equal(r, 'Hola, soy [NOMBRE] del [NOMBRE] [NOMBRE], del barrio')
  assert.equal(redactarPii(null), '')
})
