// Blinda los campos que produce scripts/auditar-estructura.mjs y consume el mapa vivo
// de arquitectura (apps/plataforma). Lee el JSON COMMITEADO (regenerado en cada push por
// auditoria.yml) y comprueba invariantes. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const R = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'apps', 'plataforma', 'lib', 'estructura.generated.json'), 'utf8'))

test('la radiografía tiene los campos enriquecidos del mapa', () => {
  for (const k of ['depsModulos', 'apisPorVertical', 'tablasPorVertical', 'skills', 'saludRepo']) {
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

// `novedades` salió a su propio generado (02/09/2026): se deriva de la memoria, no del código,
// y mezclarla aquí hacía que cada PR que anotara memoria reescribiera este JSON.
test('las novedades viven en su propio generado, no en la radiografía', () => {
  assert.ok(!('novedades' in R), 'la radiografía no debe llevar el diario de memoria dentro')
  const N = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'apps', 'plataforma', 'lib', 'novedades.generated.json'), 'utf8'),
  )
  assert.ok(Array.isArray(N.novedades) && N.novedades.length > 0, 'no hay novedades generadas')
  for (const n of N.novedades) {
    assert.equal(typeof n.titulo, 'string')
    assert.equal(typeof n.fecha, 'string')
  }
})
