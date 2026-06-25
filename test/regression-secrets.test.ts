// Guardián de secretos de auth. `node --test` (gate en CI vía `pnpm test`).
//
// FALLA si un secreto cae a un LITERAL como fallback —p.ej.
// `process.env.JWT_SECRET || 'algo'`— sin guarda de producción. En ese caso el
// literal queda escrito en el repo y, para secretos que FIRMAN o VALIDAN tokens
// (JWT_SECRET, *_SECRET de cron/operador…), es una credencial usable: cualquiera
// que lea el repo puede falsificar sesiones/tokens. La forma correcta es fallar en
// duro en producción (ver `requireSecret` en @central/core-identity) o la guarda
// multilínea `env || (NODE_ENV==='production' ? throw : 'dev')`, que NO casa aquí
// (tras `||` viene `(`, no una comilla).
//
// NO marca: `|| ''` (vacío: no es credencial usable) ni la guarda de producción.
// Excepciones triadas a mano abajo (ALLOWLIST) o con un comentario inline
// `guardia-secretos: ok <motivo>` en la misma línea.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

// `process.env.<NOMBRE con SECRET|TOKEN|PASSWORD|KEY>` (excluye `NEXT_PUBLIC_*`,
// que por definición se exponen al navegador y NUNCA son secretas) seguido de
// `||`/`??` y un literal de cadena NO vacío. `\s` cruza saltos de línea (la guarda
// multilínea no casa porque tras `||` hay `(`, no una comilla).
const DANGER = /process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*(['"])[^'"]+\1/g

// Excepciones seguras: literal que NO es una credencial usable.
// `snippet` debe aparecer en la línea marcada.
const ALLOWLIST: { file: string; snippet: string; motivo: string }[] = [
  { file: 'apps/ia-rest/src/lib/supabase.ts', snippet: "SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder'", motivo: "build-time; 'placeholder' no autentica contra Supabase" },
  { file: 'apps/ia-rest/src/lib/email.ts',    snippet: "RESEND_API_KEY ?? 'placeholder'",            motivo: "key externa; 'placeholder' solo hace fallar el envío" },
]

function trackedCodeFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.endsWith('.md')) return false
    if (f.includes('node_modules')) return false
    if (f.endsWith('pnpm-lock.yaml')) return false
    if (f.startsWith('test/')) return false // este propio test contiene los patrones
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)
  })
}

function isAllowed(file: string, matchText: string, line: string): boolean {
  if (line.includes('guardia-secretos: ok')) return true
  return ALLOWLIST.some((a) => a.file === file && line.includes(a.snippet))
}

test('ningún secreto de auth con fallback a un literal hardcodeado', () => {
  const culpables: string[] = []
  for (const f of trackedCodeFiles()) {
    let content = ''
    try { content = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    const lines = content.split('\n')
    for (const m of content.matchAll(DANGER)) {
      const before = content.slice(0, m.index)
      const lineNo = before.split('\n').length
      const line = lines[lineNo - 1] ?? ''
      if (isAllowed(f, m[0], line)) continue
      culpables.push(`${f}:${lineNo}  ${m[0].replace(/\s+/g, ' ').trim()}`)
    }
  }
  assert.deepEqual(
    culpables,
    [],
    'Secreto de auth con fallback a literal (usa requireSecret() o guarda de producción; ' +
    'si es seguro, añádelo a ALLOWLIST o pon `// guardia-secretos: ok <motivo>`):\n  - ' +
    culpables.join('\n  - '),
  )
})
