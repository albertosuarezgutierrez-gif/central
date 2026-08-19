// Tests de clasificarEstadoRedeploy. Runner: `node --test` (type-stripping).
//
// Bug que fijan (19/08/2026): el sondeo del redeploy salía con `break` al ver BUILDING
// y devolvía ok:true. El Ignored Build Step corre DENTRO del build, así que BUILDING es
// el estado ANTERIOR a la cancelación — el panel cantaba «✅ redeploy lanzado» mientras
// el deployment moría en CANCELED y el secreto guardado se quedaba fuera de runtime.
// Alberto lo pagó rotando el GITHUB_TOKEN: tuvo que redesplegar los dos proyectos a mano.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarEstadoRedeploy } from './vercel-env.ts'

test('READY es el ÚNICO estado que confirma el redeploy', () => {
  assert.equal(clasificarEstadoRedeploy('READY'), 'listo')
})

test('BUILDING NO confirma nada: es la antesala de la cancelación', () => {
  assert.equal(clasificarEstadoRedeploy('BUILDING'), 'construyendo')
  assert.notEqual(clasificarEstadoRedeploy('BUILDING'), 'listo')
})

test('QUEUED e INITIALIZING tampoco confirman', () => {
  assert.equal(clasificarEstadoRedeploy('QUEUED'), 'construyendo')
  assert.equal(clasificarEstadoRedeploy('INITIALIZING'), 'construyendo')
})

test('CANCELED y ERROR son fallos distinguibles', () => {
  assert.equal(clasificarEstadoRedeploy('CANCELED'), 'cancelado')
  assert.equal(clasificarEstadoRedeploy('ERROR'), 'error')
})

test('lo que no se entiende es «desconocido», nunca «listo»', () => {
  for (const v of [undefined, null, '', 'READY_LOL', 42, {}, 'ready']) {
    assert.equal(clasificarEstadoRedeploy(v), 'desconocido', `${JSON.stringify(v)} no puede darse por bueno`)
  }
})
