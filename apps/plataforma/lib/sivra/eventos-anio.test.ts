import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aniosCitados, anioIncoherente } from './eventos-anio.ts'

test('el caso real: rate_date 2027 con evidencia «26 de septiembre de 2026» → incoherente', () => {
  assert.equal(
    anioIncoherente('2027-09-26', 'Diario de Sevilla — el concierto será el 26 de septiembre de 2026'),
    true,
  )
})

test('mismo año que la fecha → coherente', () => {
  assert.equal(anioIncoherente('2026-09-26', 'ABC — 26 de septiembre de 2026 en La Cartuja'), false)
  assert.equal(anioIncoherente('2026-09-26', 'entradas para el 2026-09-26'), false)
})

test('sin año en la evidencia → NO se bloquea por esto', () => {
  assert.equal(anioIncoherente('2027-09-26', 'ABC — el festival vuelve el 26 de septiembre'), false)
  assert.equal(anioIncoherente('2027-09-26', null), false)
  assert.equal(anioIncoherente('2027-09-26', ''), false)
})

test('cita varios años y uno es el de la fecha → coherente', () => {
  assert.equal(anioIncoherente('2026-05-10', 'tras el éxito de 2025, vuelve en mayo de 2026'), false)
})

test('temporada abreviada «2026/27» cubre 2027', () => {
  assert.deepEqual(aniosCitados('LaLiga 2026/27'), [2026, 2027])
  assert.equal(anioIncoherente('2027-03-14', 'calendario LaLiga 2026-27'), false)
  assert.equal(anioIncoherente('2028-03-14', 'calendario LaLiga 2026-27'), true)
})

test('aforos y cifras no se leen como años', () => {
  assert.deepEqual(aniosCitados('aforo de 20.300 personas, 2030000 visitas, 12.025 €, a 2,025 km'), [])
})

test('fecha ilegible → no opina', () => {
  assert.equal(anioIncoherente('26/09/2027', 'septiembre de 2026'), false)
  assert.equal(anioIncoherente(undefined, 'septiembre de 2026'), false)
})
