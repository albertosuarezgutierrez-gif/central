import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cepo de FUENTE: tsc no mira el SQL. `ficheros90` se mide sobre los 90 d ANTERIORES AL ÚLTIMO
// fichero de ese tipo; contra hoy, un tipo mudo dejaría de ser «habitual» por estar mudo.
const src = readFileSync(new URL('./ingesta.ts', import.meta.url), 'utf8')

test('ficheros90 cuenta desde el último fichero del tipo, no desde hoy', () => {
  assert.match(src, /MAX\(dia\) OVER \(PARTITION BY entidad, tipo\) AS ultimo/)
  assert.match(src, /SUM\(n\) FILTER \(WHERE dia > ultimo - 90\)[^\n]*AS ficheros90/)
  assert.doesNotMatch(src, /FILTER \(WHERE dia > CURRENT_DATE - 90\)/)
})
