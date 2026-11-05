import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  autorizacionDejaElegir, duenoDeEleccion, detalleElector, eleccionDeOtraPersona, identidadesQueEligenRenovacion, mismaPersonaQueElige, textoYaElegida,
  type FilaAutorizacionRenovacion,
} from './renovacion-eleccion.ts'

const AHORA = new Date('2026-11-05T10:00:00Z')
const ANTES = new Date('2026-10-01T10:00:00Z')
const POL = 'p-1'
const fila = (x: Partial<FilaAutorizacionRenovacion> = {}): FilaAutorizacionRenovacion => ({
  autorizacionId: 'a-1', alcance: 'gestion', aceptadoEn: ANTES, caducaEn: null, revocadoEn: null, polizaId: null, polizaFusionadaEn: null,
  identidadId: 'id-el', nivelVinculo: null, nombre: 'Juan', ...x,
})

test('elegir: solo Gestión o Total; Consulta, un alcance desconocido o nada no', () => {
  assert.equal(autorizacionDejaElegir(['gestion']), true)
  assert.equal(autorizacionDejaElegir(['total']), true)
  assert.equal(autorizacionDejaElegir(['ver_economico']), false)
  assert.equal(autorizacionDejaElegir(['ver', 'documentos']), false)
  assert.equal(autorizacionDejaElegir(['partes']), false, 'otorgante tomado como persona física: `partes` solo no actúa')
  assert.equal(autorizacionDejaElegir(['inventado']), false)
  assert.equal(autorizacionDejaElegir([]), false)
})

test('autorizado-operador (Gestión, vigente, toda la ficha) ELIGE; sin nivel (Consulta) NO', () => {
  assert.deepEqual([...identidadesQueEligenRenovacion([fila()], POL, AHORA).keys()], ['id-el'])
  assert.equal(identidadesQueEligenRenovacion([fila({ alcance: 'ver_economico' })], POL, AHORA).size, 0)
})

test('autorización no vigente (pendiente, revocada, caducada) no abre nada', () => {
  assert.equal(identidadesQueEligenRenovacion([fila({ aceptadoEn: null })], POL, AHORA).size, 0, 'pendiente de aceptar')
  assert.equal(identidadesQueEligenRenovacion([fila({ revocadoEn: ANTES })], POL, AHORA).size, 0)
  assert.equal(identidadesQueEligenRenovacion([fila({ caducaEn: ANTES })], POL, AHORA).size, 0)
})

test('una autorización de OTRA póliza no abre esta; la fusionada en esta sí', () => {
  assert.equal(identidadesQueEligenRenovacion([fila({ polizaId: 'p-otra' })], POL, AHORA).size, 0)
  assert.equal(identidadesQueEligenRenovacion([fila({ polizaId: 'p-vieja', polizaFusionadaEn: POL })], POL, AHORA).size, 1)
  assert.equal(identidadesQueEligenRenovacion([fila({ polizaId: POL })], POL, AHORA).size, 1)
  assert.equal(identidadesQueEligenRenovacion([fila({ polizaId: POL })], null, AHORA).size, 0, 'sin póliza en el presupuesto, solo la ficha entera')
})

test('por FICHA del autorizado: el vínculo tiene que dejar operar y no ser la vista del corredor', () => {
  assert.equal(identidadesQueEligenRenovacion([fila({ nivelVinculo: 'gestionar' })], POL, AHORA).size, 1)
  assert.equal(identidadesQueEligenRenovacion([fila({ nivelVinculo: 'completo' })], POL, AHORA).size, 0)
  assert.equal(identidadesQueEligenRenovacion([fila({ nivelVinculo: 'tarjeta' })], POL, AHORA).size, 0)
  assert.equal(identidadesQueEligenRenovacion([fila({ nivelVinculo: 'gestionar', vinculoDeCorredor: true })], POL, AHORA).size, 0)
})

test('los alcances de una misma identidad se SUMAN; los de dos identidades no se funden', () => {
  const r = identidadesQueEligenRenovacion([
    fila({ alcance: 'ver_economico' }),
    fila({ autorizacionId: 'a-2', alcance: 'gestion', polizaId: POL }),
    fila({ autorizacionId: 'a-3', alcance: 'ver_economico', identidadId: 'id-otro', nombre: 'Ana' }),
  ], POL, AHORA)
  assert.deepEqual([...r.keys()], ['id-el'])
})

test('primera elección: el evento antiguo (sin papel) es del tomador; papel raro = otra persona sin nombre', () => {
  assert.equal(duenoDeEleccion(null, false), null)
  assert.deepEqual(duenoDeEleccion({ eleccion: 'renovacion' }, true), { papel: 'tomador', identidadId: null, nombre: null })
  const d = duenoDeEleccion(detalleElector({ papel: 'autorizado', via: 'app', identidadId: 'id-el', nombre: 'Juan' }), true)
  assert.deepEqual(d, { papel: 'autorizado', identidadId: 'id-el', nombre: 'Juan' })
  assert.deepEqual(duenoDeEleccion({ papel: 'hacker', identidadId: 'id-el' }, true), { papel: 'autorizado', identidadId: null, nombre: null })
})

test('doble elección (dos personas): la segunda ve la primera; quien eligió puede cambiar', () => {
  const porTomadora = duenoDeEleccion(detalleElector({ papel: 'tomador', via: 'app', identidadId: 'id-ella', nombre: 'Laura' }), true)!
  // Él (autorizado) llega después: ve «ya elegida por Laura».
  assert.deepEqual(eleccionDeOtraPersona(porTomadora, { papel: 'autorizado', identidadId: 'id-el' }), { nombre: 'Laura' })
  // La tomadora, por la app o por el enlace del WhatsApp (sin cuenta), es la MISMA persona: puede cambiar.
  assert.equal(eleccionDeOtraPersona(porTomadora, { papel: 'tomador', identidadId: null }), null)
  assert.equal(mismaPersonaQueElige(porTomadora, { papel: 'tomador', identidadId: 'id-otra-cuenta-suya' }), true)
  // Al revés: eligió él; la tomadora ve «ya elegida por Juan»; otra autorizada tampoco la pisa.
  const porEl = duenoDeEleccion(detalleElector({ papel: 'autorizado', via: 'app', identidadId: 'id-el', nombre: 'Juan' }), true)!
  assert.deepEqual(eleccionDeOtraPersona(porEl, { papel: 'tomador', identidadId: 'id-ella' }), { nombre: 'Juan' })
  assert.deepEqual(eleccionDeOtraPersona(porEl, { papel: 'autorizado', identidadId: 'id-otra' }), { nombre: 'Juan' })
  assert.equal(eleccionDeOtraPersona(porEl, { papel: 'autorizado', identidadId: 'id-el' }), null)
})

test('el texto de «ya elegida» lleva solo el nombre de pila (o nada)', () => {
  assert.match(textoYaElegida('Laura'), /Ya la ha elegido Laura/)
  assert.match(textoYaElegida(null), /otra persona con acceso/)
})
