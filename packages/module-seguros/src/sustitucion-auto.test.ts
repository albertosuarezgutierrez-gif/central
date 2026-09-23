import test from 'node:test'
import assert from 'node:assert/strict'

import { claveRiesgo, detectarSustituciones, solicitudPorSustitucion, sustituidasARetirar, type PolizaParaSustitucion } from './sustitucion-auto.ts'

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
  assert.deepEqual(detectarSustituciones([MAPFRE, REALE]), { enlaces: [{ viejaId: 'mapfre', nuevaId: 'reale', riesgo: { tipo: 'matricula', valor: '9833LJC' } }], ambiguas: 0, duplicidades: [] })
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
  const r = detectarSustituciones([MAPFRE, REALE, otra])
  assert.equal(r.enlaces.length, 0)
  assert.equal(r.ambiguas, 2)
  // Y las dos nuevas del mismo coche, las dos vigentes y solapadas, son una duplicidad.
  assert.deepEqual(r.duplicidades.map((d) => [d.aId, d.bId]), [['reale', 'allianz']])
})

test('🚨 portal: la vieja sale de la LISTA solo con la nueva empezada, vigente y visible, y sin nada pendiente', () => {
  const hoy = new Date('2026-09-23T12:00:00Z')
  const vieja = { id: 'mapfre', sustituyeAId: null, fechaInicio: new Date('2020-09-24'), vigente: true, conPendientes: false }
  const nueva = { id: 'reale', sustituyeAId: 'mapfre', fechaInicio: new Date('2026-09-22'), vigente: true, conPendientes: false }
  assert.deepEqual([...sustituidasARetirar([vieja, nueva], hoy)], [['mapfre', 'reale']])
  // La nueva aún no ha empezado (la moto de Occident, desde el 01/11): se ven las dos.
  assert.equal(sustituidasARetirar([vieja, { ...nueva, fechaInicio: new Date('2026-11-01') }], hoy).size, 0)
  // La vieja tiene un siniestro abierto o un recibo devuelto: sigue a la vista.
  assert.equal(sustituidasARetirar([{ ...vieja, conPendientes: true }, nueva], hoy).size, 0)
  // La nueva no es visible para este lector, o ya no está vigente: la vieja no se esconde.
  assert.equal(sustituidasARetirar([vieja], hoy).size, 0)
  assert.equal(sustituidasARetirar([vieja, { ...nueva, vigente: false }], hoy).size, 0)
})

test('una renovación ya encadenada por poliza_padre_id no es una sustitución', () => {
  assert.equal(detectarSustituciones([MAPFRE, { ...REALE, padreId: 'mapfre' }]).enlaces.length, 0)
})

test('🚨 la vieja que CIMA ya renovó sola (vence un año después) también se sustituye', () => {
  // Medido el 23/09/2026: Occident renovada hasta 09/09/2027; Allianz del mismo coche desde 17/09/2026.
  const occident = pol({ id: 'occ', numeroPoliza: 'GPAFS0900547', fechaInicio: '2015-09-09', fechaVencimiento: '2027-09-09', matricula: '6668 JGF' })
  const allianz = pol({ id: 'all', numeroPoliza: '61048939', fechaInicio: '2026-09-17', fechaVencimiento: '2027-09-17', matricula: '6668 JGF' })
  assert.deepEqual(detectarSustituciones([occident, allianz]).enlaces.map((e) => [e.viejaId, e.nuevaId]), [['occ', 'all']])
  // Y la nueva no «sustituye» a la vieja al revés: la vieja empezó antes.
  assert.equal(detectarSustituciones([occident, allianz]).ambiguas, 0)
})

