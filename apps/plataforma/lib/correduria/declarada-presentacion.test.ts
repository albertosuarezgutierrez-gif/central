import test from 'node:test'
import assert from 'node:assert/strict'
import { esNoPoliza, presentarDeclarada } from './declarada-presentacion.ts'
import type { PolizaDeclaradaFicha } from '../ficha-asegura'

const dec = (over: Partial<PolizaDeclaradaFicha> = {}): PolizaDeclaradaFicha => ({
  id: 'd', compania: null, numeroPoliza: null, ramo: null, primaAnual: null, fechaVencimiento: null, matricula: null,
  procedencia: 'declarado', confirmadaPorUsuario: false, titularTipo: null, titularEmpresaNombre: null, yaEnCartera: null,
  bien: { cosa: null, ubicacion: null, detalles: [] }, tipoDocumento: null, fuente: null, documentoNombre: null,
  ...over,
})

test('póliza leída: título = dirección del riesgo, compañía una vez y Nº en su línea', () => {
  const p = presentarDeclarada(dec({
    compania: 'GENERALI ESPAÑA, S.A. DE SEGUROS Y REASEGUROS', numeroPoliza: '4C-G-413.002.702', ramo: 'comercio',
    fechaVencimiento: '2018-03-02', tipoDocumento: 'poliza', fuente: 'texto',
    bien: { cosa: null, ubicacion: 'AV.DE ESPARTINAS,1,NAVE D', detalles: [] },
  }))
  assert.equal(p.excluir, false)
  assert.equal(p.sinLeer, false)
  assert.equal(p.titulo, 'AV.DE ESPARTINAS,1,NAVE D')
  assert.equal(p.numero, 'Nº 4C-G-413.002.702')
  assert.equal(p.compania, 'GENERALI ESPAÑA, S.A. DE SEGUROS Y REASEGUROS')
})

test('sin bien: la compañía es el título y NO se repite debajo', () => {
  const p = presentarDeclarada(dec({ compania: 'Mapfre', numeroPoliza: 'X-1', ramo: 'auto' }))
  assert.equal(p.titulo, 'Mapfre')
  assert.equal(p.compania, null)
  assert.equal(p.numero, 'Nº X-1')
})

test('no-póliza (ficha catastral): se excluye', () => {
  const d = dec({ tipoDocumento: 'otro', fuente: 'texto' })
  assert.equal(esNoPoliza(d), true)
  assert.equal(presentarDeclarada(d).excluir, true)
})

test('extracción fallida: «Documento sin leer — revisar», sin compañía ni número', () => {
  const p = presentarDeclarada(dec({ fuente: 'none', documentoNombre: 'V LORETO 9.pdf' }))
  assert.equal(p.sinLeer, true)
  assert.equal(p.excluir, false)
  assert.equal(p.titulo, 'Documento sin leer — revisar')
  assert.equal(p.documento, 'V LORETO 9.pdf')
})

test('tipo null (no se sabe) con datos: visible, no excluido', () => {
  const p = presentarDeclarada(dec({ tipoDocumento: null, compania: 'Allianz', ramo: 'hogar' }))
  assert.equal(esNoPoliza(dec({ tipoDocumento: null })), false)
  assert.equal(p.excluir, false)
  assert.equal(p.sinLeer, false)
})
