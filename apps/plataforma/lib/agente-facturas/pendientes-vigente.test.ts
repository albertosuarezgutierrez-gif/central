// Cepo: la bandeja de pendientes (/expenses/pendientes) NO debe enseñar gastos descartados
// (incidente 03/11/2026: liquidaciones de pólizas de clientes y facturas de Booking ya descartadas seguían saliendo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('toda consulta de pendientes excluye descartados (sqlGastoVigente)', () => {
  const src = readFileSync(new URL('./pendientes.ts', import.meta.url), 'utf8')
  const lineas = src.split('\n').filter(l => /WHERE[^\n]*revisado = (false|true)/.test(l))
  assert.ok(lineas.length >= 5, `esperaba ≥5 consultas, hay ${lineas.length}`)
  for (const l of lineas) assert.match(l, /sqlGastoVigente\('gastos'\)/, `sin filtro de vigentes: ${l.trim()}`)
})
