import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configBanner } from './banner.ts'

test('declara las tres categorías, necessary readOnly', () => {
  const cfg = configBanner('es')
  assert.equal(cfg.categories.necessary.readOnly, true)
  assert.ok('statistics' in cfg.categories)
  assert.ok('marketing' in cfg.categories)
})

test('el idioma por defecto de la config es el pedido', () => {
  assert.equal(configBanner('en').language.default, 'en')
  assert.equal(configBanner('it').language.default, 'it')
})

test('las traducciones incluyen el título correcto por idioma', () => {
  const cfg = configBanner('es')
  assert.equal(cfg.language.translations.es.consentModal.title, 'Usamos cookies')
})
