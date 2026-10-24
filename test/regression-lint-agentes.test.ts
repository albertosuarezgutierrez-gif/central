// Cepo de `scripts/lint-agentes.mjs` (lint estático de agentes y skills, sin modelo).
// Fixtures temporales en os.tmpdir(); el script se ejecuta como proceso real y se mira el exit code.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'lint-agentes.mjs')
const DESC = 'Descripción suficientemente larga para pasar el umbral mínimo del lint.'

function fixture(montar: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'lint-agentes-'))
  mkdirSync(join(root, '.claude/agents'), { recursive: true })
  mkdirSync(join(root, '.claude/skills'), { recursive: true })
  montar(root)
  return root
}
function correr(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout }
}
const skill = (root: string, dir: string, fm: string) => {
  mkdirSync(join(root, '.claude/skills', dir), { recursive: true })
  writeFileSync(join(root, '.claude/skills', dir, 'SKILL.md'), `---\n${fm}\n---\ncuerpo\n`)
}

test('todo bien → exit 0', () => {
  const root = fixture((r) => {
    skill(r, 'ok', `name: ok\ndescription: >-\n  ${DESC}`)
    writeFileSync(join(r, '.claude/agents/a.md'), `---\nname: a\ndescription: ${DESC}\ntools: Read, Grep, mcp__X__y\n---\nhola\n`)
  })
  try {
    const { code, out } = correr(root)
    assert.equal(code, 0, out)
    assert.match(out, /0 ERROR/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('frontmatter sin description → ERROR y exit 1', () => {
  const root = fixture((r) => skill(r, 'x', 'name: x'))
  try {
    const { code, out } = correr(root)
    assert.equal(code, 1)
    assert.match(out, /ERROR .*x\/SKILL\.md: frontmatter sin `description`/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('name ≠ carpeta → ERROR y exit 1', () => {
  const root = fixture((r) => skill(r, 'carpeta', `name: otro\ndescription: ${DESC}`))
  try {
    const { code, out } = correr(root)
    assert.equal(code, 1)
    assert.match(out, /ERROR .*name «otro» ≠ carpeta «carpeta»/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('duplicado → ERROR; enlace roto y description corta → solo AVISO (exit 0)', () => {
  const dup = fixture((r) => {
    skill(r, 'a', `name: a\ndescription: ${DESC}`)
    writeFileSync(join(r, '.claude/agents/a.md'), `---\nname: a\ndescription: ${DESC}\n---\n`)
  })
  const av = fixture((r) => {
    mkdirSync(join(r, '.claude/skills/b'), { recursive: true })
    writeFileSync(join(r, '.claude/skills/b/SKILL.md'), `---\nname: b\ndescription: corta\n---\nVer \`docs/NO-EXISTE.md\`\n`)
  })
  try {
    assert.equal(correr(dup).code, 1)
    assert.match(correr(dup).out, /duplicado/)
    const r = correr(av)
    assert.equal(r.code, 0)
    assert.match(r.out, /AVISO .*< 40/)
    assert.match(r.out, /AVISO .*docs\/NO-EXISTE\.md/)
  } finally {
    rmSync(dup, { recursive: true, force: true })
    rmSync(av, { recursive: true, force: true })
  }
})
