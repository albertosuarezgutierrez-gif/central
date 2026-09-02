// Guardián: la vertical Alquiler NO vuelve a llevar su aritmética de stock a mano.
//
// El panel de Salud de la arquitectura (/admin → 🗺️ Estructura) marcaba `alquiler` como
// "reimplementación" de la capacidad Almacén/stock: tenía catálogo propio y calculaba el
// disponible con `Math.max(0, total - comprometido)` teniendo `@central/module-materiales`
// al lado. Se puenteó en `apps/alquiler/lib/materiales-compartidos.ts`.
//
// El segundo invariante es el caro: la tabla `alquiler_materiales` NO tiene columnas
// económicas de inventario, así que el puente rellena `precioCompra`/`costeReposicion` a 0.
// Si alguien expone el `valorTotal` que el módulo deriva de ellas, la UI diría "0 €" de
// inventario — un "no lo sé" disfrazado de dato, que es justo lo que prohíbe CLAUDE.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..', 'apps', 'alquiler')
const read = (...p: string[]) => readFileSync(join(APP, ...p), 'utf8')

test('apps/alquiler declara y usa @central/module-materiales', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.ok(pkg.dependencies['@central/module-materiales'], 'falta la dep del módulo compartido')
  assert.match(read('lib', 'materiales-compartidos.ts'), /from '@central\/module-materiales'/)
  assert.match(read('lib', 'alquiler-repo.ts'), /from '\.\/materiales-compartidos'/)
})

test('el disponible sale del módulo, no de aritmética a mano', () => {
  const repo = read('lib', 'alquiler-repo.ts')
  assert.match(repo, /disponibleTrasComprometido\(/)
  assert.doesNotMatch(repo, /Math\.max\(0,\s*m\.stockTotal/, 'vuelve a calcular el stock a mano')
})

test('el puente NO expone valor de inventario en € (columnas inexistentes → 0)', () => {
  const puente = read('lib', 'materiales-compartidos.ts')
  assert.match(puente, /Omit<ResumenStock, 'valorTotal'>/, 'el resumen debe recortar valorTotal')
  for (const prohibido of ['valorStock', 'resumenContable', 'gastoCompras']) {
    assert.doesNotMatch(
      puente,
      new RegExp(`\\b${prohibido}\\(`),
      `${prohibido}() deriva del precio de compra, que esta vertical no tiene`,
    )
  }
})
