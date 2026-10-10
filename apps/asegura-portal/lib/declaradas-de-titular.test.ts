import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cuentaDeTitular, identidadesTitulares, TITULAR_TIPO_VISIBLE_A_TERCERO } from './declaradas-de-titular.ts'

// Caso fundacional (08/10/2026): Pilar abre su ficha ENTERA a Alberto; la póliza
// que ella subió vive en SU identidad y la tarjeta de Alberto decía «sin seguros».
const PILAR_FICHA = 'c-pilar'
const PILAR_ID = 'i-pilar'
const ALBERTO_ID = 'i-alberto'
const CORREDOR = 'i-corredor'
const base = { identidadQueMira: ALBERTO_ID, identidadCorredor: CORREDOR }
const v = (identidadId: string, clienteId: string, nivel = 'gestionar', origen = 'email_hash') => ({ identidadId, clienteId, nivel, origen })

test('la identidad vinculada SOLO a la ficha abierta entera es su titular', () => {
  const r = identidadesTitulares({ ...base, fichasEnteras: [PILAR_FICHA], vinculos: [v(PILAR_ID, PILAR_FICHA)] })
  assert.deepEqual([...r], [[PILAR_ID, PILAR_FICHA]])
})

test('🔒 ficha NO abierta entera (concesión suelta o ninguna): nada', () => {
  const r = identidadesTitulares({ ...base, fichasEnteras: [], vinculos: [v(PILAR_ID, PILAR_FICHA)] })
  assert.equal(r.size, 0)
})

test('🔒 identidad con DOS fichas (ella y su sociedad): no se sabe de cuál es cada declarada', () => {
  const r = identidadesTitulares({
    ...base,
    fichasEnteras: [PILAR_FICHA],
    vinculos: [v(PILAR_ID, PILAR_FICHA), v(PILAR_ID, 'c-sociedad')],
  })
  assert.equal(r.size, 0)
})

test('el vínculo temporal de la vista de corredor no cuenta como segunda ficha', () => {
  const r = identidadesTitulares({
    ...base,
    fichasEnteras: [PILAR_FICHA],
    vinculos: [v(PILAR_ID, PILAR_FICHA), v(PILAR_ID, 'c-otro', 'gestionar', 'corredor')],
  })
  assert.deepEqual([...r.keys()], [PILAR_ID])
})

test('🔒 vínculo de nivel bajo (tarjeta/completo) no hace titular', () => {
  for (const nivel of ['tarjeta', 'completo', 'raro']) {
    const r = identidadesTitulares({ ...base, fichasEnteras: [PILAR_FICHA], vinculos: [v(PILAR_ID, PILAR_FICHA, nivel)] })
    assert.equal(r.size, 0, nivel)
  }
})

test('🔒 nunca la identidad que mira ni la del corredor', () => {
  const r = identidadesTitulares({
    ...base,
    fichasEnteras: [PILAR_FICHA],
    vinculos: [v(ALBERTO_ID, PILAR_FICHA), v(CORREDOR, PILAR_FICHA, 'gestionar', 'manual')],
  })
  assert.equal(r.size, 0)
})

test('solo las declaradas «propio»: empresa y null (no se preguntó) se quedan fuera', () => {
  assert.equal(TITULAR_TIPO_VISIBLE_A_TERCERO, 'propio')
})

test('la cabecera cuenta cartera + declaradas (no «sin seguros» con una añadida)', () => {
  assert.equal(cuentaDeTitular({ polizas: [], declaradas: [{}] }), 1)
  assert.equal(cuentaDeTitular({ polizas: [{}, {}], declaradas: [{}] }), 3)
  assert.equal(cuentaDeTitular({ polizas: [{}] }), 1)
})
