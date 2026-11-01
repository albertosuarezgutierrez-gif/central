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

test('estadoLeidoEvento: la fila fantasma real (Love The 90s 2026 en 2027-09-26) se lee como descartada', async () => {
  const { estadoLeidoEvento } = await import('./eventos-anio.ts')
  assert.equal(estadoLeidoEvento({
    rate_date: '2027-09-26', estado: 'confirmado',
    nombre: "Love The 90's Sevilla 2026 (Estadio La Cartuja)",
    evidencia: "Estadio La Cartuja — 'LOVE THE 90'S FECHA: 26 de septiembre de 2026'",
  }), 'descartado')
  // Nombre con año equivocado y sin evidencia (Silvio Rodríguez «Tour España 2026» en 2027-02-13).
  assert.equal(estadoLeidoEvento({ rate_date: '2027-02-13', estado: 'confirmado', nombre: 'Silvio Rodríguez Tour España 2026 (FIBES)', evidencia: null }), 'descartado')
})

test('estadoLeidoEvento: no toca lo coherente, lo que no cita año ni lo ya descartado', async () => {
  const { estadoLeidoEvento } = await import('./eventos-anio.ts')
  assert.equal(estadoLeidoEvento({ rate_date: '2027-04-13', estado: 'confirmado', nombre: 'Feria de Abril 2027', evidencia: null }), 'confirmado')
  assert.equal(estadoLeidoEvento({ rate_date: '2026-11-07', estado: 'confirmado', nombre: 'Sevilla de Boda', evidencia: '7 y 8 de noviembre de 2026; novedades de 2027' }), 'confirmado')
  assert.equal(estadoLeidoEvento({ rate_date: '2027-03-21', estado: null, nombre: 'Semana Santa — Domingo de Ramos', evidencia: 'derivado de la Pascua' }), null)
  assert.equal(estadoLeidoEvento({ rate_date: '2027-06-07', estado: 'previsto', nombre: 'Semana SEMG', evidencia: 'del 7 al 11 de junio de 2027' }), 'previsto')
  assert.equal(estadoLeidoEvento({ rate_date: '2027-05-16', estado: 'descartado', nombre: 'Tattoo', evidencia: 'sep 2026' }), 'descartado')
})
