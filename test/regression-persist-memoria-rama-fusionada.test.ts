// Guardián del hook Stop `persist-memoria.sh`: NO debe commitear ni empujar la memoria a una rama
// cuyo trabajo ya está fusionado en main (mueve la punta tras el merge, GitHub deja de ofrecer
// «Delete branch» y el commit queda huérfano; caso ccf49acad tras #4741). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOOK = join(import.meta.dirname, '..', '.claude', 'hooks', 'persist-memoria.sh')
const g = (cwd: string, ...a: string[]) =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function montar() {
  const dir = mkdtempSync(join(tmpdir(), 'persist-memoria-'))
  const origin = join(dir, 'origin.git')
  const w = join(dir, 'w')
  g(dir, 'init', '-q', '--bare', '-b', 'main', origin)
  g(dir, 'clone', '-q', origin, w)
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false']]) g(w, 'config', k, v)
  mkdirSync(join(w, 'docs'))
  mkdirSync(join(w, 'docs/uso-herramientas'))
  writeFileSync(join(w, 'docs/uso-herramientas/.gitkeep'), '')
  writeFileSync(join(w, 'docs/CONTEXTO-SESIONES.md'), 'base\n')
  g(w, 'add', '.')
  g(w, 'commit', '-q', '-m', 'base')
  g(w, 'push', '-q', 'origin', 'main')
  return { dir, origin, w }
}

function correrHook(w: string) {
  return spawnSync('bash', [HOOK], {
    cwd: w,
    input: '{"stop_hook_active":true}',
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: w },
  })
}

const pushes = (origin: string, rama: string) => {
  try { return g(origin, 'rev-parse', rama) } catch { return '' }
}

test('rama fusionada (merge normal): no commitea ni empuja la memoria', () => {
  const { dir, origin, w } = montar()
  try {
    g(w, 'checkout', '-q', '-b', 'feat')
    writeFileSync(join(w, 'x.txt'), 'x\n')
    g(w, 'add', '.')
    g(w, 'commit', '-q', '-m', 'feat')
    g(w, 'push', '-q', 'origin', 'feat')
    g(w, 'checkout', '-q', 'main')
    g(w, 'merge', '-q', '--no-ff', '-m', 'merge', 'feat')
    g(w, 'push', '-q', 'origin', 'main')
    g(w, 'checkout', '-q', 'feat')
    const punta = pushes(origin, 'feat')
    writeFileSync(join(w, 'docs/CONTEXTO-SESIONES.md'), 'base\nnota\n')
    const r = correrHook(w)
    assert.equal(r.status, 0)
    assert.match(r.stderr, /ya está fusionada/)
    assert.equal(pushes(origin, 'feat'), punta, 'la punta remota no debe moverse')
    assert.equal(g(w, 'log', '-1', '--format=%s'), 'feat', 'no debe haber commit nuevo')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('rama viva (con trabajo sin fusionar): sigue commiteando y empujando', () => {
  const { dir, origin, w } = montar()
  try {
    g(w, 'checkout', '-q', '-b', 'viva')
    writeFileSync(join(w, 'x.txt'), 'x\n')
    g(w, 'add', '.')
    g(w, 'commit', '-q', '-m', 'trabajo')
    g(w, 'push', '-q', 'origin', 'viva')
    writeFileSync(join(w, 'docs/CONTEXTO-SESIONES.md'), 'base\nnota\n')
    const r = correrHook(w)
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), 'chore(memoria): actualizar contexto de sesión')
    assert.equal(pushes(origin, 'viva'), g(w, 'rev-parse', 'HEAD'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('rama nueva sin empujar (igual que main): no se considera fusionada', () => {
  const { dir, w } = montar()
  try {
    g(w, 'checkout', '-q', '-b', 'nueva')
    writeFileSync(join(w, 'docs/CONTEXTO-SESIONES.md'), 'base\nnota\n')
    const r = correrHook(w)
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), 'chore(memoria): actualizar contexto de sesión')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
