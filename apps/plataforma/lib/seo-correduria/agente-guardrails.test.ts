import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agenteHabilitado, dentroDeLimite, enCooldown, maxCambios, minImpresiones, slugEditable } from './agente-guardrails.ts'

test('agenteHabilitado exige el string exacto "true" (kill switch)', () => {
  assert.equal(agenteHabilitado({}), false)
  assert.equal(agenteHabilitado({ SEO_ASEGURA_AGENT_ENABLED: 'false' }), false)
  assert.equal(agenteHabilitado({ SEO_ASEGURA_AGENT_ENABLED: '1' }), false)
  assert.equal(agenteHabilitado({ SEO_ASEGURA_AGENT_ENABLED: 'true' }), true)
})

test('slugEditable solo acepta lo que está en la allowlist', () => {
  const allow = ['hogar', 'auto']
  assert.equal(slugEditable('hogar', allow), true)
  assert.equal(slugEditable('portal', allow), false)
})

test('dentroDeLimite', () => {
  assert.equal(dentroDeLimite(0, 2), true)
  assert.equal(dentroDeLimite(2, 2), false)
})

test('enCooldown detecta un cambio reciente sobre el MISMO slug', () => {
  const ahora = new Date('2026-09-15T00:00:00Z')
  const recientes = [{ ruta: 'hogar', creadoEn: '2026-09-10T00:00:00Z' }]
  assert.equal(enCooldown('hogar', recientes, ahora), true)
  assert.equal(enCooldown('auto', recientes, ahora), false)
})

test('enCooldown deja pasar un cambio de hace más de 7 días', () => {
  const ahora = new Date('2026-09-15T00:00:00Z')
  const recientes = [{ ruta: 'hogar', creadoEn: '2026-09-01T00:00:00Z' }]
  assert.equal(enCooldown('hogar', recientes, ahora), false)
})

test('maxCambios y minImpresiones caen al default con env inválida', () => {
  assert.equal(maxCambios({}), 2)
  assert.equal(maxCambios({ SEO_ASEGURA_MAX_CAMBIOS: 'x' }), 2)
  assert.equal(maxCambios({ SEO_ASEGURA_MAX_CAMBIOS: '5' }), 5)
  assert.equal(minImpresiones({}), 10)
  assert.equal(minImpresiones({ SEO_ASEGURA_MIN_IMPR: '25' }), 25)
})
