import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  dominioMuerto, emailSintacticoValido, prioridadDominio, presentacionAppActiva, seleccionarDestinatariosPresentacion,
  topeDiarioPresentacion, TOPE_DIARIO_MAXIMO, TOPE_DIARIO_POR_DEFECTO, type CandidatoPresentacion,
} from './presentacion-app-seleccion.ts'

const c = (id: string, email: string | null): CandidatoPresentacion => ({ clienteId: id, nombre: `N${id}`, email })

test('forma del correo: lo que trae el volcado y no es un correo, fuera', () => {
  for (const ok of ['ana@gmail.com', 'Ana.Lopez+seg@Hotmail.ES', 'x_y@dominio-uno.co.uk']) assert.ok(emailSintacticoValido(ok), ok)
  for (const malo of ['-', 'no tiene', 'ana@', '@gmail.com', 'ana@gmail', 'ana gmail.com', 'a@b.c', 'ana@@gmail.com',
    'ana@gmail.con', 'ana..x@gmail.com', '.ana@gmail.com', 'ana@gmail.com; pepe@gmail.com', 'ana@-x.com']) {
    assert.equal(emailSintacticoValido(malo), false, malo)
  }
})

test('dominios muertos y erratas: fuera', () => {
  assert.ok(dominioMuerto('pepe@wanadoo.es'))
  assert.ok(dominioMuerto('PEPE@Terra.es'))
  assert.ok(dominioMuerto('pepe@hotmial.com'))
  assert.equal(dominioMuerto('pepe@gmail.com'), false)
  assert.equal(dominioMuerto('pepe@telefonica.net'), false) // no se sabe: no se afirma
})

test('selección: dedup por correo (normalizado), ilegible ≠ sin correo, y el tope cuenta personas', () => {
  const r = seleccionarDestinatariosPresentacion([
    c('1', 'Ana@Gmail.com'),
    c('2', ' ana@gmail.com '), // misma persona, otra ficha
    c('3', null), // no se pudo descifrar
    c('4', 'nada'),
    c('5', 'luis@wanadoo.es'),
    c('6', 'eva@yahoo.es'),
    c('7', 'paco@outlook.com'),
  ], 2)
  // Buzones personales primero (gmail, yahoo, outlook), en el orden de llegada.
  assert.deepEqual(r.elegidos.map((e) => [e.clienteId, e.email]), [['1', 'ana@gmail.com'], ['6', 'eva@yahoo.es']])
  assert.deepEqual(r.descartes, { ilegible: 1, invalido: 1, dominio_muerto: 1, duplicado: 1 })
  assert.equal(r.fueraPorTope, 1)
})

test('selección: los buzones personales van antes que los de empresa; dentro, el orden de llegada', () => {
  const r = seleccionarDestinatariosPresentacion([
    c('1', 'jefe@empresa-vieja.es'),
    c('2', 'luis@hotmail.com'),
    c('3', 'otro@miempresa.com'),
    c('4', 'ana@gmail.com'),
  ], 3)
  assert.deepEqual(r.elegidos.map((e) => e.clienteId), ['2', '4', '1'])
  assert.equal(prioridadDominio('X@GMAIL.COM'), 0)
  assert.equal(prioridadDominio('x@empresa.es'), 1)
})

test('selección: tope 0 o negativo no manda nada', () => {
  assert.equal(seleccionarDestinatariosPresentacion([c('1', 'a@gmail.com')], 0).elegidos.length, 0)
  assert.equal(seleccionarDestinatariosPresentacion([c('1', 'a@gmail.com')], -5).elegidos.length, 0)
})

test('interruptor: APAGADO salvo «1» exacto', () => {
  assert.equal(presentacionAppActiva({}), false)
  assert.equal(presentacionAppActiva({ ASEGURA_PRESENTACION_APP_ACTIVA: 'true' }), false)
  assert.equal(presentacionAppActiva({ ASEGURA_PRESENTACION_APP_ACTIVA: '0' }), false)
  assert.equal(presentacionAppActiva({ ASEGURA_PRESENTACION_APP_ACTIVA: '1' }), true)
})

test('tope diario: defecto 50, nunca «sin tope», techo 500', () => {
  assert.equal(topeDiarioPresentacion({}), TOPE_DIARIO_POR_DEFECTO)
  assert.equal(topeDiarioPresentacion({ ASEGURA_PRESENTACION_APP_TOPE_DIARIO: 'abc' }), TOPE_DIARIO_POR_DEFECTO)
  assert.equal(topeDiarioPresentacion({ ASEGURA_PRESENTACION_APP_TOPE_DIARIO: '0' }), TOPE_DIARIO_POR_DEFECTO)
  assert.equal(topeDiarioPresentacion({ ASEGURA_PRESENTACION_APP_TOPE_DIARIO: '80' }), 80)
  assert.equal(topeDiarioPresentacion({ ASEGURA_PRESENTACION_APP_TOPE_DIARIO: '5000' }), TOPE_DIARIO_MAXIMO)
})
