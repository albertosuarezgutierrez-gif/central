// Inmutabilidad en el CÓDIGO (la BD la impone con triggers; ver esquema-sql.test.ts): ningún fichero de la app emite UPDATE o
// DELETE sobre asientos/apuntes/auditoría/reglas, ni DELETE sobre ninguna tabla del schema. Corregir = contraasiento.
// Cepo visto fallar el 05/11/2026: añadiendo a lib/repo.ts una línea `UPDATE contabilidad.apuntes SET debe = 0` → rojo; quitada → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { crearAsiento, crearPlan, ejercicioNatural } from '@central/module-contabilidad'

const RAIZ = join(import.meta.dirname, '..')

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (['node_modules', '.next', 'test', 'prisma'].includes(n)) return []
    return statSync(p).isDirectory() ? ficheros(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

test('ningún UPDATE/DELETE/TRUNCATE de asientos, apuntes, auditoría o reglas; ningún DELETE en el schema', () => {
  const culpables: string[] = []
  for (const f of [...ficheros(join(RAIZ, 'lib')), ...ficheros(join(RAIZ, 'app'))]) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\b(UPDATE|DELETE FROM|TRUNCATE)\s+contabilidad\.(\w+)/gi)) {
      if (/^DELETE|^TRUNCATE/i.test(m[1]) || ['asientos', 'apuntes', 'auditoria', 'reglas_asiento'].includes(m[2])) {
        culpables.push(`${relative(RAIZ, f)}: ${m[0]}`)
      }
    }
  }
  assert.deepEqual(culpables, [])
})

test('el asiento del núcleo nace congelado (no se puede mutar en memoria antes de guardarlo)', () => {
  const a = crearAsiento({ fecha: '2026-01-02', ejercicio: 2026, concepto: 'x', apuntes: [{ cuenta: '572', debe: 100, haber: 0 }, { cuenta: '100', debe: 0, haber: 100 }] }, crearPlan(), ejercicioNatural(2026))
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.apuntes) && Object.isFrozen(a.apuntes[0]))
  assert.throws(() => { (a.apuntes[0] as { debe: number }).debe = 1 })
})
