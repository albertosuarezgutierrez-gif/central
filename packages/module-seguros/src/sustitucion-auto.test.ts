import test from 'node:test'
import assert from 'node:assert/strict'

import { detectarSustituciones, ocultarSustituidas, type PolizaParaSustitucion } from './sustitucion-auto.ts'

function pol(p: Partial<PolizaParaSustitucion> & { id: string }): PolizaParaSustitucion {
  return {
    clienteId: 'jose', ramo: 'auto', numeroPoliza: p.id, fechaInicio: '2020-09-24', fechaVencimiento: '2026-09-24',
    matricula: '9833LJC', vigente: true, sustituida: false, conOrigen: false, ...p,
  }
}

// Caso real (23/09/2026): Mapfre 0007001518236 → Reale 3022600334066, mismo Kona.
const MAPFRE = pol({ id: 'mapfre', numeroPoliza: '0007001518236' })
const REALE = pol({ id: 'reale', numeroPoliza: '3022600334066', fechaInicio: '2026-09-22', fechaVencimiento: '2027-09-22', matricula: '9833 LJC' })

test('🚨 José: la Reale del mismo coche que empieza al vencer la Mapfre la sustituye', () => {
  assert.deepEqual(detectarSustituciones([MAPFRE, REALE]), { enlaces: [{ viejaId: 'mapfre', nuevaId: 'reale', matricula: '9833LJC' }], ambiguas: 0 })
})

test('la misma póliza escrita dos veces (ceros a la izquierda) no es una sustitución', () => {
  const volcado = pol({ id: 'volcado', numeroPoliza: '7001518236', fechaInicio: '2026-09-22' })
  assert.equal(detectarSustituciones([MAPFRE, volcado]).enlaces.length, 0)
})

test('sin prueba no se enlaza: otra matrícula, otro cliente, otro ramo, sin matrícula, o lejos del vencimiento', () => {
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, matricula: '1234BCD' }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, clienteId: 'otro' }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, ramo: 'moto' }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([{ ...MAPFRE, matricula: null }, { ...REALE, matricula: null }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, fechaInicio: '2026-03-01' }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, fechaInicio: '2026-11-15' }]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, vigente: false }]).enlaces.length, 0, 'una nueva ya anulada no sustituye')
})

test('ya enlazadas no se vuelven a enlazar', () => {
  assert.equal(detectarSustituciones([{ ...MAPFRE, sustituida: true }, REALE]).enlaces.length, 0)
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, conOrigen: true }]).enlaces.length, 0)
})

test('🚨 una vieja con dos nuevas del mismo coche: no se elige ninguna, se cuenta', () => {
  const otra = pol({ id: 'allianz', numeroPoliza: '999', fechaInicio: '2026-09-23', fechaVencimiento: '2027-09-23' })
  assert.deepEqual(detectarSustituciones([MAPFRE, REALE, otra]), { enlaces: [], ambiguas: 2 })
})

test('portal: la vieja se esconde solo si la nueva está en la misma lista, y la nueva sabe a quién sustituye', () => {
  const vieja = { id: 'mapfre', sustituidaAt: new Date(), polizaOrigenId: null }
  const nueva = { id: 'reale', sustituidaAt: null, polizaOrigenId: 'mapfre' }
  const r = ocultarSustituidas([vieja, nueva])
  assert.deepEqual(r.visibles.map((p) => p.id), ['reale'])
  assert.equal(r.sustituyeA.get('reale')?.id, 'mapfre')
  assert.deepEqual(ocultarSustituidas([vieja]).visibles.map((p) => p.id), ['mapfre'])
  // Sin `sustituida_at` en la vieja (el origen es solo una referencia) no se esconde nada.
  assert.deepEqual(ocultarSustituidas([{ ...vieja, sustituidaAt: null }, nueva]).visibles.length, 2)
})

test('🚨 la vieja que CIMA ya renovó sola (vence un año después) también se sustituye', () => {
  // Medido el 23/09/2026: Occident renovada hasta 09/09/2027; Allianz del mismo coche desde 17/09/2026.
  const occident = pol({ id: 'occ', numeroPoliza: 'GPAFS0900547', fechaInicio: '2015-09-09', fechaVencimiento: '2027-09-09', matricula: '6668 JGF' })
  const allianz = pol({ id: 'all', numeroPoliza: '61048939', fechaInicio: '2026-09-17', fechaVencimiento: '2027-09-17', matricula: '6668 JGF' })
  assert.deepEqual(detectarSustituciones([occident, allianz]).enlaces.map((e) => [e.viejaId, e.nuevaId]), [['occ', 'all']])
  // Y la nueva no «sustituye» a la vieja al revés: la vieja empezó antes.
  assert.equal(detectarSustituciones([occident, allianz]).ambiguas, 0)
})
