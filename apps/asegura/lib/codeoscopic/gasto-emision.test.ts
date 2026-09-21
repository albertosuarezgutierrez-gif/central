import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COSTE_EMISION_CENTS_DEFECTO,
  COSTE_EMISION_CENTS_MAXIMO,
  ENV_COSTE_CENTS,
  ENV_TOPE_DIARIO,
  FACTOR_TOPE_EMISION,
  MOTIVOS_EMISION,
  MOTIVO_RERATE,
  MOTIVO_SUBMIT,
  costeEmisionCents,
  describirCoste,
  puedeGastarEmision,
  topesEmision,
} from './gasto-emision.ts'
import { TOPE_DIARIO_DEFECTO, TOPE_MENSUAL_DEFECTO } from './config.ts'
import type { Consumo } from './contador.ts'

const VACIO: Consumo = { diaFacturables: 0, diaEnVuelo: 0, mesFacturables: 0, mesEnVuelo: 0 }

test('el coste arranca en CERO: no está confirmado que el ReRate ni el Submit facturen', () => {
  assert.equal(COSTE_EMISION_CENTS_DEFECTO, 0)
  assert.equal(costeEmisionCents('rerate', {}), 0)
  assert.equal(costeEmisionCents('submit', {}), 0)
})

test('el coste se pone por env, sin tocar código, y cada operación lleva la suya', () => {
  const env = { [ENV_COSTE_CENTS.rerate]: '50', [ENV_COSTE_CENTS.submit]: '25' }
  assert.equal(costeEmisionCents('rerate', env), 50)
  assert.equal(costeEmisionCents('submit', env), 25)
  // Y no se cruzan: poner el del ReRate no le pone precio al Submit.
  assert.equal(costeEmisionCents('submit', { [ENV_COSTE_CENTS.rerate]: '50' }), 0)
})

test('un coste ilegible o desbocado NO se interpreta como «lo que diga el vendor»', () => {
  for (const malo of ['', '   ', 'cincuenta', '-1', '1.5', 'NaN']) {
    assert.equal(costeEmisionCents('rerate', { [ENV_COSTE_CENTS.rerate]: malo }), 0, `«${malo}»`)
  }
  // Techo contra el dedo gordo: un 5000 (50,00€ por llamada) se recorta.
  assert.equal(
    costeEmisionCents('rerate', { [ENV_COSTE_CENTS.rerate]: '5000' }),
    COSTE_EMISION_CENTS_MAXIMO,
  )
})

test('🚨 con el coste a 0 NO se escribe «0,00€»: se dice que no está confirmado', () => {
  const texto = describirCoste('rerate', 7, 0)
  assert.doesNotMatch(texto, /0,00€/, 'un «0,00€» se leería como «esta llamada es gratis», y eso no se sabe')
  assert.match(texto, /sin confirmar/)
  assert.match(texto, new RegExp(ENV_COSTE_CENTS.rerate), 'tiene que decir qué env hay que poner')
  // Con coste puesto sí es una cifra, en formato español y con el € detrás.
  assert.equal(describirCoste('rerate', 7, 50), '3,50€')
})

test('los topes salen de los de cotizar por el factor, y se pisan por env', () => {
  const t = topesEmision('rerate', {})
  assert.equal(t.diario, TOPE_DIARIO_DEFECTO * FACTOR_TOPE_EMISION)
  assert.equal(t.mensual, TOPE_MENSUAL_DEFECTO * FACTOR_TOPE_EMISION)
  // El factor NO es estético: la cascada de reparación puede hacer dos
  // llamadas por acción del corredor, así que con el mismo tope que cotizar
  // este freno cortaría una emisión legítima.
  assert.ok(t.diario > TOPE_DIARIO_DEFECTO)
  assert.equal(topesEmision('rerate', { [ENV_TOPE_DIARIO.rerate]: '3' }).diario, 3)
  // Y el de una operación no mueve el de la otra.
  assert.equal(
    topesEmision('submit', { [ENV_TOPE_DIARIO.rerate]: '3' }).diario,
    TOPE_DIARIO_DEFECTO * FACTOR_TOPE_EMISION,
  )
})

test('lo que quedó EN VUELO cuenta: una llamada sin desenlace no es una llamada gratis', () => {
  const topes = { diario: 2, mensual: 100 }
  const enVuelo: Consumo = { diaFacturables: 0, diaEnVuelo: 2, mesFacturables: 0, mesEnVuelo: 2 }
  const v = puedeGastarEmision('rerate', enVuelo, topes, 0)
  assert.equal(v.permitido, false)
  if (v.permitido) return
  assert.equal(v.motivo, 'tope-diario')
  assert.match(v.explicacion, /ReRate/)
  assert.match(v.explicacion, new RegExp(ENV_TOPE_DIARIO.rerate), 'tiene que decir qué env subir')
})

test('el veredicto dice cuántas quedan, y el tope mensual también corta', () => {
  const ok = puedeGastarEmision('submit', VACIO, { diario: 5, mensual: 9 }, 0)
  assert.equal(ok.permitido, true)
  if (!ok.permitido) return
  assert.equal(ok.restantesHoy, 5)
  assert.equal(ok.restantesMes, 9)

  const mes: Consumo = { diaFacturables: 0, diaEnVuelo: 0, mesFacturables: 9, mesEnVuelo: 0 }
  const corta = puedeGastarEmision('submit', mes, { diario: 5, mensual: 9 }, 0)
  assert.equal(corta.permitido, false)
  if (corta.permitido) return
  assert.equal(corta.motivo, 'tope-mensual')
  assert.match(corta.explicacion, /Submit/)
})

test('los motivos del libro son exactamente los dos, y son el valor de la operación', () => {
  assert.deepEqual([...MOTIVOS_EMISION], ['rerate', 'submit'])
  assert.equal(MOTIVO_RERATE, 'rerate')
  assert.equal(MOTIVO_SUBMIT, 'submit')
})
