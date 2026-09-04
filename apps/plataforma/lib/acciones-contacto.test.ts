import test from 'node:test'
import assert from 'node:assert/strict'
import { accionesContacto, claseDeTelefono } from './acciones-contacto.ts'

// Los dos números son los REALES de la ficha de Alberto (03/09/2026): son el
// caso que motiva el helper, no un ejemplo inventado.
test('🚨 el fijo NO ofrece WhatsApp, y dice por qué', () => {
  const a = accionesContacto({ telefono: '954220548' })
  assert.equal(a.clase, 'fijo')
  assert.equal(a.whatsapp, null)
  assert.match(a.nota ?? '', /fijo/)
  // Llamar sí se puede: lo que no admite es WhatsApp.
  assert.equal(a.tel, 'tel:954220548')
})

test('el móvil ofrece los tres, y el wa.me lleva el 34 sin «+»', () => {
  const a = accionesContacto({ telefono: '607905544', email: 'jsuarezsalas@gmail.com' })
  assert.equal(a.clase, 'movil')
  assert.equal(a.whatsapp, 'https://wa.me/34607905544')
  assert.equal(a.tel, 'tel:607905544')
  assert.equal(a.email, 'mailto:jsuarezsalas@gmail.com')
  assert.equal(a.nota, null)
})

test('los separadores y el 0034 no cambian el veredicto', () => {
  assert.equal(claseDeTelefono('607 90 55 44'), 'movil')
  assert.equal(claseDeTelefono('+34 607-905-544'), 'movil')
  assert.equal(claseDeTelefono('0034607905544'), 'movil')
  assert.equal(claseDeTelefono('954.220.548'), 'fijo')
  assert.equal(accionesContacto({ telefono: '+34 607 905 544' }).whatsapp, 'https://wa.me/34607905544')
})

test('el 7 es móvil en España desde 2009, no fijo', () => {
  assert.equal(claseDeTelefono('722334455'), 'movil')
})

test('🚨 un número extranjero es «no_consta», NO «fijo»: se ofrece y se declara', () => {
  const a = accionesContacto({ telefono: '+33612345678' })
  assert.equal(a.clase, 'no_consta')
  assert.equal(a.whatsapp, 'https://wa.me/33612345678')
  assert.match(a.nota ?? '', /no se ha podido comprobar/)
})

test('sin teléfono no se inventa ningún enlace', () => {
  const a = accionesContacto({ email: 'x@y.es' })
  assert.equal(a.tel, null)
  assert.equal(a.whatsapp, null)
  assert.equal(a.email, 'mailto:x@y.es')
})

test('🚨 un contacto ILEGIBLE no ofrece nada: lo que tenemos no es su teléfono', () => {
  const a = accionesContacto({ telefono: 'AAAA==', email: 'BBBB==', ilegible: true })
  assert.equal(a.tel, null)
  assert.equal(a.email, null)
  assert.equal(a.whatsapp, null)
  assert.match(a.nota ?? '', /cifrado/)
})

test('un email vacío o en blanco no produce mailto', () => {
  assert.equal(accionesContacto({ email: '   ' }).email, null)
  assert.equal(accionesContacto({ email: null }).email, null)
})
