import assert from 'node:assert/strict'
import { test } from 'node:test'

import { precargasDeRecordatorio } from './recordatorio-precarga.ts'
import { TITULO_MAX } from './recordatorio-libre.ts'

const HOY = new Date('2026-09-21T11:30:00Z')
const CARNET = { id: 'c1', tipo: 'B', fechaCaducidad: '2027-04-18' }

test('el carné es FIRME: fecha real de la ficha, sin nada que advertir', () => {
  const { precargas } = precargasDeRecordatorio({ carnets: [CARNET], polizas: [], hoy: HOY })
  assert.equal(precargas.length, 1)
  assert.deepEqual(precargas[0], {
    id: 'carnet:c1',
    clave: 'carnet',
    tipo: 'carnet',
    titulo: 'Carnet de conducir (B)',
    fecha: '2027-04-18',
    repiteCadaMeses: null,
    polizaValor: null,
    confianza: 'firme',
    aviso: null,
  })
})

test('🚨 el carné NO se repite solo: la vigencia baja a 5 años a los 65 y aquí no se sabe la edad', () => {
  const { precargas } = precargasDeRecordatorio({ carnets: [CARNET], polizas: [], hoy: HOY })
  assert.equal(precargas[0]?.repiteCadaMeses, null)
})

test('🚨 un carné YA CADUCADO no se ofrece: ese recordatorio no avisaría jamás', () => {
  // Lo encontró `code-review`. La fecha caería en el pasado, así que no entra
  // en la ventana de aviso, y como el carné no se repite no avisaría nunca:
  // le habríamos hecho guardar algo inútil.
  const { precargas } = precargasDeRecordatorio({
    carnets: [{ id: 'c1', tipo: 'B', fechaCaducidad: '2026-09-20' }],
    polizas: [],
    hoy: HOY,
  })
  assert.deepEqual(precargas, [])
})

test('el carné que caduca HOY sí se ofrece: hoy todavía se puede hacer algo', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [{ id: 'c1', tipo: 'B', fechaCaducidad: '2026-09-21' }],
    polizas: [],
    hoy: HOY,
  })
  assert.equal(precargas.length, 1)
})

