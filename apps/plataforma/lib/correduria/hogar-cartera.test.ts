import assert from 'node:assert/strict'
import { test } from 'node:test'
import { propuestaCarteraHogar, type PolizaParaHogarCartera } from './hogar-cartera.ts'

const P = (o: Partial<PolizaParaHogarCartera> = {}): PolizaParaHogarCartera => ({
  tipo: 'hogar', aseguradora: 'Mapfre', numeroPoliza: 'H-1', estado: 'activa', fechaVencimiento: '2027-03-01',
  viva: true, confirmadaCima: true, sustituida: false, ...o,
})

test('sin lectura de pólizas: pendiente, nunca «sin póliza»', () => {
  assert.deepEqual(propuestaCarteraHogar(null), { estado: 'pendiente' })
})

test('sin hogar en vigor (otro ramo, volcado, cancelada, sustituida, sin confirmar por CIMA): sin_poliza', () => {
  const l = [P({ tipo: 'auto' }), P({ viva: false }), P({ estado: 'cancelada' }), P({ sustituida: true }), P({ confirmadaCima: false })]
  assert.deepEqual(propuestaCarteraHogar(l), { estado: 'sin_poliza' })
})

test('una de hogar en vigor: compañía, vencimiento y capitales de la ficha de CIMA', () => {
  const r = propuestaCarteraHogar([P({ objeto: { direccion: 'CL SAN VICENTE 40', ficha: [{ etiqueta: 'Capital continente', valor: '150.000,00' }, { etiqueta: 'Capital contenido', valor: '30000' }] } })])
  assert.deepEqual(r, { estado: 'dato', aseguradora: 'Mapfre', numeroPoliza: 'H-1', fechaVencimiento: '2027-03-01', direccion: 'CL SAN VICENTE 40', capitalContinente: 150000, capitalContenido: 30000 })
})

test('capitales que la ficha no trae (o ilegibles, o 0) quedan null, nunca 0', () => {
  const r = propuestaCarteraHogar([P({ objeto: { ficha: [{ etiqueta: 'Capital continente', valor: '0' }, { etiqueta: 'Capital contenido', valor: 'n/d' }] } })])
  assert.equal(r.estado === 'dato' && r.capitalContinente, null)
  assert.equal(r.estado === 'dato' && r.capitalContenido, null)
  const sinFicha = propuestaCarteraHogar([P()])
  assert.equal(sinFicha.estado === 'dato' && sinFicha.capitalContinente, null)
})

test('varias de hogar en vigor: no se adivina cuál, se listan', () => {
  const r = propuestaCarteraHogar([P(), P({ aseguradora: 'Allianz', numeroPoliza: 'H-2' })])
  assert.equal(r.estado, 'varias')
  assert.equal(r.estado === 'varias' && r.polizas.length, 2)
})
