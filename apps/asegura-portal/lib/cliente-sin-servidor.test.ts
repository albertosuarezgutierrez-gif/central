/**
 * Cepo: un componente `'use client'` NO importa como VALOR un módulo de `lib/` que arrastre Node/servidor
 * (`node:*`, crypto, fs, Prisma). Rompe `next build` (UnhandledSchemeError node:crypto), no el tsc ni los tests.
 * Caso real: RevisarPoliza.tsx importaba TEXTO_REVISION de revision-poliza.ts (node:crypto). Los textos van en
 * un módulo aparte sin Node; los tipos, con `import type`.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const RAIZ = join(import.meta.dirname, '..')
const SERVIDOR = /^(node:|crypto$|fs$|fs\/|path$|@prisma\/client|@\/lib\/prisma|\.\/prisma(\.ts)?$|\.\/db(\.ts)?$)/

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

/** Imports de VALOR (no `import type`) con su ruta; admite varias líneas. */
function importsDeValor(src: string): string[] {
  return [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
}

function modulosServidor(): Set<string> {
  const s = new Set<string>()
  for (const f of readdirSync(join(RAIZ, 'lib'))) {
    if (!/\.tsx?$/.test(f) || f.endsWith('.test.ts')) continue
    if (importsDeValor(readFileSync(join(RAIZ, 'lib', f), 'utf8')).some((r) => SERVIDOR.test(r))) s.add(f.replace(/\.tsx?$/, ''))
  }
  return s
}

test("ningún 'use client' importa como valor un módulo de lib/ con Node o Prisma", () => {
  const servidor = modulosServidor()
  assert.ok(servidor.has('revision-poliza'), 'sanidad: revision-poliza debe contar como módulo de servidor')
  const malos: string[] = []
  for (const f of ficheros(join(RAIZ, 'app'))) {
    const src = readFileSync(f, 'utf8')
    if (!/^\s*['"]use client['"]/m.test(src)) continue
    for (const ruta of importsDeValor(src)) {
      const m = /^@\/lib\/([^/]+?)(?:\.tsx?)?$/.exec(ruta)
      if (m && servidor.has(m[1])) malos.push(`${f.slice(RAIZ.length + 1)} -> ${ruta}`)
    }
  }
  assert.deepEqual(malos, [])
})

test('RevisarPoliza.tsx saca los textos de revision-poliza-texto y solo importa tipos de revision-poliza', () => {
  const src = readFileSync(join(RAIZ, 'app/(portal)/boveda/anadida/[id]/RevisarPoliza.tsx'), 'utf8')
  const valores = importsDeValor(src)
  assert.ok(valores.includes('@/lib/revision-poliza-texto'))
  assert.ok(!valores.includes('@/lib/revision-poliza'))
})

test('revision-poliza-texto.ts no importa nada', () => {
  assert.doesNotMatch(readFileSync(join(RAIZ, 'lib/revision-poliza-texto.ts'), 'utf8'), /^\s*import\b/m)
})
