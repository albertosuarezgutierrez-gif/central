import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SECCIONES, seccionDeParametro, esAccionable, contarAccionables, agregarContadores,
} from './secciones.ts'

/**
 * Las cuatro secciones de la correduría.
 *
 * Lo que se vigila aquí no es el reparto (eso es una decisión de diseño que
 * puede cambiar) sino las dos cosas que, si se rompen, la pantalla MIENTE:
 *   1. un `?s=` inventado no puede dejarla en blanco;
 *   2. un contador que no se ha podido leer no puede acabar pintado como 0
 *      —que es lo que hace que una pestaña esconda trabajo en silencio—, ni
 *      un contador que aún no ha cargado puede pintarse como una alarma.
 */

test('un ?s= desconocido o ausente cae en «Hoy», no en blanco', () => {
  assert.equal(seccionDeParametro(undefined), 'hoy')
  assert.equal(seccionDeParametro(''), 'hoy')
  assert.equal(seccionDeParametro('inventada'), 'hoy')
  assert.equal(seccionDeParametro('comisiones'), 'comisiones')
  // Next puede entregar el parámetro repetido como array.
  assert.equal(seccionDeParametro(['datos', 'hoy']), 'datos')
})

test('todas las secciones declaradas se resuelven a sí mismas', () => {
  for (const s of SECCIONES) assert.equal(seccionDeParametro(s), s)
})

test('«a tiempo» NO es trabajo de hoy; las tres urgencias del preaviso sí', () => {
  assert.equal(esAccionable('vencida'), true)
  assert.equal(esAccionable('prorroga_inevitable'), true)
  assert.equal(esAccionable('ultima_llamada'), true)
  assert.equal(esAccionable('a_tiempo'), false)
  // Una urgencia que el puerto invente mañana no se cuela como accionable.
  assert.equal(esAccionable('lo_que_sea'), false)
})

test('contarAccionables: sin lista es «no se sabe», nunca 0', () => {
  assert.equal(contarAccionables(null), null)
  assert.equal(contarAccionables(undefined), null)
  assert.equal(contarAccionables([]), 0)
  assert.equal(
    contarAccionables([{ urgencia: 'vencida' }, { urgencia: 'a_tiempo' }, { urgencia: 'ultima_llamada' }]),
    2,
  )
})

test('agregarContadores: todo legible → el total exacto', () => {
  assert.deepEqual(agregarContadores([2, 3, 0]), { n: 5, parcial: false })
})

test('agregarContadores: una cola ilegible marca el total como SUELO, no lo esconde', () => {
  // 2 + 3 + «no se sabe» no puede pintarse como un 5 limpio: eso taparía justo
  // la cola caída. Se dice «hay al menos 5» (la barra pinta «5+»).
  assert.deepEqual(agregarContadores([2, 3, null]), { n: 5, parcial: true })
})

test('agregarContadores: si NINGUNA cola es legible, el resultado es null (se pinta «!», no 0)', () => {
  assert.equal(agregarContadores([null, null]), null)
})

test('agregarContadores: lo que aún no ha cargado no es una alarma', () => {
  // Al abrir la pantalla todos los bloques están en `undefined`. Si eso contara
  // como hueco, la barra saldría con un «!» en cada pestaña durante la carga y
  // Alberto aprendería a ignorarlo.
  assert.deepEqual(agregarContadores([undefined, undefined]), { n: 0, parcial: false })
  assert.deepEqual(agregarContadores([4, undefined]), { n: 4, parcial: false })
  // Pero un `null` de verdad mezclado con lo que aún carga SÍ es un hueco.
  assert.deepEqual(agregarContadores([4, undefined, null]), { n: 4, parcial: true })
})

test('agregarContadores: el 0 legible es un VALOR, no un hueco', () => {
  assert.deepEqual(agregarContadores([0]), { n: 0, parcial: false })
})
