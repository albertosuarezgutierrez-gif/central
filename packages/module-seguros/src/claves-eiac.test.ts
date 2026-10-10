import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAVES_EIAC, etiquetaClave, type TablaClaveEiac } from './claves-eiac.ts'

test('un código oficial devuelve su etiqueta literal del estándar', () => {
  assert.equal(etiquetaClave('situacionPoliza', 'EV'), 'En Vigor')
  assert.equal(etiquetaClave('situacionPoliza', 'PR'), 'Propuesta')
  assert.equal(etiquetaClave('situacionRecibo', 'CO'), 'Cobrado')
  assert.equal(etiquetaClave('combustible', 'DI'), 'Diesel')
  assert.equal(etiquetaClave('formaPago', 'CC'), 'Cuenta bancaria')
  assert.equal(etiquetaClave('claseInmueble', 'UD'), 'Unifamiliar adosada')
  assert.equal(etiquetaClave('zona', 'UR'), 'Zona urbanizada')
})

test('un código que el estándar no trae vuelve CRUDO, nunca se adivina', () => {
  assert.equal(etiquetaClave('situacionPoliza', 'ZZ'), 'ZZ')
  assert.equal(etiquetaClave('combustible', 'XX'), 'XX')
})

test('no hace «trim» ni mayúsculas por su cuenta: «ev» no es «EV»', () => {
  assert.equal(etiquetaClave('situacionPoliza', 'ev'), 'ev')
})

test('null / undefined / vacío devuelven null (dato que NO hay)', () => {
  assert.equal(etiquetaClave('combustible', null), null)
  assert.equal(etiquetaClave('combustible', undefined), null)
  assert.equal(etiquetaClave('combustible', ''), null)
})

test('un código heredado de Object.prototype no se confunde con una clave', () => {
  assert.equal(etiquetaClave('combustible', 'constructor'), 'constructor')
  assert.equal(etiquetaClave('combustible', '__proto__'), '__proto__')
})

test('situación de póliza: exactamente las cinco claves de §13.3.32', () => {
  assert.deepEqual(Object.keys(CLAVES_EIAC.situacionPoliza).sort(), ['AN', 'ES', 'EV', 'EX', 'PR'])
})

test('toda tabla tiene al menos una clave y etiquetas no vacías', () => {
  for (const tabla of Object.keys(CLAVES_EIAC) as TablaClaveEiac[]) {
    const entradas = Object.entries(CLAVES_EIAC[tabla])
    assert.ok(entradas.length > 0, tabla)
    for (const [codigo, etiqueta] of entradas) {
      assert.ok(codigo.length > 0 && etiqueta.trim().length > 0, `${tabla}.${codigo}`)
    }
  }
})
