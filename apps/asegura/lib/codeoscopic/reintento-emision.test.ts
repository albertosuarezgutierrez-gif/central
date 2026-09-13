import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intentoQuizaEmitido, rastroSolicitudEmision } from './reintento-emision.ts'

const ERROR_500 =
  '500: {"error":"Internal Server Error","message":"Unknown error while waiting for the operation to complete.","path":"/insurances/40685793/policy-applications","status":500}'

test('intentoQuizaEmitido: un 5xx del Submit es «quizá emitido» (proyecto 40685793)', () => {
  assert.equal(intentoQuizaEmitido('error', ERROR_500), true)
  assert.equal(intentoQuizaEmitido('error', '503: Service Unavailable'), true)
})

test('intentoQuizaEmitido: el corte de red sin respuesta también', () => {
  assert.equal(
    intentoQuizaEmitido('error', 'fetch failed — no hay confirmación de qué hizo el vendor con esta petición: antes de reintentar…'),
    true,
  )
})

test('intentoQuizaEmitido: un 400/422 rechazado NO es quizá emitido, ni un proyecto sano', () => {
  assert.equal(intentoQuizaEmitido('error', '400: {"message":"The e-mail of the holder is mandatory."}'), false)
  assert.equal(intentoQuizaEmitido('preemision', ERROR_500), false)
  assert.equal(intentoQuizaEmitido('error', null), false)
  assert.equal(intentoQuizaEmitido(undefined, undefined), false)
})

test('rastroSolicitudEmision: encuentra policyApplication(s) con contenido, a cualquier nivel', () => {
  const crudo = {
    id: 40685793,
    holder: { name: 'X' },
    policyApplication: { id: 'PA-1', status: { id: 'Pending' } },
    offers: [{ id: 'O1', policyApplications: [{ id: 'PA-2' }] }],
  }
  const r = rastroSolicitudEmision(crudo)
  assert.deepEqual(
    r.map((x) => x.ruta),
    ['policyApplication', 'offers[0].policyApplications'],
  )
})

test('rastroSolicitudEmision: una clave vacía o un proyecto sin ella NO es rastro', () => {
  assert.deepEqual(rastroSolicitudEmision({ id: 1, policyApplications: [], policyApplication: null }), [])
  assert.deepEqual(rastroSolicitudEmision({ id: 1, holder: {}, mainQuote: { id: 'Q1' } }), [])
  assert.deepEqual(rastroSolicitudEmision(null), [])
  // `policyApplicationSupported: true` de un precio NO es una solicitud: es una capacidad.
  assert.deepEqual(rastroSolicitudEmision({ prices: [{ policyApplicationSupported: true }] }), [])
})
