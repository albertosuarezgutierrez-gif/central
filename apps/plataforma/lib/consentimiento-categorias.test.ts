import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarCategorias } from './consentimiento-categorias.ts'

test('el ARRAY que mandan las tres webs se acepta (era un 400 en producción)', () => {
  // Payload exacto de CookieConsent.getUserPreferences().acceptedCategories.
  assert.deepEqual(normalizarCategorias(['necessary', 'statistics']), {
    aceptadas: ['necessary', 'statistics'],
  })
  // Rechazar todo salvo lo necesario también es un consentimiento que hay que registrar.
  assert.deepEqual(normalizarCategorias(['necessary']), { aceptadas: ['necessary'] })
  // Un array vacío es un dato, no un fallo: no aceptó ninguna categoría.
  assert.deepEqual(normalizarCategorias([]), { aceptadas: [] })
})

test('un objeto se guarda tal cual, para un emisor que mande el mapa completo', () => {
  assert.deepEqual(normalizarCategorias({ necessary: true, statistics: false }), {
    necessary: true,
    statistics: false,
  })
})

test('lo que no es objeto ni array de strings sigue siendo un 400', () => {
  for (const malo of [null, undefined, 'statistics', 42, true, [1, 2], ['ok', 3]]) {
    assert.equal(normalizarCategorias(malo), null, `debería rechazar ${JSON.stringify(malo)}`)
  }
})
