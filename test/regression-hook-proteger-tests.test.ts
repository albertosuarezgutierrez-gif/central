// Cepo del hook `scripts/proteger-tests.mjs` (anti falso-verde). `node --test`.
// Alimenta el hook REAL por stdin, como hace Claude Code, y mira el exit code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const HOOK = join(import.meta.dirname, '..', 'scripts', 'proteger-tests.mjs')
const correr = (entrada: unknown) =>
  spawnSync('node', [HOOK], { input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada), encoding: 'utf8' })
const edit = (file_path: string, old_string: string, new_string: string) =>
  ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string } })

test('añadir .skip( a un test -> bloquea (exit 2)', () => {
  const r = correr(edit('/x/test/a.test.ts', "test('a', () => {})", "test.skip('a', () => {})"))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /proteger-tests/)
})

test('añadir .only( -> bloquea', () => {
  assert.equal(correr(edit('/x/a.spec.ts', "it('a', f)", "it.only('a', f)")).status, 2)
})

test('añadir xit( / test.todo / skip: true -> bloquea', () => {
  assert.equal(correr(edit('/x/a.test.ts', "it('a', f)", "xit('a', f)")).status, 2)
  assert.equal(correr(edit('/x/a.test.ts', "it('a', f)", "it.todo('a')")).status, 2)
  assert.equal(correr(edit('/x/a.test.ts', "test('a', f)", "test('a', { skip: true }, f)")).status, 2)
})

test('MultiEdit que añade .skip( -> bloquea', () => {
  const r = correr({ tool_name: 'MultiEdit', tool_input: { file_path: '/x/a.test.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: "test('a'", new_string: "test.skip('a'" }] } })
  assert.equal(r.status, 2)
})

test('Write vacío sobre un test existente -> bloquea', () => {
  const r = correr({ tool_name: 'Write', tool_input: { file_path: join(import.meta.dirname, 'regression-guardian-rama.test.ts'), content: '' } })
  assert.equal(r.status, 2)
})

test('editar un test que YA tenía skip sin añadir otro -> pasa', () => {
  const r = correr(edit('/x/a.test.ts', "test.skip('a', () => { assert.equal(1, 1) })", "test.skip('a', () => { assert.equal(2, 2) })"))
  assert.equal(r.status, 0)
})

test('quitar un skip -> pasa', () => {
  assert.equal(correr(edit('/x/a.test.ts', "test.skip('a', f)", "test('a', f)")).status, 0)
})

test('fichero que no es de test con .skip( -> pasa', () => {
  assert.equal(correr(edit('/x/lib/util.ts', 'a', 'arr.skip(1)')).status, 0)
})

test('Write de un test nuevo normal -> pasa', () => {
  assert.equal(correr({ tool_name: 'Write', tool_input: { file_path: '/nonexistent/z.test.ts', content: "test('a', f)" } }).status, 0)
})

test('JSON roto / vacío -> pasa (fail-open)', () => {
  assert.equal(correr('{no es json').status, 0)
  assert.equal(correr('').status, 0)
})
