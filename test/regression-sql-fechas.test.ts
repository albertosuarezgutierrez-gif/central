// Guardián de regresión: aritmética de FECHAS en SQL crudo con parámetros de Prisma. `node --test`.
//
// Prisma manda los números de JavaScript como **int8 (bigint)**, y Postgres no tiene
// `date - bigint`, ni `timestamptz - bigint`, ni `make_interval(days => bigint)`:
//
//     ERROR: 42883 operator does not exist: date - bigint
//
// No es un aviso: la consulta MUERE. Y muere de las dos maneras caras que hay —
//   · el cron revienta en 500 y no hace su trabajo (`concursos-cierre`, que moría a diario;
//     `sivra_canal`, que entre el 19 y el 20/08/2026 NUNCA llegó a completar una pasada y dejó
//     los cuatro pisos tarificando con el ×1,20 supuesto que ese agente existe para corregir);
//   · o cae dentro de un `.catch(() => [])` y desaparece en silencio, que es peor: el suelo de
//     PriceLabs de `pricing/apply` se quedó en «no hay referencia» teniendo 708 filas vivas.
//
// La forma correcta es castear SIEMPRE el parámetro: `${DIAS}::int`.
//
// El literal (`CURRENT_DATE - 45`) no tiene este problema: Postgres lo tipa como integer. Este
// guardián solo mira los parámetros interpolados, que son los que llegan como bigint.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Casts que devuelven el parámetro al dominio que Postgres sabe restar a una fecha. */
const CAST_OK = String.raw`(?:::\s*(?:int|int4|integer|smallint))`
/**
 * `fecha - ${x}::date` es VÁLIDO (`date - date` → integer, los días entre ambas), igual que
 * cualquier resta entre dos instantes. Solo el parámetro NUMÉRICO desnudo revienta.
 */
const CAST_FECHA = String.raw`(?:::\s*(?:date|timestamptz|timestamp))`

const PATRONES: { nombre: string; re: RegExp }[] = [
  {
    nombre: 'date/timestamp ± parámetro sin ::int',
    re: new RegExp(
      String.raw`(?:current_date|now\s*\(\s*\)|::\s*(?:date|timestamptz|timestamp))\s*[-+]\s*\$\{[^}]*\}(?!\s*(?:${CAST_OK}|${CAST_FECHA}))`,
      'i',
    ),
  },
  {
    // `secs` NO entra: es el único argumento de `make_interval` que es `double precision`, y
    // bigint → double sí tiene cast implícito (`make_interval(secs => 900::bigint)` funciona).
    // Un guardián que grita por código correcto acaba ignorándose.
    nombre: 'make_interval(... => parámetro) sin ::int',
    re: new RegExp(
      String.raw`make_interval\s*\(\s*(?!secs\s*=>)[^)]*=>\s*\$\{[^}]*\}(?!\s*${CAST_OK})`,
      'i',
    ),
  },
]

/** Ficheros TS versionados donde puede vivir una consulta cruda. */
function ficherosTs(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => {
    if (f.includes('node_modules')) return false
    if (f.startsWith('test/')) return false            // este propio guardián contiene los patrones
    return /\.tsx?$/.test(f)
  })
}

/**
 * Vacía los comentarios de TypeScript CONSERVANDO los saltos de línea: un comentario que EXPLICA
 * el fallo (como los que este arreglo deja al lado de cada `::int`) no puede hacer fallar al
 * guardián, pero el número de línea que se reporta tiene que seguir siendo el del fichero real.
 */
function sinComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => {
      const t = l.trimStart()
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : l
    })
    .join('\n')
}

test('ninguna consulta cruda resta un parámetro de Prisma a una fecha sin ::int', () => {
  const culpables: string[] = []
  for (const f of ficherosTs()) {
    let src = ''
    try { src = readFileSync(join(ROOT, f), 'utf8') } catch { continue }
    const limpio = sinComentarios(src)
    if (!/\$queryRaw|\$executeRaw|Prisma\.sql/.test(limpio)) continue
    limpio.split('\n').forEach((linea, i) => {
      for (const p of PATRONES) {
        if (p.re.test(linea)) culpables.push(`${f}:${i + 1} — ${p.nombre}\n      ${linea.trim()}`)
      }
    })
  }
  assert.deepEqual(
    culpables,
    [],
    'Prisma manda los números como bigint y Postgres revienta con 42883 ' +
      '(`operator does not exist: date - bigint`). Castea el parámetro a `::int`:\n  - ' +
      culpables.join('\n  - '),
  )
})
