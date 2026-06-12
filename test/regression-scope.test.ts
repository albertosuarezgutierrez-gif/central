// Guardián de regresión de la casa de marcas. `node --test`.
//
// El scope npm se renombró @iarest/* → @central/* (11/06/2026, sin clientes).
// Este test FALLA si reaparece una referencia al scope viejo en CÓDIGO o en un
// package.json (los .md de documentación pueden mencionarlo en histórico, se excluyen).
// Así el rename no se deshace por descuido en un PR futuro.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Ficheros versionados que son código o config (no documentación). */
function trackedCodeFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.endsWith('.md')) return false                 // docs: pueden citar el histórico
    if (f.includes('node_modules')) return false
    if (f.endsWith('pnpm-lock.yaml')) return false
    if (f.startsWith('test/')) return false             // este propio test menciona el string
    return /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(f)
  })
}

test('no quedan referencias al scope viejo @iarest/ en código ni package.json', () => {
  const culpables: string[] = []
  for (const f of trackedCodeFiles()) {
    let content = ''
    try { content = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    if (content.includes('@iarest/')) culpables.push(f)
  }
  assert.deepEqual(
    culpables,
    [],
    `Scope viejo @iarest/* detectado (usa @central/*):\n  - ${culpables.join('\n  - ')}`,
  )
})
