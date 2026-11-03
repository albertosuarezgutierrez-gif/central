// Generali auto v0.2.63 (trabajo 7f358ff2): suma de libre elección de abogado = la más alta (por texto) + detector que no dice «ninguno» fuera de vista. Fixtures sintéticas.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { avisoSumaAbogadoGenerali, decisionesPendientesGenerali, elegirSumaAbogadoGenerali, portalDatosIncompletosGenerali, resumenEstadoCalculoGenerali } from '../src/adapters/generali/reglas.ts'

test('v0.2.63 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.76'))

test('suma de abogado: elige el importe más alto por TEXTO, no por value ni por posición', () => {
  assert.deepEqual(elegirSumaAbogadoGenerali(['Seleccione una suma asegurada', '1.000 €', '750 €', '500 €']), { indice: 1, importeEur: 1000, texto: '1.000 €' })
  assert.equal(elegirSumaAbogadoGenerali(['Seleccione', '500 €', '750 €', '1.500 €', '1.000 €'])?.indice, 3)
  assert.equal(elegirSumaAbogadoGenerali(['Seleccione', '500 €', '2.000 €', '750 €'])?.indice, 2)
  assert.equal(elegirSumaAbogadoGenerali(['Seleccione', '900 €', '1000 €'])?.indice, 2)
})

test('suma de abogado: sin importes o con el máximo repetido no se adivina', () => {
  assert.equal(elegirSumaAbogadoGenerali(['Seleccione una suma asegurada']), null)
  assert.equal(elegirSumaAbogadoGenerali([]), null)
  assert.equal(elegirSumaAbogadoGenerali(['Seleccione', '1.000 €', '1.000 €', '500 €']), null)
})

test('suma de abogado: el aviso lleva «supuesto» (precio estimado) y el importe', () => {
  const a = avisoSumaAbogadoGenerali('1.000 €')
  assert.match(a, /supuesto/i)
  assert.match(a, /1\.000 €/)
  assert.match(a, /abogado/)
})

test('detector: reconoce ysuabo como decisión pendiente', () => {
  assert.deepEqual(decisionesPendientesGenerali(['reg1063E.general.ysuabo']), ['Suma libre elección de abogado'])
})

test('detector: sin bloques a la vista no dice «ninguno detectado» en Garantías y Resultados', () => {
  const base = { avisos: ['No se puede calcular con datos incompletos'], obligatoriosVacios: [], botones: [], cargando: false }
  assert.ok(portalDatosIncompletosGenerali(base.avisos))
  const fuera = resumenEstadoCalculoGenerali({ ...base, bloquesVisibles: false }, [], 2000)
  assert.match(fuera, /no evaluable/)
  assert.doesNotMatch(fuera, /Garantías y Resultados»: \(ninguno detectado\)/)
  const dentro = resumenEstadoCalculoGenerali({ ...base, bloquesVisibles: true }, [], 2000)
  assert.match(dentro, /Garantías y Resultados»: \(ninguno detectado\)/)
})
