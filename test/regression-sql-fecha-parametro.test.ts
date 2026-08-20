// Guardián de aritmética de fechas con parámetro en SQL. `node --test` (gate en CI vía `pnpm test`).
//
// FALLA si una consulta suma o resta a una fecha un parámetro interpolado SIN castear —p.ej.
// `WHERE medido_el >= CURRENT_DATE - ${VENTANA_DIAS}`.
//
// Por qué importa: Prisma manda un número de JS como **int8**, y en PostgreSQL el operador
// `date - bigint` NO EXISTE (error 42883). `date - integer` sí. Así que la consulta compila,
// pasa `tsc`, pasa `next build` y pasa la suite entera —porque nada de eso la EJECUTA— y
// revienta la primera vez que corre de verdad, en producción.
//
// Caso fundacional (20/08/2026): la primera pasada real del cron `/api/sivra/pricing/canal`
// murió con ese 42883, así que el calibrado del canal no llegó a escribir nada y los cuatro
// pisos se quedaron tarificando con el ×1,20 inventado que ese cron existe para corregir.
// Al buscar el patrón apareció el hermano caro: la misma construcción en el suelo de PriceLabs
// de `/api/sivra/pricing/apply`, donde además la tapaba un `.catch(() => [])` — el suelo del
// 85% llevaba días INERTE y su propio aviso del 70% tampoco podía saltar, porque «no he podido
// leer la referencia» se servía como «no hay referencia».
//
// La cura es un cast explícito: `${DIAS}::int` (o `::integer`).
//
// 🚨 `make_interval(days => …)` NO es una cura por sí sola —esta cabecera lo decía y era falso—:
// todos sus argumentos son `integer` MENOS `secs` (que es `double precision`), así que
// `make_interval(days => bigint)` y `(hours => bigint)` fallan con el mismo 42883, y solo
// `(secs => bigint)` pasa (bigint → double sí tiene cast implícito; comprobado contra la BD).
// Por eso este guardián vigila también esa forma, y por eso `secs` queda fuera: un guardián que
// grita por código correcto acaba ignorándose. Cazó dos averías vivas el 20/08/2026:
// `lib/ia-cache.ts` (la caché semántica NO guardaba NADA) y el cron de mailing de ialimp
// (los pasos de seguimiento ≥2 nunca se encolaban).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

// Un token de fecha (CURRENT_DATE, now(), algo acabado en `_date`/`_at`, o un `::date`)
// seguido de `+`/`-` y una interpolación `${...}` que NO queda tipada.
// Formas SEGURAS que no debe marcar: el cast dentro (`${D}::int`) o envolviendo la
// interpolación (`(${D})::int`), y el idiom de intervalo (`(${N} || ' months')::interval`).
const DANGER = new RegExp(
  String.raw`(?:CURRENT_DATE|current_date|now\(\)|::date|\b\w+_(?:date|at)\b)` +
  String.raw`\s*[-+]\s*\(?\$\{[^}]+\}\)?` +
  String.raw`(?!\s*(?:\|\||::\s*(?:int|integer|smallint|bigint|interval|date|timestamptz|timestamp)))`,
  'g',
)

// `make_interval(<arg> => ${...})` sin castear. `secs` excluido a propósito (ver cabecera).
const DANGER_INTERVAL = new RegExp(
  String.raw`make_interval\s*\(\s*(?!secs\s*=>)[^)]*=>\s*\(?\$\{[^}]+\}\)?` +
  String.raw`(?!\s*::\s*(?:int|integer|smallint))`,
  'g',
)

/** Excepciones triadas a mano. `snippet` debe aparecer en la línea marcada. */
const ALLOWLIST: { file: string; snippet: string; motivo: string }[] = []

function trackedSqlCarrying(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.includes('node_modules')) return false
    if (f.startsWith('test/')) return false // este propio test contiene los patrones
    return /\.(ts|tsx|mjs|cjs|js)$/.test(f)
  })
}

function isAllowed(file: string, line: string): boolean {
  if (line.includes('guardia-fechas: ok')) return true
  return ALLOWLIST.some((a) => a.file === file && line.includes(a.snippet))
}

test('ninguna aritmética de fecha con parámetro sin castear (Postgres no tiene date - bigint)', () => {
  const culpables: string[] = []
  for (const f of trackedSqlCarrying()) {
    let content = ''
    try { content = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    const lines = content.split('\n')
    for (const m of [...content.matchAll(DANGER), ...content.matchAll(DANGER_INTERVAL)]) {
      const lineNo = content.slice(0, m.index).split('\n').length
      const line = lines[lineNo - 1] ?? ''
      if (isAllowed(f, line)) continue
      culpables.push(`${f}:${lineNo}  ${m[0].replace(/\s+/g, ' ').trim()}`)
    }
  }
  assert.deepEqual(
    culpables,
    [],
    'Aritmética de fecha con parámetro sin cast: Prisma lo manda como int8 y `date - bigint` no ' +
    'existe en Postgres (42883) — revienta SOLO en runtime. Añade `::int` (o usa make_interval); ' +
    'si de verdad es seguro, ALLOWLIST o `-- guardia-fechas: ok <motivo>` en la línea:\n  - ' +
    culpables.join('\n  - '),
  )
})
