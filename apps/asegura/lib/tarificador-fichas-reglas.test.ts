// Cepos de las fichas de producto del tarificador (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { condicionesDeJson } from '@central/module-tarificacion'
import { datosProyecto, elegirFichaValidada, esSinTablaFichas, limiteLista } from './tarificador-fichas-reglas.ts'

const DOC = '11111111-2222-4333-8444-555555555555'

test('datosProyecto: compañía, producto de la oferta con PDF, id del PDF y prima', () => {
  const r = datosProyecto({
    canal: 'rpa', compania: 'allianz', proyectoDocumentoId: DOC,
    ofertas: [{ producto: 'Sin PDF', primaAnualEur: 1 }, { producto: 'Comunidades 2020', primaAnualEur: 812.4, documentoId: DOC }],
  })
  assert.deepEqual(r, { compania: 'allianz', producto: 'Comunidades 2020', documentoId: DOC, primaAnualEur: 812.4 })
})

test('datosProyecto: sin PDF el id es null (no se inventa); otro canal → null', () => {
  assert.equal(datosProyecto({ canal: 'rpa', compania: 'allianz', ofertas: [] })?.documentoId, null)
  assert.equal(datosProyecto({ canal: 'rpa', compania: 'allianz', ofertas: [{ producto: 'X', primaAnualEur: 0 }] })?.primaAnualEur, null)
  assert.equal(datosProyecto({ canal: 'codeoscopic', compania: 'allianz' }), null)
  assert.equal(datosProyecto(null), null)
})

test('elegirFichaValidada: la versión cuyas citas siguen en el PDF; si ninguna casa del todo, avisa del cambio', () => {
  const v1 = { id: 'a', version: '2018', condiciones: condicionesDeJson({ garantias: { danos_agua: { estado: 'incluida', cita: 'Límite 1.500 € por siniestro', origen: 'ia' } } }) }
  const v2 = { id: 'b', version: '2020', condiciones: condicionesDeJson({ garantias: { danos_agua: { estado: 'incluida', cita: 'Límite 3.000 € por siniestro', origen: 'ia' } } }) }
  const r = elegirFichaValidada([v1, v2], 'Daños por agua. Límite 3.000 € por siniestro.')
  assert.equal(r?.ficha.id, 'b')
  assert.equal(r?.cambiado, false)
  const cambio = elegirFichaValidada([v2], 'Daños por agua. Límite 6.000 € por siniestro.')
  assert.deepEqual([cambio?.cambiado, cambio?.citasAusentes], [true, ['danos_agua']])
  assert.equal(elegirFichaValidada([], 'x'), null)
})

test('esSinTablaFichas: solo la ausencia de NUESTRAS tablas, no cualquier error', () => {
  assert.equal(esSinTablaFichas(new Error('relation "tarificador_fichas" does not exist')), true)
  assert.equal(esSinTablaFichas(new Error('relation "otra_tabla" does not exist')), false)
  assert.equal(esSinTablaFichas(new Error('permission denied for table tarificador_fichas')), false)
})

test('limiteLista', () => {
  assert.equal(limiteLista(null, 30, 100), 30)
  assert.equal(limiteLista('500', 30, 100), 30)
  assert.equal(limiteLista('10', 30, 100), 10)
})
