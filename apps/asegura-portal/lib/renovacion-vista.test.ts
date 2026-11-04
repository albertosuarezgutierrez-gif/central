import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarEleccion, puedeElegirRenovacion, textoDiferenciaRenovacion, textoEleccionHecha, TEXTOS_RENOVACION } from './renovacion-vista.ts'

test('diferencia con la renovación: formato español; sin renovación no hay ahorro', () => {
  assert.equal(textoDiferenciaRenovacion(2000, 2162.49), '162,49€ menos que tu renovación')
  assert.equal(textoDiferenciaRenovacion(3500, 2162.49), '1.337,51€ más que tu renovación')
  assert.equal(textoDiferenciaRenovacion(100, 100), 'el mismo precio que tu renovación')
  assert.equal(textoDiferenciaRenovacion(100, null), null)
  assert.equal(textoDiferenciaRenovacion(100, 0), null, 'una renovación de 0 no es un precio')
  assert.equal(textoDiferenciaRenovacion(null, 100), null)
})

const base = { enviadoAt: new Date(), caducado: false, retirado: false, aceptadoAt: null, emitidoAt: null, accesoWhatsapp: false, tercero: false, vistaDeCorredor: false }

test('elegir: solo con la sesión del portal sobre una renovación publicada, vigente, sin firmar ni emitir', () => {
  assert.equal(puedeElegirRenovacion(base), true)
  assert.equal(puedeElegirRenovacion({ ...base, enviadoAt: null }), false)
  assert.equal(puedeElegirRenovacion({ ...base, caducado: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, retirado: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, aceptadoAt: new Date() }), false)
  assert.equal(puedeElegirRenovacion({ ...base, emitidoAt: new Date() }), false)
  assert.equal(puedeElegirRenovacion({ ...base, accesoWhatsapp: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, tercero: true }), false)
  assert.equal(puedeElegirRenovacion({ ...base, vistaDeCorredor: true }), false, 'la vista previa no elige')
})

test('la elección hecha: null = no consta (no se dice «no has elegido»)', () => {
  assert.equal(textoEleccionHecha(null, null, null), null)
  assert.match(textoEleccionHecha({ tipo: 'renovacion' }, null, null) ?? '', /quedarte con tu renovación/)
  assert.match(textoEleccionHecha({ tipo: 'opcion', opcionId: 'x' }, { compania: 'Reale' }, null) ?? '', /Reale.*antes de emitir/)
})

test('respuesta del puente: 503 = no disponible; solo 200 ok es una elección guardada', () => {
  assert.equal(interpretarEleccion(200, { estado: 'ok', aviso: 'x' }).estado, 'ok')
  assert.equal(interpretarEleccion(200, { estado: 'raro' }).estado, 'error')
  assert.equal(interpretarEleccion(503, { estado: 'sin_migracion' }).estado, 'no_disponible')
  assert.equal(interpretarEleccion(429, { estado: 'limite' }).estado, 'limite')
  assert.equal(interpretarEleccion(410, { estado: 'caducado' }).estado, 'caducado')
  assert.equal(interpretarEleccion(502, null).estado, 'error')
})

test('el texto dice que elegir no contrata ni firma', () => {
  assert.match(TEXTOS_RENOVACION.noContrata, /no contrata nada/)
})

test('cepo: el cuerpo al puente lleva la identidad de la SESIÓN y nunca un clienteId', () => {
  const src = readFileSync(new URL('./renovacion-vista.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /clienteId/)
  const ruta = readFileSync(new URL('../app/api/presupuesto/elegir/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /requireIdentidad\(\)/)
  assert.match(ruta, /identidad\.corredor/)
  assert.doesNotMatch(ruta, /clienteId/)
})