test('la clave del riesgo depende del ramo: catastro o dirección en inmuebles, DNI en personas, nada en RC', () => {
  const base = pol({ id: 'x', matricula: null })
  assert.equal(claveRiesgo({ ...base, ramo: 'hogar', refCatastral: '1234567AB1234C0001XY' })?.riesgo.tipo, 'catastro')
  // 14 caracteres = la parcela (el edificio entero): no distingue un piso de otro.
  assert.equal(claveRiesgo({ ...base, ramo: 'hogar', refCatastral: '1234567AB1234C' }), null)
  assert.equal(claveRiesgo({ ...base, ramo: 'hogar', direccion: 'CL San Vicente, 40 2º-14', cp: '41002' })?.riesgo.tipo, 'direccion')
  assert.equal(claveRiesgo({ ...base, ramo: 'hogar', direccion: 'v1:abc:def', cp: '41002' }), null, 'una dirección cifrada no prueba nada')
  assert.equal(claveRiesgo({ ...base, ramo: 'hogar', direccion: 'CL San Vicente', cp: '41002' }), null, 'sin número no es un inmueble')
  assert.equal(claveRiesgo({ ...base, ramo: 'vida', nifAsegurado: 'a'.repeat(64) })?.riesgo.tipo, 'asegurado')
  assert.equal(claveRiesgo({ ...base, ramo: 'responsabilidad_civil' }), null)
  assert.equal(claveRiesgo({ ...base, ramo: 'auto', matricula: '9833LJC' })?.riesgo.valor, '9833LJC')
  assert.equal(claveRiesgo({ ...base, ramo: 'auto', matricula: 'PENDIENTE' }), null, 'un centinela no es una matrícula')
})

test('hogar: la nueva de la misma casa (misma dirección descifrada y CP) sustituye a la vieja', () => {
  const casa = { ramo: 'hogar', matricula: null, direccion: 'CL SAN VICENTE, 40 2º-14', cp: '41002' }
  const vieja = pol({ id: 'occ', ...casa, fechaInicio: '2019-03-01', fechaVencimiento: '2026-10-01' })
  const nueva = pol({ id: 'rea', ...casa, direccion: 'Calle San Vicente 40, 2º 14', numeroPoliza: '999', fechaInicio: '2026-10-01', fechaVencimiento: '2027-10-01' })
  // «CL» ≠ «Calle»: la normalización no traduce el tipo de vía, así que no se enlaza (conservador).
  assert.equal(detectarSustituciones([vieja, nueva]).enlaces.length, 0)
  const misma = { ...nueva, direccion: 'CL SAN VICENTE 40 2º 14' }
  assert.deepEqual(detectarSustituciones([vieja, misma]).enlaces.map((e) => e.riesgo.tipo), ['direccion'])
})

test('🚨 duplicidad: dos vigentes del mismo coche que se pisan y no se suceden se avisan, no se enlazan', () => {
  const a = pol({ id: 'a', numeroPoliza: '1', fechaInicio: '2026-01-10', fechaVencimiento: '2027-01-10' })
  const b = pol({ id: 'b', numeroPoliza: '2', fechaInicio: '2026-05-03', fechaVencimiento: '2027-05-03' })
  const r = detectarSustituciones([a, b])
  assert.equal(r.enlaces.length, 0)
  assert.deepEqual(r.duplicidades.map((d) => [d.aId, d.bId]), [['a', 'b']])
  // Si la vieja ya no está vigente, no es duplicidad: es historia.
  assert.equal(detectarSustituciones([{ ...a, vigente: false }, b]).duplicidades.length, 0)
})

test('anulación por sustitución: a vencimiento si la nueva entra en los 30 días previos; si no, el día que entra', () => {
  // José: Reale desde el 22/09, Mapfre vence el 24/09 → a vencimiento.
  assert.equal(solicitudPorSustitucion({ vencimiento: '2026-09-24', inicioNueva: '2026-09-22', mismaCompania: false }, '2026-09-23')?.fechaEfecto, '2026-09-24')
  // Occident ya renovada hasta 2027 y la Allianz desde el 17/09/2026 → el día que entra la nueva.
  assert.equal(solicitudPorSustitucion({ vencimiento: '2027-09-09', inicioNueva: '2026-09-17', mismaCompania: false }, '2026-09-23')?.fechaEfecto, '2026-09-17')
  // Vencimiento ya pasado: no se puede pedir «a vencimiento».
  assert.equal(solicitudPorSustitucion({ vencimiento: '2026-09-20', inicioNueva: '2026-09-19', mismaCompania: false }, '2026-09-23')?.fechaEfecto, '2026-09-19')
  assert.equal(solicitudPorSustitucion({ vencimiento: '2026-09-24', inicioNueva: null, mismaCompania: false }, '2026-09-23'), null)
  assert.equal(solicitudPorSustitucion({ vencimiento: '2026-09-24', inicioNueva: '2026-09-22', mismaCompania: true }, '2026-09-23')?.motivo, 'otro')
})
