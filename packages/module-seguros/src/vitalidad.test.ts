import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MESES_CARTERA_VIVA,
  avisoHermanas,
  etiquetaVitalidad,
  explicarVitalidad,
  vitalidadFicha,
} from './vitalidad.ts'

const HOY = new Date('2026-09-02T00:00:00Z')

test('una póliza por CIMA basta: es cartera viva', () => {
  assert.equal(vitalidadFicha({ polizasCima: 6, ultimoVencimiento: '2027-09-30' }, HOY), 'viva')
  // Y lo es aunque su último vencimiento sea antiguo: CIMA manda.
  assert.equal(vitalidadFicha({ polizasCima: 1, ultimoVencimiento: '2014-01-01' }, HOY), 'viva')
})

test('sin CIMA y con vencimiento viejo: volcado histórico', () => {
  assert.equal(vitalidadFicha({ polizasCima: 0, ultimoVencimiento: '2016-03-03' }, HOY), 'historica')
})

test('sin CIMA pero con vencimiento dentro de la ventana: sigue viva', () => {
  // Justo dentro del límite de 18 meses.
  assert.equal(vitalidadFicha({ polizasCima: 0, ultimoVencimiento: '2025-03-02' }, HOY), 'viva')
  // Un día antes del límite ya es histórica.
  assert.equal(vitalidadFicha({ polizasCima: 0, ultimoVencimiento: '2025-03-01' }, HOY), 'historica')
  assert.equal(MESES_CARTERA_VIVA, 18)
})

test('🚨 no contado NO es histórica: es desconocida', () => {
  // El fallo caro sería enterrar una ficha porque la consulta falló.
  assert.equal(vitalidadFicha({ polizasCima: null, ultimoVencimiento: null }, HOY), 'desconocida')
  assert.equal(vitalidadFicha({ polizasCima: null, ultimoVencimiento: '2016-01-01' }, HOY), 'desconocida')
})

test('🚨 sin fecha NO es histórica: es «no se sabe»', () => {
  assert.equal(vitalidadFicha({ polizasCima: 0, ultimoVencimiento: null }, HOY), 'sin_fecha')
  assert.notEqual(etiquetaVitalidad('sin_fecha'), etiquetaVitalidad('historica'))
})

test('una fecha ilegible no se pinta como viva ni como muerta', () => {
  assert.equal(vitalidadFicha({ polizasCima: 0, ultimoVencimiento: 'no consta' }, HOY), 'desconocida')
})

test('la explicación dice el porqué, no repite la etiqueta', () => {
  assert.match(explicarVitalidad('viva', { polizasCima: 6, ultimoVencimiento: null }), /6 póliza/)
  assert.match(
    explicarVitalidad('historica', { polizasCima: 0, ultimoVencimiento: '2016-03-03' }),
    /2016-03-03/,
  )
})

test('el caso real de Jose Suarez Salas: la de 14 pólizas es la muerta', () => {
  const mayo = vitalidadFicha({ polizasCima: 6, ultimoVencimiento: '2027-09-30' }, HOY)
  const junio = vitalidadFicha({ polizasCima: 0, ultimoVencimiento: '2016-03-03' }, HOY)
  assert.equal(mayo, 'viva')
  assert.equal(junio, 'historica')
})

test('hermanas con el mismo nombre: se avisa de duplicado y se señala la viva', () => {
  const a = avisoHermanas('historica', [
    { clienteId: 'x', nombre: 'Jose Suarez Salas', mismoNombre: true, vitalidad: 'viva' },
  ])
  assert.equal(a?.clase, 'duplicado')
  assert.equal(a?.preferida?.clienteId, 'x')
})

test('desde la ficha viva no se manda a ningún lado, solo se avisa', () => {
  const a = avisoHermanas('viva', [
    { clienteId: 'x', nombre: 'Jose Suarez Salas', mismoNombre: true, vitalidad: 'historica' },
  ])
  assert.equal(a?.clase, 'duplicado')
  assert.equal(a?.preferida, null)
})

test('🚨 mismo teléfono con OTRO nombre no es un duplicado', () => {
  // 203 de los 740 grupos son familias/empresas compartiendo número.
  const a = avisoHermanas('viva', [
    { clienteId: 'y', nombre: 'Pilar Alcalá', mismoNombre: false, vitalidad: 'viva' },
  ])
  assert.equal(a?.clase, 'comparte')
  assert.equal(a?.preferida, null)
})

test('sin hermanas, o sin poder mirarlas, no se dice nada', () => {
  assert.equal(avisoHermanas('viva', []), null)
  // `null` = no se pudo consultar. El silencio no afirma «no hay duplicados».
  assert.equal(avisoHermanas('viva', null), null)
})
