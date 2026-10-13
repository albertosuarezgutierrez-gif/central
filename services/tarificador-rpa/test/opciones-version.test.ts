// La lista de versiones viaja COMPLETA y estructurada en el resultado de error (13/10/2026): el mensaje sigue truncado
// para la bandeja, pero asegura no tiene que parsear texto. El worker no elige nada (determinista, sin IA).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_OPCIONES_VERSION, estadoTrasError } from '@central/module-tarificacion'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador, clasificarIntento, opcionesVersionDe } from '../src/errores.ts'

const nada = { logueado: true, loginVisible: false, ultimo5xx: null }
const veinte = Array.from({ length: 20 }, (_, i) => ({ etiqueta: `F 800 versión ${i + 1}`, codigo: `C${String(i + 1).padStart(3, '0')}` }))

test('ErrorEleccionVersion con 20 versiones → mensaje truncado y las 20 estructuradas en la clasificación', () => {
  const c = clasificarIntento(new ErrorEleccionVersion(veinte), nada)
  assert.equal(c.tipo, 'captcha')
  assert.equal(estadoTrasError(c.tipo, 1), 'requiere_humano')
  assert.equal(c.transitorio, null)
  assert.match(c.mensaje, new RegExp(`\\(\\+${20 - MAX_OPCIONES_VERSION} más\\)`))
  assert.deepEqual(c.opcionesVersion, veinte)
})

test('otros errores no llevan opcionesVersion', () => {
  assert.equal(clasificarIntento(new ErrorTarificador('captcha', 'requiere_verificacion_humana: x'), nada).opcionesVersion, undefined)
  assert.equal(clasificarIntento(new Error('locator.waitFor: Timeout'), nada).opcionesVersion, undefined)
  assert.equal(opcionesVersionDe(new Error('x')), null)
})
