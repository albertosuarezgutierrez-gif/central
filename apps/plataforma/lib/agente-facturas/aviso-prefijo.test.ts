import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// pagos.ts importa Prisma/BD: se comprueba el FUENTE (cepo que tsc no ve) de los puntos de SQL/prefijo.
const src = readFileSync(new URL('./pagos.ts', import.meta.url), 'utf8')

test('«se cobra sola» y «revisar documento» conviven (el prefijo suma, no pisa)', () => {
  assert.match(src, /return revisar \+ aviso/)
})
test('conciliarConBanco excluye cargos ya conciliados', () => {
  assert.match(src, /mb\.conciliado IS NOT TRUE/)
})
test('lectura de gastos filtrada por cuenta y cobertura acotada a la cuenta', () => {
  assert.match(src, /s\.cuenta_id = \$\{cuentaId\}::uuid/)
  assert.match(src, /coberturaPorCuenta\(hoy, cuentaId, true\)/)
})
test('la stoplist de conciliación es la exportada (una sola fuente)', () => {
  assert.match(src, /NOT IN \(\$\{Prisma\.join\(CLAVES_GENERICAS\)\}\)/)
})

test('el resumen cuenta también las cuentas ocultas en la cobertura', () => {
  assert.match(src, /coberturaPorCuenta\(hoy, cuentaId, true\)/)
})

test('con incluirOcultas no se aplica el corte de 180 días (una cuenta parada cuenta siempre)', () => {
  const a = readFileSync(new URL('./anomalias.ts', import.meta.url), 'utf8')
  assert.match(a, /incluirOcultas \? Prisma\.empty : Prisma\.sql`HAVING/)
})
