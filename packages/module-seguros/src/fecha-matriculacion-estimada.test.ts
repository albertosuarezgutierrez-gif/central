import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimarMesMatriculacion } from './fecha-matriculacion-estimada.ts'

// Todas las matrículas son INVENTADAS (serie elegida por su posición en la tabla
// de `matricula.ts`), ninguna sale de la cartera.

// ── estimables ───────────────────────────────────────────────────────────────

test('moderna: devuelve el PRIMER día del mes estimado y confianza serie_nacional', () => {
  // 2015: cierre de mayo = JFX, cierre de junio = JGR → JGB cae en junio de 2015.
  const r = estimarMesMatriculacion('0000-JGB')
  assert.deepEqual(r, { mesAnio: '2015-06-01', confianza: 'serie_nacional', motivo: 'serie_nacional' })
})

test('normaliza espacios, guiones y minúsculas', () => {
  const canonica = estimarMesMatriculacion('0000JGB')
  for (const v of ['0000 jgb', ' 0000-JGB ', '0000.jgb']) assert.deepEqual(estimarMesMatriculacion(v), canonica)
})

test('frontera de serie: la serie que cierra un mes y la siguiente caen en meses distintos', () => {
  // Cierre de mayo de 2015 = JFX: 9999JFW es aún mayo; 0000JFX ya es junio (hito «1 del mes siguiente»).
  assert.equal(estimarMesMatriculacion('9999JFW')?.mesAnio, '2015-05-01')
  assert.equal(estimarMesMatriculacion('0000JFX')?.mesAnio, '2015-06-01')
})

test('frontera de año: cierre de diciembre de 2019 = LDR', () => {
  assert.equal(estimarMesMatriculacion('9999LDP')?.mesAnio, '2019-12-01')
  assert.equal(estimarMesMatriculacion('0000LDR')?.mesAnio, '2020-01-01')
})

test('la primera de la serie (0000 BBB) es septiembre de 2000', () => {
  assert.equal(estimarMesMatriculacion('0000BBB')?.mesAnio, '2000-09-01')
})

// ── no estimables (no se adivina) ────────────────────────────────────────────

const casos: Array<[string, string]> = [
  ['', 'vacia'],
  ['   ', 'vacia'],
  ['SE-1234-AB', 'provincial'],
  ['M-123456', 'provincial'],
  ['C-0000-BBB', 'ciclomotor'],
  ['R-0000-BBB', 'remolque'],
  ['H-0000-BBB', 'historica'],
  ['P-0000-BBB', 'temporal'],
  ['S-0000-BBB', 'temporal'],
  ['V-0000-BBB', 'temporal'],
  ['E-0000-BBB', 'especial'],
  ['CD-1234', 'diplomatica'],
  ['OI-1234', 'diplomatica'],
  ['TA-1234', 'diplomatica'],
  ['0000-BAB', 'formato_no_reconocido'], // vocal: no existe en la serie
  ['0000-BQB', 'formato_no_reconocido'], // Q: excluida
  ['0000-BÑB', 'formato_no_reconocido'], // Ñ: excluida
  ['XYZ', 'formato_no_reconocido'],
]

for (const [entrada, motivo] of casos) {
  test(`no estimable: «${entrada}» → ${motivo}`, () => {
    assert.deepEqual(estimarMesMatriculacion(entrada), { mesAnio: null, confianza: 'no_estimable', motivo })
  })
}

test('serie posterior a la tabla y sin `hoy` → no estimable (no se extrapola a ciegas)', () => {
  assert.deepEqual(estimarMesMatriculacion('0000ZZZ'), {
    mesAnio: null,
    confianza: 'no_estimable',
    motivo: 'fuera_de_tabla',
  })
})

test('posterior a la tabla CON `hoy` inyectado: estima un mes no posterior a hoy; imposible → fuera_de_tabla', () => {
  // NRZ es la serie siguiente al último cierre de la tabla (ago-2026 = NRY).
  const r = estimarMesMatriculacion('0000NRZ', '2026-10-30')
  assert.equal(r.confianza, 'serie_nacional')
  assert.ok(r.mesAnio !== null && r.mesAnio >= '2026-08-01' && r.mesAnio <= '2026-10-01', String(r.mesAnio))
  assert.equal(estimarMesMatriculacion('0000ZZZ', '2026-10-30').motivo, 'fuera_de_tabla')
})

test('posterior a la tabla SIN `hoy` → fuera_de_tabla aunque sea plausible (backfill determinista)', () => {
  assert.equal(estimarMesMatriculacion('0000NRZ').motivo, 'fuera_de_tabla')
})

test('entrada no string no revienta', () => {
  assert.equal(estimarMesMatriculacion(null as unknown as string).confianza, 'no_estimable')
  assert.equal(estimarMesMatriculacion(undefined as unknown as string).motivo, 'vacia')
})
