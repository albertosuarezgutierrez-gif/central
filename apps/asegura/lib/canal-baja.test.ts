import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canalBajaCompania, fichaPueAllianz, URL_PUE_ALLIANZ } from './canal-baja.ts'

test('Allianz (C0109) va por el PUE; el resto y NULL, por correo', () => {
  assert.equal(canalBajaCompania('C0109'), 'pue_allianz')
  assert.equal(canalBajaCompania(' c0109 '), 'pue_allianz')
  assert.equal(canalBajaCompania('C0001'), 'correo')
  assert.equal(canalBajaCompania(null), 'correo')
})

test('la ficha del PUE lleva referencia, aplicación 0, operativa, fecha en formato español y la URL', () => {
  const f = fichaPueAllianz({ numeroPoliza: '123456', tomador: 'Ana Pérez', fechaEfectoBaja: '2026-11-05', motivo: 'Precio' })
  assert.equal(f.url, URL_PUE_ALLIANZ)
  assert.match(f.texto, /Referencia = Póliza/)
  assert.match(f.texto, /Nº de póliza: 123456/)
  assert.match(f.texto, /Aplicación: 0/)
  assert.match(f.texto, /Anulación a vencimiento - Póliza Individual NO Vida/)
  assert.match(f.texto, /05\/11\/2026/)
})

test('un dato ausente dice «no consta», nunca se inventa', () => {
  const f = fichaPueAllianz({ numeroPoliza: null, tomador: '  ', fechaEfectoBaja: null, motivo: null })
  assert.equal(f.campos.find((c) => c.etiqueta === 'Nº de póliza')?.valor, null)
  assert.equal(f.campos.find((c) => c.etiqueta === 'Motivo')?.valor, null)
  assert.match(f.texto, /Nº de póliza: no consta, míralo en la ficha/)
})
