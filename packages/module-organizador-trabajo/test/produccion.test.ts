import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimarMinutosProduccion, personasNecesarias } from '../src/produccion.ts'

test('estima minutos: cantidad × minutos por unidad, sumando líneas', () => {
  const min = estimarMinutosProduccion([
    { cantidad: 100, minutos_por_unidad: 0.5 }, // 100 croquetas a 0,5 min = 50
    { cantidad: 20, minutos_por_unidad: 3 },    // 20 montajes a 3 min = 60
  ])
  assert.equal(min, 110)
})

test('estima 0 con lista vacía', () => {
  assert.equal(estimarMinutosProduccion([]), 0)
})

test('personas necesarias: redondea hacia arriba (no caben medias personas)', () => {
  // 110 min de trabajo, jornada de 60 min → 2 personas
  assert.equal(personasNecesarias(110, 60), 2)
})

test('personas necesarias: cero trabajo → cero personas', () => {
  assert.equal(personasNecesarias(0, 60), 0)
})

test('personas necesarias: justo un múltiplo no añade persona de más', () => {
  assert.equal(personasNecesarias(120, 60), 2)
})

test('jornada inválida (<=0) → 0 para no dividir por cero', () => {
  assert.equal(personasNecesarias(100, 0), 0)
})
