// Blinda los campos que produce scripts/auditar-estructura.mjs y consume el mapa vivo
// de arquitectura (apps/plataforma). Lee el JSON COMMITEADO (regenerado en cada push por
// auditoria.yml) y comprueba invariantes. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const R = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'apps', 'plataforma', 'lib', 'estructura.generated.json'), 'utf8'))

test('la radiografía tiene los campos enriquecidos del mapa', () => {
  for (const k of ['depsModulos', 'apisPorVertical', 'tablasPorVertical', 'skills', 'novedades', 'saludRepo']) {
    assert.ok(k in R, `falta el campo ${k}`)
  }
})

test('cada package tiene entrada en depsModulos (grafo de dependencias)', () => {
  for (const p of R.packages) assert.ok(Array.isArray(R.depsModulos[p.id]), `depsModulos sin ${p.id}`)
})

test('cada vertical tiene APIs y tablas (arrays)', () => {
  for (const v of R.verticales) {
    assert.ok(Array.isArray(R.apisPorVertical[v]), `apisPorVertical sin ${v}`)
    assert.ok(Array.isArray(R.tablasPorVertical[v]), `tablasPorVertical sin ${v}`)
  }
})

test('skills no vacío y bien formado; el resumen cuadra', () => {
  assert.ok(R.skills.length > 0, 'no se detectaron skills')
  for (const s of R.skills) {
    assert.equal(typeof s.id, 'string')
    assert.equal(typeof s.name, 'string')
    assert.equal(typeof s.description, 'string')
  }
  assert.equal(R.resumen.skills, R.skills.length)
})
