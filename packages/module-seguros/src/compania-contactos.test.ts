import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AREAS_CONTACTO,
  areaContacto,
  etiquetaArea,
  ordenarContactos,
  contactoDestacado,
  type ContactoCompania,
} from './compania-contactos.ts'

test('areaContacto solo acepta la lista cerrada', () => {
  assert.equal(areaContacto('comercial'), 'comercial')
  assert.equal(areaContacto('ventas'), null)
  assert.equal(areaContacto(''), null)
  assert.equal(areaContacto(undefined), null)
  assert.equal(areaContacto(null), null)
})

test('las 5 áreas tienen etiqueta', () => {
  for (const a of AREAS_CONTACTO) assert.ok(etiquetaArea(a))
})

test('etiquetaArea(null) es null, no un texto de relleno', () => {
  assert.equal(etiquetaArea(null), null)
})

function contacto(p: Partial<ContactoCompania>): ContactoCompania {
  return {
    id: 'x', nombre: 'X', cargo: null, area: null, email: null, telefono: null,
    notas: null, orden: 0, ultimoContactoEn: null, ...p,
  }
}

test('ordenarContactos ordena por orden ascendente', () => {
  const r = ordenarContactos([contacto({ id: 'b', orden: 2 }), contacto({ id: 'a', orden: 0 })])
  assert.deepEqual(r.map((c) => c.id), ['a', 'b'])
})

test('contactoDestacado devuelve el primero de esa área', () => {
  const cs = [
    contacto({ id: 'general', area: 'general', orden: 0 }),
    contacto({ id: 'com2', area: 'comercial', orden: 2 }),
    contacto({ id: 'com1', area: 'comercial', orden: 1 }),
  ]
  assert.equal(contactoDestacado(cs, 'comercial')?.id, 'com1')
})

test('contactoDestacado es null si no hay nadie de esa área — no elige el más parecido', () => {
  const cs = [contacto({ id: 'a', area: 'general' })]
  assert.equal(contactoDestacado(cs, 'siniestros'), null)
})
