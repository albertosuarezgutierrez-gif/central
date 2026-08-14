// Guardián del "Ignored Build Step" del monorepo (scripts/vercel-ignore-build.mjs).
//
// Este script decide, por EXIT CODE, si cada proyecto Vercel construye o no:
//   exit 1 => CONSTRUIR   ·   exit 0 => SALTAR
//
// Equivocarse cuesta dinero en las dos direcciones, y por eso hay test:
//   - de más  => se reconstruyen las ~10 apps en cada push (el incidente de los
//               ~600 US$ de Build CPU Minutes, PR #904);
//   - de menos => una app NO se despliega y nadie se entera, que es peor.
//
// Se ejecuta el script de verdad como proceso, no una copia de su lógica: lo que
// importa es el exit code que ve Vercel.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const SCRIPT = 'scripts/vercel-ignore-build.mjs'

// El script saca los ficheros de `git diff`, así que para probarlo se le inyecta el
// diff por variable de entorno a través de un git falso en el PATH... demasiado frágil.
// En su lugar se prueba la decisión con commits REALES del repo, que es lo que de
// verdad va a ver en Vercel.
function correr(appDir: string, sha: string) {
  const r = spawnSync('node', [SCRIPT, appDir], {
    encoding: 'utf8',
    env: { ...process.env, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_MESSAGE: '' },
  })
  return { construye: r.status === 1, salta: r.status === 0, salida: (r.stdout || '') + (r.stderr || '') }
}

// Un commit que toca SOLO packages/module-subastas (lo consume plataforma, nadie más).
// Se busca en el histórico en vez de cablear un SHA, para que el test no caduque.
function commitQueTocaSolo(prefijo: string): string | null {
  const shas = spawnSync('git', ['log', '-40', '--format=%H', '--', prefijo], { encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean)
  for (const sha of shas) {
    const files = spawnSync('git', ['show', '--stat=200', '--format=', '--name-only', sha], { encoding: 'utf8' })
      .stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!files.length) continue
    // que no toque ninguna app ni un manifiesto raíz: así la decisión depende SOLO del package
    const limpio = files.every((f) => !f.startsWith('apps/') && !['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(f))
    if (limpio && files.some((f) => f.startsWith(prefijo))) return sha
  }
  return null
}

test('una app SIN dependencias @central no se reconstruye por un cambio en packages/', () => {
  const pkg = JSON.parse(readFileSync('apps/housesevillana/package.json', 'utf8'))
  const centrales = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) => k.startsWith('@central/'))
  assert.deepEqual(centrales, [], 'housesevillana ya declara @central/*: este test hay que replantearlo')

  const sha = commitQueTocaSolo('packages/module-subastas')
  if (!sha) return // sin commit adecuado en el histórico reciente: nada que afirmar
  const r = correr('apps/housesevillana', sha)
  assert.ok(r.salta, `la landing NO debe construir por un cambio en module-subastas.\n${r.salida}`)
})

test('la app que SÍ consume el package sigue reconstruyéndose', () => {
  const sha = commitQueTocaSolo('packages/module-subastas')
  if (!sha) return
  const r = correr('apps/plataforma', sha)
  assert.ok(r.construye, `plataforma consume @central/module-subastas: DEBE construir.\n${r.salida}`)
})

test('un cambio en la propia app siempre construye', () => {
  const sha = spawnSync('git', ['log', '-1', '--format=%H', '--', 'apps/housesevillana'], { encoding: 'utf8' }).stdout.trim()
  assert.ok(sha, 'no hay commits de apps/housesevillana')
  const r = correr('apps/housesevillana', sha)
  assert.ok(r.construye, `un commit que toca la propia app DEBE construir.\n${r.salida}`)
})

test('todas las apps con vercel.json declaran el ignoreCommand con SU ruta', () => {
  // La clave que evita que cada push reconstruya los ~10 proyectos. Es obligatoria
  // en CADA app (regla del CLAUDE.md raíz) y el argumento debe ser su propia carpeta:
  // copiar el vercel.json de otra app y olvidar cambiar la ruta hace que el filtro
  // mida la app equivocada, que es peor que no tenerlo (falla en silencio).
  for (const app of readdirSync('apps', { withFileTypes: true }).filter((d) => d.isDirectory())) {
    let vercel: { ignoreCommand?: string }
    try { vercel = JSON.parse(readFileSync(`apps/${app.name}/vercel.json`, 'utf8')) } catch { continue }
    assert.ok(vercel.ignoreCommand, `apps/${app.name}/vercel.json no tiene "ignoreCommand"`)
    assert.match(
      vercel.ignoreCommand,
      new RegExp(`vercel-ignore-build\\.mjs apps/${app.name}\\s*$`),
      `apps/${app.name}: el ignoreCommand no apunta a su propia carpeta → "${vercel.ignoreCommand}"`,
    )
  }
})

test('el fail-open se mantiene: sin argumento de app, construye', () => {
  const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' })
  assert.equal(r.status, 1, `sin argumento debe construir por seguridad.\n${r.stdout}${r.stderr}`)
})
