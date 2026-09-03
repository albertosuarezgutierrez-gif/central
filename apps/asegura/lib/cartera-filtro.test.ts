import test from 'node:test'
import assert from 'node:assert/strict'
import { rangoVentana, hoyUtc } from './cartera-filtro.ts'

// Las ventanas de vencimiento son la única lógica PURA de `cartera-filtro`, y
// es justo donde un error no falla: una ventana mal calculada devuelve una
// lista plausible de pólizas equivocadas. Se fija un «hoy» y se comprueban los
// bordes exactos.
const HOY = new Date('2026-09-03T22:41:00.000Z')

test('d30/d60/d90 van de hoy (inclusive) a hoy+N (inclusive)', () => {
  assert.deepEqual(rangoVentana('d30', HOY), { modo: 'entre', desde: '2026-09-03', hasta: '2026-10-03' })
  assert.deepEqual(rangoVentana('d60', HOY), { modo: 'entre', desde: '2026-09-03', hasta: '2026-11-02' })
  assert.deepEqual(rangoVentana('d90', HOY), { modo: 'entre', desde: '2026-09-03', hasta: '2026-12-02' })
})

test('anio es el año NATURAL en curso, no los próximos 365 días', () => {
  assert.deepEqual(rangoVentana('anio', HOY), { modo: 'entre', desde: '2026-01-01', hasta: '2026-12-31' })
})

test('vencidas es estrictamente ANTES de hoy: lo que vence hoy aún no ha vencido', () => {
  assert.deepEqual(rangoVentana('vencidas', HOY), { modo: 'vencidas', antesDe: '2026-09-03' })
})

test('sin_fecha es un modo propio, no un rango vacío', () => {
  // Si `sin_fecha` cayera a un rango, las pólizas cuya fecha la compañía no ha
  // informado desaparecerían del listado en vez de poder pedirse — que es
  // exactamente lo que las hace reclamables.
  assert.deepEqual(rangoVentana('sin_fecha', HOY), { modo: 'sin_fecha' })
})

test('el día se toma en UTC, no en la hora local del servidor', () => {
  // 22:41 UTC del día 3 sigue siendo el día 3 aunque el proceso corra en un huso
  // que ya esté en el 4: si el corte se moviera, dos pantallas de la misma
  // cartera darían listas distintas según dónde se despliegue.
  assert.equal(hoyUtc(HOY).toISOString(), '2026-09-03T00:00:00.000Z')
  assert.deepEqual(rangoVentana('d30', new Date('2026-12-31T23:59:59.000Z')), {
    modo: 'entre',
    desde: '2026-12-31',
    hasta: '2027-01-30',
  })
})
