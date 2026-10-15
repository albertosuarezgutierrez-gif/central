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

// Stub de `gh` en PATH (sin red): imprime GH_STUB_JSON (ya con el formato de --jq: «estado merged_at sha»
// por línea) y sale con GH_STUB_EXIT (0 por defecto).
function correrHook(w: string, stub?: { filas?: string; exit?: number }) {
  const bin = mkdtempSync(join(tmpdir(), 'gh-stub-'))
  writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\nprintf "%s" "${GH_STUB_JSON:-}"\nexit "${GH_STUB_EXIT:-0}"\n', { mode: 0o755 })
  try {
    return spawnSync('bash', [HOOK], {
      cwd: w,
      input: '{"stop_hook_active":true}',
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: w,
        PATH: `${bin}:${process.env.PATH}`,
        GH_STUB_JSON: stub?.filas ?? '',
        GH_STUB_EXIT: String(stub?.exit ?? 0),
      },
    })
  } finally { rmSync(bin, { recursive: true, force: true }) }
}

const pushes = (origin: string, rama: string) => {
  try { return g(origin, 'rev-parse', rama) } catch { return '' }
}

const MERGED = '2026-01-01T00:00:00Z'
const NOTA = (w: string) => writeFileSync(join(w, 'docs/CONTEXTO-SESIONES.md'), 'base\nnota\n')
const SUBJ = 'chore(memoria): actualizar contexto de sesión'

function ramaEmpujada(w: string, rama: string) {
  g(w, 'checkout', '-q', '-b', rama)
  writeFileSync(join(w, 'x.txt'), 'x\n')
  g(w, 'add', '.')
  g(w, 'commit', '-q', '-m', 'trabajo')
  g(w, 'push', '-q', 'origin', rama)
}

test('a) PR fusionado con head.sha == HEAD y sin abiertos: no empuja', () => {
  const { dir, origin, w } = montar()
  try {
    ramaEmpujada(w, 'feat')
    const punta = pushes(origin, 'feat')
    NOTA(w)
    const r = correrHook(w, { filas: `closed ${MERGED} ${g(w, 'rev-parse', 'HEAD')}\n` })
    assert.equal(r.status, 0)
    assert.match(r.stderr, /ya está fusionada/)
    assert.equal(pushes(origin, 'feat'), punta, 'la punta remota no debe moverse')
    assert.equal(g(w, 'log', '-1', '--format=%s'), 'trabajo')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('b) rama nueva empujada sin commits propios, gh devuelve nada: empuja', () => {
  const { dir, origin, w } = montar()
  try {
    g(w, 'checkout', '-q', '-b', 'nueva')
    g(w, 'push', '-q', 'origin', 'nueva')
    NOTA(w)
    const r = correrHook(w, { filas: '' })
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), SUBJ)
    assert.equal(pushes(origin, 'nueva'), g(w, 'rev-parse', 'HEAD'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('c) rama reutilizada: PR viejo fusionado (sha ancestro de HEAD, HEAD distinto): empuja', () => {
  const { dir, origin, w } = montar()
  try {
    ramaEmpujada(w, 'reuso')
    const viejo = g(w, 'rev-parse', 'HEAD')
    writeFileSync(join(w, 'y.txt'), 'y\n')
    g(w, 'add', '.')
    g(w, 'commit', '-q', '-m', 'nuevo')
    g(w, 'push', '-q', 'origin', 'reuso')
    NOTA(w)
    const r = correrHook(w, { filas: `closed ${MERGED} ${viejo}\n` })
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), SUBJ)
    assert.equal(pushes(origin, 'reuso'), g(w, 'rev-parse', 'HEAD'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('d) PR fusionado pero hay otro abierto: empuja', () => {
  const { dir, origin, w } = montar()
  try {
    ramaEmpujada(w, 'dos')
    const head = g(w, 'rev-parse', 'HEAD')
    NOTA(w)
    const r = correrHook(w, { filas: `open - abc123\nclosed ${MERGED} ${head}\n` })
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), SUBJ)
    assert.equal(pushes(origin, 'dos'), g(w, 'rev-parse', 'HEAD'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('e) gh falla (exit 1): empuja', () => {
  const { dir, origin, w } = montar()
  try {
    ramaEmpujada(w, 'falla')
    const head = g(w, 'rev-parse', 'HEAD')
    NOTA(w)
    const r = correrHook(w, { filas: `closed ${MERGED} ${head}\n`, exit: 1 })
    assert.equal(r.status, 0)
    assert.equal(g(w, 'log', '-1', '--format=%s'), SUBJ)
    assert.equal(pushes(origin, 'falla'), g(w, 'rev-parse', 'HEAD'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
