import test from 'node:test'
import assert from 'node:assert/strict'
import { appAfectada } from '../scripts/ci-app-afectada.mjs'

const conocidos = new Set(['module-seguros', 'core-ai', 'brand'])
const consumidos = new Set(['module-seguros'])
const plat = (cambios: string[], cons: Set<string> | null = consumidos, con: Set<string> | null = conocidos) =>
  appAfectada(cambios, 'apps/plataforma', cons, con).afecta

test('toca su app → afecta', () => assert.equal(plat(['apps/plataforma/lib/x.ts']), true))
test('solo otra app → NO afecta', () => assert.equal(plat(['apps/sivra/lib/x.ts']), false))
test('solo docs, .claude, test/ o .md raíz → NO afecta', () =>
  assert.equal(plat(['docs/a.md', '.claude/skills/x/SKILL.md', 'test/r.test.ts', 'CLAUDE.md']), false))
test('package que consume → afecta; uno que no → no', () => {
  assert.equal(plat(['packages/module-seguros/src/a.ts']), true)
  assert.equal(plat(['packages/core-ai/src/a.ts']), false)
})
test('package desconocido o cierre sin resolver → afecta (fail-open)', () => {
  assert.equal(plat(['packages/nuevo/src/a.ts']), true)
  assert.equal(plat(['packages/core-ai/src/a.ts'], null, null), true)
})
test('manifiesto raíz, lockfile, workflow o script → afecta', () => {
  for (const f of ['pnpm-lock.yaml', 'package.json', '.github/workflows/tests.yml', 'scripts/x.mjs', 'tsconfig.base.json']) {
    assert.equal(plat([f]), true, f)
  }
})
test('diff vacío → afecta', () => assert.equal(plat([]), true))
test('prefijo de otra app con el mismo inicio NO cuenta (asegura vs asegura-web)', () =>
  assert.equal(appAfectada(['apps/asegura-web/x.ts'], 'apps/asegura', null, null).afecta, false))