test('🚨 dos carnés del MISMO tipo no colapsan en una fila: el id sale de la fila de origen', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [
      { id: 'c1', tipo: 'B', fechaCaducidad: '2027-04-18' },
      { id: 'c2', tipo: 'B', fechaCaducidad: '2029-01-09' },
    ],
    polizas: [
      { valor: 'cartera:1', ramo: 'auto', matricula: null, fechaMatriculacion: '2024-01-20' },
      { valor: 'cartera:2', ramo: 'auto', matricula: null, fechaMatriculacion: '2024-01-20' },
    ],
    hoy: HOY,
  })
  const ids = precargas.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids.join(', ')}`)
})

test('un carné con una fecha que no es fecha se salta, no se cuela en el formulario', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [{ id: 'c1', tipo: 'B', fechaCaducidad: 'no consta' }],
    polizas: [],
    hoy: HOY,
  })
  assert.deepEqual(precargas, [])
})

test('🚨 carnets null es «no se ha podido mirar», y se declara — no es «no tiene carné»', () => {
  const r = precargasDeRecordatorio({ carnets: null, polizas: [], hoy: HOY })
  assert.equal(r.carnetsIlegibles, true)
  assert.deepEqual(r.precargas, [])

  const leido = precargasDeRecordatorio({ carnets: [], polizas: [], hoy: HOY })
  assert.equal(leido.carnetsIlegibles, false)
})

test('un ramo sin ITV (hogar) no genera ninguna precarga', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [],
    polizas: [{ valor: 'cartera:1', ramo: 'hogar', matricula: null }],
    hoy: HOY,
  })
  assert.deepEqual(precargas, [])
})

test('sin matrícula NI fecha de matriculación no se inventa ninguna ITV', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [],
    polizas: [{ valor: 'cartera:1', ramo: 'auto', matricula: null, fechaMatriculacion: null }],
    hoy: HOY,
  })
  assert.deepEqual(precargas, [])
})

test('con la matriculación DECLARADA, el aviso no habla de estimaciones de matrícula', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [],
    polizas: [
      { valor: 'cartera:1', ramo: 'auto', matricula: '1234BCD', fechaMatriculacion: '2024-01-20' },
    ],
    hoy: HOY,
  })
  assert.equal(precargas.length, 1)
  assert.equal(precargas[0]?.fecha, '2028-01-20')
  assert.equal(precargas[0]?.titulo, 'ITV de 1234BCD')
  assert.equal(precargas[0]?.polizaValor, 'cartera:1')
  assert.equal(precargas[0]?.repiteCadaMeses, 24)
  assert.ok(!/estimad/i.test(precargas[0]?.aviso ?? ''), 'la declarada no se anuncia como estimada')
})

test('🚨 lo DECLARADO gana a lo estimado: una matrícula del 2000 no pisa la fecha que dio la persona', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [],
    // `1234BCD` es de la serie de finales de 2000; si la estimación mandara, la
    // ITV saldría anual y a otra fecha completamente distinta.
    polizas: [
      { valor: 'cartera:1', ramo: 'auto', matricula: '1234BCD', fechaMatriculacion: '2024-01-20' },
    ],
    hoy: HOY,
  })
  assert.equal(precargas[0]?.fecha, '2028-01-20')
})

test('solo con la matrícula, la fecha sale estimada y el aviso lo DICE', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [],
    polizas: [{ valor: 'cartera:1', ramo: 'auto', matricula: '1234BCD' }],
    hoy: HOY,
  })
  assert.equal(precargas.length, 1)
  assert.match(precargas[0]?.aviso ?? '', /estimad/i)
  // Un coche de 2000 ya pasa de 10 años: le toca ANUAL, no el «cada año» del
  // catálogo por casualidad sino por el tramo.
  assert.equal(precargas[0]?.repiteCadaMeses, 12)
  assert.ok((precargas[0]?.fecha ?? '') >= '2026-09-21', 'la próxima ITV no puede estar en el pasado')
})

test('🚨 NINGUNA precarga de ITV puede ser «firme»: lleva suposiciones debajo y no se autorrellena', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [CARNET],
    polizas: [
      { valor: 'cartera:1', ramo: 'auto', matricula: '1234BCD' },
      { valor: 'cartera:2', ramo: 'auto', matricula: '4567JKL', fechaMatriculacion: '2019-07-01' },
      { valor: 'declarada:3', ramo: 'moto', matricula: '0001MMM' },
    ],
    hoy: HOY,
  })
  for (const p of precargas.filter((x) => x.clave === 'itv')) {
    assert.equal(p.confianza, 'calculada', p.titulo)
    assert.ok(p.aviso !== null && p.aviso.length > 0, `la ITV de ${p.titulo} tiene que avisar de algo`)
  }
})

test('el carné va primero y las ITV por fecha, de la más cercana a la más lejana', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [CARNET],
    polizas: [
      { valor: 'cartera:lejos', ramo: 'auto', matricula: null, fechaMatriculacion: '2025-03-01' },
      { valor: 'cartera:cerca', ramo: 'auto', matricula: null, fechaMatriculacion: '2022-11-05' },
    ],
    hoy: HOY,
  })
  assert.deepEqual(
    precargas.map((p) => p.clave),
    ['carnet', 'itv', 'itv'],
  )
  assert.equal(precargas[1]?.fecha, '2026-11-05')
  assert.equal(precargas[2]?.fecha, '2029-03-01')
})

test('🚨 ningún título pasa de TITULO_MAX: el POST lo rechazaría y la persona vería un error que no ha causado', () => {
  const { precargas } = precargasDeRecordatorio({
    carnets: [{ id: 'c1', tipo: 'B'.repeat(200), fechaCaducidad: '2027-04-18' }],
    polizas: [{ valor: 'cartera:1', ramo: 'auto', matricula: 'X'.repeat(200), fechaMatriculacion: '2024-01-20' }],
    hoy: HOY,
  })
  assert.ok(precargas.length >= 2)
  for (const p of precargas) assert.ok(p.titulo.length <= TITULO_MAX, `${p.clave}: ${p.titulo.length}`)
})
