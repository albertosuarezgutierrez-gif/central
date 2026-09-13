import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { intentoQuizaEmitido, rastroSolicitudEmision, FRASE_SIN_CONFIRMACION } from './reintento-emision.ts'

const ERROR_500 =
  '500: {"error":"Internal Server Error","message":"Unknown error while waiting for the operation to complete.","path":"/insurances/40685793/policy-applications","status":500}'

test('intentoQuizaEmitido: un 5xx del Submit es «quizá emitido» (proyecto 40685793)', () => {
  assert.equal(intentoQuizaEmitido(ERROR_500), true)
  assert.equal(intentoQuizaEmitido('503: Service Unavailable'), true)
  // Un 5000 no es un 5xx.
  assert.equal(intentoQuizaEmitido('5000: raro'), false)
})

test('intentoQuizaEmitido: el corte de red sin respuesta también', () => {
  assert.equal(intentoQuizaEmitido(`fetch failed — ${FRASE_SIN_CONFIRMACION} con esta petición: antes de reintentar…`), true)
})

test('intentoQuizaEmitido: un 400/422 rechazado NO es quizá emitido, ni un fallo ANTES de enviar, ni sin mensaje', () => {
  assert.equal(intentoQuizaEmitido('400: {"message":"The e-mail of the holder is mandatory."}'), false)
  assert.equal(intentoQuizaEmitido('antes de enviar: el token devolvió 503 (el Submit NO ha salido)'), false)
  assert.equal(intentoQuizaEmitido(null), false)
  assert.equal(intentoQuizaEmitido(undefined), false)
})

// La misma regla vive en SQL dentro de `bloquearEnvio` (carrera entre dos
// peticiones). Si una de las dos formas cambia sin la otra, la lectura previa
// y el candado dirían cosas distintas sobre el mismo proyecto.
test('bloquearEnvio lleva en SQL la misma regla de «quizá emitido» que intentoQuizaEmitido (lee el fuente)', () => {
  const src = readFileSync(fileURLToPath(new URL('./emitir-envio.ts', import.meta.url)), 'utf8')
  assert.match(src, /error_mensaje ~ '\^5\[0-9\]\{2\}\(\[\^0-9\]\|\$\)'/)
  assert.match(src, /error_mensaje ilike \$\{'%' \+ FRASE_SIN_CONFIRMACION \+ '%'\}/)
  assert.match(src, /and codeoscopic_projects\.estado <> 'emitida'/)
  // El token se obtiene FUERA del try que marca «quizá emitido».
  assert.ok(src.indexOf('token = await obtenerToken(config)') < src.indexOf('const res = await fetch('))
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
  // Contadores a cero, estados «ninguno», plazos y flags tampoco: un 409 sobre eso
  // dejaría el proyecto sin salida.
  assert.deepEqual(
    rastroSolicitudEmision({
      policyApplicationsCount: 0,
      policyApplicationStatus: 'NONE',
      policyApplicationRequired: true,
      policyApplicationDeadline: '2026-10-01',
      policyApplicationFields: ['iban'],
    }),
    [],
  )
  // Pero un estado con contenido SÍ es rastro.
  assert.equal(rastroSolicitudEmision({ policyApplicationStatus: 'Pending' }).length, 1)
})
