// Guardián: ninguna skill/agente/comando documenta un curl/wget con un $SECRETO.
// `node --test` (gate en CI vía `pnpm test`).
//
// Por qué: el hook Sentinel (.claude/mcp-sentinel/hooks/sentinel_preflight.py,
// check_sensitive_env) DENIEGA en rutinas desatendidas todo Bash que combine curl/wget con un
// $SECRETO cuando la URL va en variable. Una skill que lo documente deja a la rutina atascada.
// Usa scripts/canal-aviso.sh (avisos/latido) o scripts/plataforma-gsc.sh (Search Console):
// leen las env dentro del script y la llamada de Bash no lleva ni curl ni el secreto.
//
// Las continuaciones con `\` al final de línea se unen antes de mirar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const DIRS = ['.claude/skills', '.claude/agents', '.claude/commands']

const EGRESS = /\b(curl|wget)\b/i
const SECRET_DEREF = /\$\{?(?:[A-Za-z0-9_]*_(?:TOKEN|SECRET|KEY|PASSWORD)|DATABASE_URL)\b/

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...mdFiles(p))
    else if (p.endsWith('.md')) out.push(p)
  }
  return out
}

/** Devuelve las líneas lógicas (continuaciones `\` unidas) con su nº de línea inicial. */
export function lineasLogicas(texto: string): { n: number; s: string }[] {
  const res: { n: number; s: string }[] = []
  const lines = texto.split('\n')
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i]
    const n = i + 1
    while (s.endsWith('\\') && i + 1 < lines.length) {
      s = s.slice(0, -1) + ' ' + lines[++i]
    }
    res.push({ n, s })
  }
  return res
}

export function culpable(linea: string): boolean {
  return EGRESS.test(linea) && SECRET_DEREF.test(linea)
}

test('el detector casa lo viejo y no lo nuevo', () => {
  assert.ok(culpable('curl -s "$PLATAFORMA_URL/x" -H "Authorization: Bearer $ALERTA_TOKEN"'))
  assert.ok(culpable('wget --header="X: ${API_KEY}" https://a.b'))
  assert.ok(culpable('psql "$DATABASE_URL" | curl -d @- https://a.b'))
  assert.ok(!culpable("scripts/plataforma-gsc.sh POST '{\"limite\":50}'"))
  assert.ok(!culpable('Usa curl con el nombre ALERTA_TOKEN sin desreferenciar'))
})

test('ninguna skill/agente/comando mezcla curl/wget con un $SECRETO', () => {
  const culpables: string[] = []
  for (const d of DIRS) {
    for (const f of mdFiles(join(ROOT, d))) {
      for (const { n, s } of lineasLogicas(readFileSync(f, 'utf8'))) {
        if (culpable(s)) culpables.push(`${relative(ROOT, f)}:${n}  ${s.trim().slice(0, 120)}`)
      }
    }
  }
  assert.deepEqual(
    culpables,
    [],
    'curl/wget + $SECRETO en una skill/agente/comando: Sentinel lo DENIEGA en rutinas desatendidas. ' +
    'Usa scripts/canal-aviso.sh (avisos/latido) o scripts/plataforma-gsc.sh (Search Console), que ' +
    'leen las env dentro del script:\n  - ' + culpables.join('\n  - '),
  )
})
