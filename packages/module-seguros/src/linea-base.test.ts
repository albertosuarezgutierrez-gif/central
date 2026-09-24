import { test } from 'node:test'
import assert from 'node:assert/strict'
import { celdasSerie, lunesMadrid, proporcionAutomatica, semanasLineaBase, SERIES_LINEA_BASE } from './linea-base.ts'

test('el lunes es el de Madrid: el domingo a las 23:30 de Madrid sigue en su semana', () => {
  // Domingo 27/09/2026 23:30 Madrid = 21:30 UTC.
  assert.equal(lunesMadrid(new Date('2026-09-27T21:30:00Z')), '2026-09-21')
  // Lunes 28/09 00:30 Madrid = domingo 22:30 UTC: ya es la semana nueva.
  assert.equal(lunesMadrid(new Date('2026-09-27T22:30:00Z')), '2026-09-28')
})

test('las semanas acaban en la en curso y van de la más antigua a la más reciente', () => {
  const s = semanasLineaBase(new Date('2026-09-24T10:00:00Z'), 3)
  assert.deepEqual(s, ['2026-09-07', '2026-09-14', '2026-09-21'])
})

test('🪤 una semana de antes de medirse es null, no 0; una medida sin filas es 0', () => {
  const ahora = new Date('2026-10-07T10:00:00Z')
  const semanas = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
  const c = celdasSerie({ '2026-09-21': 4 }, semanas, '2026-09-23', ahora)
  assert.deepEqual(c, [
    { n: null, parcial: false },
    { n: 4, parcial: true }, // la del arranque
    { n: 0, parcial: false },
    { n: 0, parcial: true }, // la en curso
  ])
})

test('🪤 si la serie no se ha podido leer, todas sus semanas son null', () => {
  const c = celdasSerie(null, ['2026-09-28'], '2026-09-01', new Date('2026-10-10T10:00:00Z'))
  assert.deepEqual(c, [{ n: null, parcial: false }])
})

test('🪤 sin cambios esa semana la proporción es null, no 0 %', () => {
  assert.equal(proporcionAutomatica({ n: 0, parcial: false }, { n: 0, parcial: false }), null)
  assert.equal(proporcionAutomatica({ n: null, parcial: false }, { n: 3, parcial: false }), null)
  assert.equal(proporcionAutomatica({ n: 3, parcial: false }, { n: 1, parcial: false }), 0.75)
})

test('cada serie tiene fecha de arranque válida y un id único', () => {
  const ids = new Set(SERIES_LINEA_BASE.map((s) => s.id))
  assert.equal(ids.size, SERIES_LINEA_BASE.length)
  for (const s of SERIES_LINEA_BASE) assert.match(s.desde, /^\d{4}-\d{2}-\d{2}$/)
})
