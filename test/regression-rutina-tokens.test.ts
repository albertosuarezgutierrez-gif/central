// Guardián del ALCANCE del token de rutina en BD. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// QUÉ PROTEGE: `lib/rutina-tokens.ts` valida tokens guardados en la tabla `rutina_tokens` (solo su
// SHA-256). Existe para UNA cosa: que una rutina de Claude Code pueda avisar por Telegram aunque la env
// `ALERTA_TOKEN` de Vercel haya derivado — porque esa env no la puede reparar una sesión (el conector de
// Vercel no escribe envs), y el fallo es mudo por diseño (el canal roto ES el canal de aviso).
//
// Es un token que vive en el entorno/prompt de una rutina, o sea en TEXTO PLANO VISIBLE. Su alcance
// tiene que quedarse en "mandar un Telegram a Alberto". Si mañana alguien lo enchufa a `/api/trading/*`,
// al pricing o a cualquier endpoint que mueva dinero o datos, este test lo para en CI.
//
// Si de verdad hace falta ampliarlo, el cambio es deliberado: añade la ruta a PERMITIDOS y explica por
// qué en el commit. Lo que no puede pasar es que se amplíe sin que nadie se entere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Únicos archivos que pueden importar el validador de tokens de rutina. */
const PERMITIDOS = [
  'apps/plataforma/lib/rutina-tokens.ts', // el propio módulo
  'apps/plataforma/app/api/internal/alerta/route.ts', // el aviso Telegram: su única razón de ser
]

function archivosDeCodigo(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps', 'packages'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules'))
}

test('rutinaDeToken solo se usa en el endpoint de aviso', () => {
  const usuarios = archivosDeCodigo().filter((f) => {
    if (PERMITIDOS.includes(f)) return false
    return /rutina-tokens|rutinaDeToken/.test(readFileSync(join(ROOT, f), 'utf8'))
  })

  assert.deepEqual(
    usuarios,
    [],
    'El token de rutina en BD viaja en texto plano en el entorno/prompt de una rutina: su alcance es ' +
      'SOLO mandar un Telegram. Estos archivos lo estarían usando para otra cosa. Si es intencionado, ' +
      'añádelos a PERMITIDOS en este test y justifícalo en el commit.',
  )
})

test('el token de rutina se guarda hasheado, nunca en claro', () => {
  const lib = readFileSync(join(ROOT, 'apps/plataforma/lib/rutina-tokens.ts'), 'utf8')
  assert.match(lib, /createHash\('sha256'\)/, 'debe hashear con SHA-256 antes de tocar la BD')
  // La columna en claro no existe: si alguien la introduce, que salte aquí.
  assert.ok(
    !/SELECT[^;]*\btoken\b(?!_sha256)/i.test(lib),
    'no debe leerse ninguna columna `token` en claro — solo `token_sha256`',
  )

  const sql = readFileSync(join(ROOT, 'apps/plataforma/prisma/sql/2026-07-27_rutina_tokens.sql'), 'utf8')
  assert.match(sql, /token_sha256\s+text NOT NULL UNIQUE/, 'la tabla guarda el hash, no el token')
  assert.ok(
    !/\btoken\s+text NOT NULL\b/.test(sql),
    'la tabla NO debe tener una columna `token` en claro',
  )
})
