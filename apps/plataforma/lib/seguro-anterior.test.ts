import test from 'node:test'
import assert from 'node:assert/strict'
import { anteriorParaTarificar, codigoCompania } from './seguro-anterior.ts'
import type { OportunidadDeCliente } from './seguimiento-asegura.ts'

const op = (x: Partial<OportunidadDeCliente>): OportunidadDeCliente => ({
  id: 'o1', clienteId: 'c1', ramo: 'moto', estado: 'en_negociacion', fechaFinVigencia: null, motivoPerdida: null,
  competidor: null, primaCompetidor: null, aparcadaHasta: null, cerradaAt: null, aseguradora: null, numeroPoliza: null,
  matricula: null, vehiculo: null, seguroAnterior: null, prima: null, creada: '2026-09-29T00:00:00Z', proximaTarea: null, ...x,
})
const bonus = { codigoDgs: null, fechaEfecto: null, aniosSinSiniestros: 5, siniestrosUltimos5: 0 }

test('sin oportunidad elegida: la única abierta del ramo que trae algo', () => {
  const r = anteriorParaTarificar([op({ aseguradora: 'Mapfre', seguroAnterior: bonus, matricula: '1234ABC' }), op({ id: 'o2', ramo: 'auto', aseguradora: 'AXA' })], { ramo: 'moto', oportunidadId: null })
  assert.equal(r.estado, 'ok')
  assert.equal(r.estado === 'ok' && r.anterior.seguroAnterior?.aniosSinSiniestros, 5)
  assert.equal(r.estado === 'ok' && r.anterior.etiqueta, '1234ABC')
})

test('dos motos abiertas: ambiguo, no se precarga el bonus de la otra', () => {
  const r = anteriorParaTarificar([op({ aseguradora: 'Mapfre' }), op({ id: 'o2', aseguradora: 'AXA' })], { ramo: 'moto', oportunidadId: null })
  assert.deepEqual(r, { estado: 'ambiguo', n: 2 })
})

test('con oportunidad elegida manda esa, aunque haya otras', () => {
  const r = anteriorParaTarificar([op({ aseguradora: 'Mapfre' }), op({ id: 'o2', aseguradora: 'AXA' })], { ramo: 'moto', oportunidadId: 'o2' })
  assert.equal(r.estado === 'ok' && r.anterior.aseguradora, 'AXA')
})

test('cerradas y vacías no cuentan', () => {
  assert.deepEqual(anteriorParaTarificar([op({ estado: 'perdida', aseguradora: 'Mapfre' }), op({ id: 'o2' })], { ramo: 'moto', oportunidadId: null }), { estado: 'ninguno' })
})

test('compañía: por código DGS, si no por nombre; dos que encajan = ninguna', () => {
  const cs = [
    { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'MAPFRE ESPAÑA' },
    { codigoDgs: 'C0072', nombreComun: 'Generali', nombreCima: null },
    { codigoDgs: 'C0124', nombreComun: 'Reale', nombreCima: 'REALE SEGUROS GENERALES' },
    { codigoDgs: 'C0999', nombreComun: 'Reale Vida', nombreCima: null },
    { codigoDgs: 'C0200', nombreComun: 'Seguros Bilbao', nombreCima: null },
  ]
  assert.equal(codigoCompania(cs, { codigoDgs: 'c0072', nombre: 'Mapfre' }), 'C0072')
  assert.equal(codigoCompania(cs, { codigoDgs: null, nombre: 'MAPFRE ESPAÑA, S.A.' }), 'C0058')
  assert.equal(codigoCompania(cs, { codigoDgs: null, nombre: 'Línea Directa' }), null)
  assert.equal(codigoCompania(cs, { codigoDgs: null, nombre: 'Reale' }), 'C0124', 'el nombre exacto manda')
  assert.equal(codigoCompania(cs, { codigoDgs: null, nombre: 'Reale Seguros' }), 'C0124')
  assert.equal(codigoCompania(cs, { codigoDgs: null, nombre: 'Seguros' }), null, 'encajan Reale y Seguros Bilbao: no se elige a ojo')
})
