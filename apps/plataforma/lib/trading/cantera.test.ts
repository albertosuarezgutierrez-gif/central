import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatosCantera, bajasCantera, simboloValido, type SnapshotTop } from './cantera.ts'

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

test('bajasCantera: solo capa C ausente de TODOS los últimos N snapshots', () => {
  const snaps = [
    snap('2026-07-13', 'AAA', 'CCC'),
    snap('2026-07-20', 'AAA'),
    snap('2026-07-27', 'AAA'),
    snap('2026-08-03', 'AAA'),
  ]
  // CCC estuvo hace 4 semanas dentro de la ventana de 3 → no sale con semanasFuera=4 pero sí con 3
  assert.deepEqual(bajasCantera(snaps, new Set(['CCC', 'DDD']), new Set(), 3),
    [{ simbolo: 'CCC', semanas: 3 }, { simbolo: 'DDD', semanas: 3 }])
  assert.deepEqual(bajasCantera(snaps, new Set(['CCC']), new Set(), 4), [])
  // AAA sigue en el top → nunca se propone su baja
  assert.deepEqual(bajasCantera(snaps, new Set(['AAA']), new Set(), 3), [])
})

test('bajasCantera: sin historial suficiente o ya propuesta → nada', () => {
  const snaps = [snap('2026-08-03', 'AAA')]
  assert.deepEqual(bajasCantera(snaps, new Set(['DDD']), new Set(), 4), [])
  const snaps4 = ['1', '2', '3', '4'].map(d => snap(`2026-08-0${d}`, 'AAA'))
  assert.deepEqual(bajasCantera(snaps4, new Set(['DDD']), new Set(['DDD']), 4), [])
})

test('simboloValido acepta tickers y rechaza basura de callback', () => {
  assert.ok(simboloValido('STX'))
  assert.ok(simboloValido('BRK.B'))
  assert.ok(!simboloValido(''))
  assert.ok(!simboloValido('stx'))
  assert.ok(!simboloValido('X'.repeat(11)))
  assert.ok(!simboloValido('DROP TABLE'))
})
