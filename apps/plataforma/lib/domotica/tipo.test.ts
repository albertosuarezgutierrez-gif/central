import { test } from 'node:test'
import assert from 'node:assert'
import { tipoDispositivo, tipoEfectivo, CONFIG_ACCESO_DEFAULT, normalizarConfigAcceso } from './tipo.ts'

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
  assert.equal(CONFIG_ACCESO_DEFAULT.entrega, 'aviso') // safe-by-default: nada al huésped sin activarlo a mano
  assert.equal(CONFIG_ACCESO_DEFAULT.pinLongitud, 6)
  assert.equal(CONFIG_ACCESO_DEFAULT.botonAbrir, true)
  assert.deepEqual(CONFIG_ACCESO_DEFAULT.smoobuApartmentIds, [])
})

test('tipoEfectivo: override manual manda sobre la categoría', () => {
  // Categoría no reconocida → sería 'otro', pero el override lo fuerza a 'acceso'.
  assert.equal(tipoEfectivo({ tipoManual: 'acceso' }, 'categoria_rara'), 'acceso')
  assert.equal(tipoEfectivo({ tipoManual: 'ventilador' }, 'mk'), 'ventilador')
})

test('tipoEfectivo: sin override cae a la categoría', () => {
  assert.equal(tipoEfectivo(null, 'mk'), 'acceso')
  assert.equal(tipoEfectivo({}, 'fs'), 'ventilador')
  assert.equal(tipoEfectivo({ tipoManual: 'basura' }, 'fs'), 'ventilador') // valor inválido se ignora
})

test('normalizarConfigAcceso rellena defaults y sub-objeto alertas', () => {
  const c = normalizarConfigAcceso({ autoPin: false, alertas: { timbre: true } as never })
  assert.equal(c.autoPin, false)
  assert.equal(c.entrega, 'aviso')          // default
  assert.equal(c.alertas.timbre, true)       // override
  assert.equal(c.alertas.offlineLeadHoras, 12) // default conservado
  assert.deepEqual(c.smoobuApartmentIds, [])
  assert.deepEqual(c.codigosFijos, [])
})
