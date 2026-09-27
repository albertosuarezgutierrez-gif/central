// Guardián del consentimiento: sin aceptar NO hay medición.
//
// La regla pura (`puedeCargar`) ya no vive ni se testea aquí — vive en
// `@central/core-consent` (packages/core-consent/src/consentimiento.test.ts),
// que es donde se comprueba fail-closed por categoría. Lo que este archivo
// verifica es que ESTA app re-exporta la función real del paquete (no una
// copia local que se puede desincronizar) y que sus envs de PostHog están bien
// formadas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeCargar, POSTHOG_HOST } from './analitica.ts'

test('re-exporta puedeCargar del paquete compartido, no una copia local', () => {
  assert.equal(typeof puedeCargar, 'function')
  // Mismo caso que protegía el fallo de la otra web de la correduría: sin
  // credencial no se mide aunque el visitante hubiera aceptado.
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: '' }), false)
})

test('«todavía no ha contestado» NO es un sí', () => {
  assert.equal(puedeCargar(null, { categoria: 'statistics', credencial: 'phc_prueba' }), false)
  assert.equal(puedeCargar(undefined, { categoria: 'statistics', credencial: 'phc_prueba' }), false)
  assert.equal(puedeCargar({}, { categoria: 'statistics', credencial: 'phc_prueba' }), false)
})

test('rechazar la medición se respeta, y aceptar otra categoría no la sustituye', () => {
  assert.equal(puedeCargar({ statistics: false }, { categoria: 'statistics', credencial: 'phc_prueba' }), false)
  assert.equal(
    puedeCargar({ marketing: true }, { categoria: 'statistics', credencial: 'phc_prueba' }),
    false,
  )
})

test('con consentimiento explícito y credencial, carga', () => {
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: 'phc_prueba' }), true)
})

test('el host por defecto de PostHog está en la UE', () => {
  // Un defecto apuntando a la nube de EE. UU. sacaría del EEE los datos de
  // visitantes españoles sin que nada fallara ni se notara.
  assert.match(POSTHOG_HOST, /^https:\/\/eu\./, `POSTHOG_HOST fuera de la UE: ${POSTHOG_HOST}`)
})
