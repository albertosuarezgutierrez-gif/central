// Guardián: el index de `@central/module-tarificacion` NO alcanza `node:crypto` (ni ningún módulo de Node).
// `node --test` (gate en `pnpm test:guardia`).
//
// El problema que cierra (11/10/2026, PR #4483): `emision.ts` importaba `node:crypto` y se reexportaba desde el
// index. El index llega al bundle del NAVEGADOR de plataforma (PedirPresupuestoBot.tsx → lib/presupuestos-companias →
// @central/module-tarificacion) y webpack rompió el build de producción: «Reading from "node:crypto" is not handled by
// plugins». Hash/token/HMAC viven ahora en `emision-servidor.ts`, expuesto SOLO por el subpath
// `@central/module-tarificacion/servidor`.
//
// Brazos: (1) el grafo de imports relativos desde `src/index.ts` no toca ningún builtin de Node; (2) ningún
// componente `'use client'` de apps/ importa el subpath de servidor; (3) el subpath `./servidor` existe y es el que
// exporta las funciones con crypto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { builtinModules } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = join(RAIZ, 'packages/module-tarificacion')
const BUILTINS = new Set(builtinModules)

function especificadores(codigo: string): string[] {
  const out: string[] = []
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  for (const m of codigo.matchAll(re)) out.push(m[1])
  return out
}

const esNode = (s: string): boolean => s.startsWith('node:') || BUILTINS.has(s.split('/')[0])

function nodeAlcanzables(entrada: string): { fichero: string; spec: string }[] {
  const vistos = new Set<string>()
  const malos: { fichero: string; spec: string }[] = []
  const pila = [entrada]
  while (pila.length) {
    const f = pila.pop()!
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const spec of especificadores(readFileSync(f, 'utf8'))) {
      if (esNode(spec)) malos.push({ fichero: f.slice(RAIZ.length + 1), spec })
      else if (spec.startsWith('.')) {
        const destino = resolve(dirname(f), spec)
        const real = [destino, `${destino}.ts`, `${destino}.tsx`, join(destino, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile())
        assert.ok(real, `import sin resolver: ${spec} en ${f}`)
        pila.push(real)
      }
    }
  }
  return malos
}

test('el index de module-tarificacion no alcanza node:crypto ni ningún builtin de Node (llega al navegador)', () => {
  const malos = nodeAlcanzables(join(PKG, 'src/index.ts'))
  assert.deepEqual(malos, [], `el index arrastra módulos de Node al bundle cliente: ${JSON.stringify(malos)}. Muévelo a emision-servidor.ts / subpath ./servidor`)
})

function ficherosApps(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficherosApps(p, out)
    else if (/\.(tsx?|jsx?)$/.test(e)) out.push(p)
  }
  return out
}

test('ningún componente cliente importa @central/module-tarificacion/servidor', () => {
  const malos = ficherosApps(join(RAIZ, 'apps'))
    .filter((f) => {
      const c = readFileSync(f, 'utf8')
      return /^\s*['"]use client['"]/.test(c) && c.includes('@central/module-tarificacion/servidor')
    })
    .map((f) => f.slice(RAIZ.length + 1))
  assert.deepEqual(malos, [])
})

test('el subpath ./servidor existe y exporta las funciones con crypto', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { exports: Record<string, string> }
  assert.equal(pkg.exports['./servidor'], './src/servidor.ts')
  const srv = readFileSync(join(PKG, 'src/servidor.ts'), 'utf8')
  for (const n of ['hashDatosEmision', 'decidirCanje', 'generarTokenEmision', 'hashTokenEmision', 'firmarAutorizacionEmision', 'verificarFirmaAutorizacionEmision']) {
    assert.ok(srv.includes(n), `servidor.ts no exporta ${n}`)
  }
  assert.ok(nodeAlcanzables(join(PKG, 'src/servidor.ts')).some((m) => m.spec === 'node:crypto'), 'servidor.ts debería alcanzar node:crypto (si no, el test 1 no prueba nada)')
})
