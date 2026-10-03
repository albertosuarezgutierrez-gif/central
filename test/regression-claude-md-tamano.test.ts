// Los CLAUDE.md se cargan enteros en cada sesión y en cada subagente: cada KB cuesta tokens en
// TODAS las conversaciones. Se recortaron a «reglas + índice» (30/09 y 03/10/2026) y el detalle
// vive en docs/claude-md/*-completo-*.md. Este cepo impide que vuelvan a crecer sin control.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const TOPE = 24 * 1024

const ficheros = [
  'CLAUDE.md',
  ...readdirSync(join(RAIZ, 'apps'))
    .map((app) => join('apps', app, 'CLAUDE.md'))
    .filter((f) => existsSync(join(RAIZ, f))),
]

test('ningún CLAUDE.md supera el tope (el detalle va a docs/claude-md/)', () => {
  const gordos = ficheros
    .map((f) => ({ f, kb: Math.round(statSync(join(RAIZ, f)).size / 1024) }))
    .filter(({ f }) => statSync(join(RAIZ, f)).size > TOPE)
  assert.deepEqual(
    gordos,
    [],
    `CLAUDE.md por encima de ${TOPE / 1024} KB: condensa a una línea por regla y mueve la narrativa ` +
      `(incidentes, cifras, PRs) a docs/claude-md/<APP>-completo-*.md`,
  )
})
