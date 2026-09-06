// Guardián de la matriz de `Typecheck · <app>`. `node --test` (gate en `pnpm test:guardia`).
//
// El problema que cierra: una app que NO está en la matriz de `tests.yml` no la typechequea
// NADIE. `housesevillana` vivió así 15 días con 5 errores `TS5097` que nadie veía, y por eso
// `CLAUDE.md` manda añadir la app a la matriz como parte de su alta.
//
// Este test no vigila eso —vigila la trampa de al lado, que ya ha mordido TRES veces: que
// `CLAUDE.md` CITE una matriz distinta de la que corre. El apartado de CI ha dicho «son 9»,
// luego «son 12», mientras el workflow corría otra cosa; y quien lee el doc para saber qué
// verificar en local se deja apps fuera sin enterarse. Un doc que va por detrás del workflow
// es peor que no tener doc: se lee con confianza.
//
// Por eso la fuente de verdad es el WORKFLOW y el doc es lo que se compara contra él, nunca
// al revés.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')

/** Las apps de la matriz `app:` de `tests.yml`, que son las que el CI typechequea. */
function appsDeLaMatriz(): string[] {
  const wf = readFileSync(join(RAIZ, '.github/workflows/tests.yml'), 'utf8')
  const m = wf.match(/^\s*app:\s*\[([^\]]+)\]/m)
  assert.ok(m, 'no se encontró la línea `app: [...]` en .github/workflows/tests.yml')
  return m![1].split(',').map((s) => s.trim()).filter(Boolean)
}

test('la matriz de tests.yml nombra apps que existen', () => {
  for (const app of appsDeLaMatriz()) {
    assert.ok(
      existsSync(join(RAIZ, 'apps', app, 'package.json')),
      `tests.yml typechequea \`${app}\`, pero no hay apps/${app}/package.json`,
    )
  }
})

test('CLAUDE.md cita la matriz REAL: misma cifra y mismos nombres', () => {
  const apps = appsDeLaMatriz()
  const doc = readFileSync(join(RAIZ, 'CLAUDE.md'), 'utf8')

  const cifra = doc.match(/La matriz de `tests\.yml` ya NO son 9 apps: son (\d+)/)
  assert.ok(cifra, 'CLAUDE.md ya no declara la cifra de la matriz — actualiza este guardián con ella')
  assert.equal(
    Number(cifra![1]),
    apps.length,
    `CLAUDE.md dice ${cifra![1]} apps y tests.yml corre ${apps.length} (${apps.join(', ')})`,
  )

  // La cifra sola no basta: se puede acertar el número y equivocar los nombres. Y OJO con
  // cómo se comprueba: buscar cada nombre en TODO el documento da verde siempre, porque
  // `asegura-web` (y casi cualquier app) sale en su propio apartado de la casa de marcas.
  // Un cepo que mira donde no es, es un cepo verde que no protege nada. Se compara solo
  // contra la LISTA que ese párrafo declara.
  const lista = doc.match(/son \d+\*\* —[\s\S]{0,400}?`([^`]*ia-rest[^`]*)`/)
  assert.ok(lista, 'no se encontró la lista de apps que cita CLAUDE.md junto a la cifra')
  const citadas = lista![1].split(',').map((s) => s.trim().replace(/\s+/g, '')).filter(Boolean)

  assert.deepEqual(
    [...citadas].sort(),
    [...apps].sort(),
    `la lista de CLAUDE.md y la matriz de tests.yml no coinciden.\n` +
      `  CLAUDE.md: ${[...citadas].sort().join(', ')}\n` +
      `  tests.yml: ${[...apps].sort().join(', ')}`,
  )
})
