import { test } from 'node:test'
import assert from 'node:assert'
import { tipoDispositivo, CONFIG_ACCESO_DEFAULT } from './tipo.ts'

test('tipoDispositivo: categorías de control de acceso → acceso', () => {
  assert.equal(tipoDispositivo('mk'), 'acceso')          // access control
  assert.equal(tipoDispositivo('ms'), 'acceso')          // smart lock
  assert.equal(tipoDispositivo('jtmspro'), 'acceso')     // residential lock pro
})

test('tipoDispositivo: categorías de ventilador → ventilador', () => {
  assert.equal(tipoDispositivo('fs'), 'ventilador')      // fan
  assert.equal(tipoDispositivo('fsd'), 'ventilador')     // fan+light
  assert.equal(tipoDispositivo('fskg'), 'ventilador')    // fan wall switch
})

test('tipoDispositivo: desconocida/vacía → otro', () => {
  assert.equal(tipoDispositivo('xyz'), 'otro')
  assert.equal(tipoDispositivo(''), 'otro')
  assert.equal(tipoDispositivo(null), 'otro')
})

test('CONFIG_ACCESO_DEFAULT tiene los valores por defecto documentados', () => {
  assert.equal(CONFIG_ACCESO_DEFAULT.autoPin, true)
  assert.equal(CONFIG_ACCESO_DEFAULT.entrega, 'ambos')
  assert.equal(CONFIG_ACCESO_DEFAULT.pinLongitud, 6)
  assert.equal(CONFIG_ACCESO_DEFAULT.botonAbrir, true)
  assert.deepEqual(CONFIG_ACCESO_DEFAULT.smoobuApartmentIds, [])
})
