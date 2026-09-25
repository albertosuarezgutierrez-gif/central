import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historialCompanias } from './historial-companias.ts'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const p = (id: string, compania: string, inicio: string | null, sustituyeAId: string | null = null) => ({
  id, compania, numeroPoliza: `N-${id}`, fechaInicio: inicio === null ? null : d(inicio), sustituyeAId,
})

test('Mapfre → Reale: la fecha del cambio es el INICIO de Reale, no el vencimiento de Mapfre', () => {
  const polizas = [p('mapfre', 'Mapfre', '2020-09-24'), p('reale', 'Reale', '2026-09-22', 'mapfre')]
  const h = historialCompanias('reale', polizas)
  assert.deepEqual(h.map((e) => e.compania), ['Mapfre', 'Reale'])
  assert.deepEqual(h[0].hasta, d('2026-09-22'))
  assert.equal(h[1].hasta, null)
  // Desde la ficha de la vieja se ve la misma cadena.
  assert.deepEqual(historialCompanias('mapfre', polizas), h)
})

test('tres compañías en cadena, ordenadas de la más antigua a la actual', () => {
  const polizas = [p('c', 'Allianz', '2027-01-01', 'b'), p('a', 'Mapfre', '2019-01-01'), p('b', 'Reale', '2023-01-01', 'a')]
  assert.deepEqual(historialCompanias('b', polizas).map((e) => e.compania), ['Mapfre', 'Reale', 'Allianz'])
})

test('sin cambio de compañía no hay historial', () => {
  assert.deepEqual(historialCompanias('a', [p('a', 'Mapfre', '2020-01-01')]), [])
})

test('un eslabón que el lector no ve corta la cadena: ni se salta ni se inventa', () => {
  // `b` no está en la lista del lector: `c` apunta a algo que no ve.
  assert.deepEqual(historialCompanias('c', [p('a', 'Mapfre', '2019-01-01'), p('c', 'Allianz', '2027-01-01', 'b')]), [])
})

test('inicio desconocido: `hasta` queda null, no se rellena con otra fecha', () => {
  const h = historialCompanias('b', [p('a', 'Mapfre', '2020-01-01'), p('b', 'Reale', null, 'a')])
  assert.equal(h[0].hasta, null)
})

test('un ciclo en los datos no cuelga la página', () => {
  const h = historialCompanias('a', [p('a', 'Mapfre', '2020-01-01', 'b'), p('b', 'Reale', '2021-01-01', 'a')])
  assert.ok(h.length <= 2)
})
