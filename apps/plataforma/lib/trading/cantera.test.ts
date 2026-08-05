import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatosCantera, simboloValido, type SnapshotTop } from './cantera.ts'

const snap = (fecha: string, ...top: string[]): SnapshotTop => ({ fecha, top })

test('propone solo lo sostenido las N últimas semanas y cuenta las semanas seguidas', () => {
  const snaps = [
    snap('2026-07-20', 'AAA', 'BBB', 'CCC'),
    snap('2026-07-27', 'AAA', 'BBB', 'DDD'),
    snap('2026-08-03', 'AAA', 'DDD', 'EEE'),
  ]
  const out = candidatosCantera(snaps, new Set(), new Set(), 2)
  // AAA: 3 semanas seguidas · DDD: 2 · EEE: solo 1 (fuera) · BBB no está en el último top (fuera)
  assert.deepEqual(out, [{ simbolo: 'AAA', semanas: 3 }, { simbolo: 'DDD', semanas: 2 }])
})

test('la racha se corta si faltó una semana intermedia', () => {
  const snaps = [
    snap('2026-07-20', 'AAA'),
    snap('2026-07-27', 'ZZZ'),
    snap('2026-08-03', 'AAA'),
  ]
  assert.deepEqual(candidatosCantera(snaps, new Set(), new Set(), 2), [])
})

test('excluye los ya en watchlist y los ya propuestos (un ❌ no se re-pregunta)', () => {
  const snaps = [snap('2026-07-27', 'AAA', 'BBB'), snap('2026-08-03', 'AAA', 'BBB')]
  assert.deepEqual(candidatosCantera(snaps, new Set(['AAA']), new Set(['BBB']), 2), [])
})

test('con menos snapshots que el mínimo no propone nada (mejor callar que proponer con 1 lunes)', () => {
  assert.deepEqual(candidatosCantera([snap('2026-08-03', 'AAA')], new Set(), new Set(), 2), [])
})

test('simboloValido acepta tickers y rechaza basura de callback', () => {
  assert.ok(simboloValido('STX'))
  assert.ok(simboloValido('BRK.B'))
  assert.ok(!simboloValido(''))
  assert.ok(!simboloValido('stx'))
  assert.ok(!simboloValido('X'.repeat(11)))
  assert.ok(!simboloValido('DROP TABLE'))
})
