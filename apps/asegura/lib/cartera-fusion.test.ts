import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🪤 Cepos de la fusión con DNI ILEGIBLE (28/09/2026).
 *
 * Leen el FUENTE, como `ingesta-huerfanas.test.ts`: importar `cartera-fusion.ts`
 * arrastra `./asegura-db` → el cliente de Prisma generado, y el job
 * `Tests (packages + guardián)` corre sin `prisma generate`.
 *
 * Lo que vigilan: un DNI sin índice solo puede pasar por «ilegible» (y con eso
 * dejar fusionar con solo marcar la casilla) si la clave del proceso LEE la
 * cartera de verdad. Si no, dos personas con DNI legible pero sin índice
 * (padre e hijo) se fundirían.
 */
const FUENTE = readFileSync(join(import.meta.dirname, 'cartera-fusion.ts'), 'utf8')

function cuerpo(firma: string): string {
  const i = FUENTE.indexOf(firma)
  assert.ok(i >= 0, `no encuentro ${firma}`)
  const fin = FUENTE.indexOf('\n}\n', i)
  return FUENTE.slice(i, fin)
}

test('🪤 la clave se prueba contra un DNI YA indexado de la cartera, no con un ida y vuelta propio', () => {
  // Un encrypt→decrypt con la misma clave sale bien con una clave válida pero
  // equivocada, y sin clave fuera de producción: no prueba nada.
  assert.doesNotMatch(FUENTE, /encryptField\(/)
  const c = cuerpo('async function claveLeeCartera')
  assert.match(c, /dniLookupHash:\s*\{\s*not:\s*null\s*\}/)
  assert.match(c, /looksLikeDniNieCif\(decryptField\(/)
  assert.match(c, /correduriaId/)
})

test('🪤 sin clave que lea la cartera, ningún DNI cuenta como ilegible', () => {
  const c = cuerpo('function dniIlegible(')
  assert.match(c, /if \(!claveLee\b[^\n]*\) return false/)
  // Y la comparación que decide la identidad la calcula una vez y la usa.
  assert.match(FUENTE, /const claveLee = await claveLeeCartera\(correduriaId\)/)
  assert.match(FUENTE, /identidadFusion\(dniDe\(s, claveLee\), dniDe\(l, claveLee\)\)/)
})
