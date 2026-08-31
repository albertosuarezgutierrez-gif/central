import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pesoLavanderia } from './lavanderia-peso.ts'

test('con aforo completo: pesa la suma de huéspedes reales, no la capacidad', () => {
  // 3 reservas de 2+4+3 personas en un piso de capacidad 12 → 9, no 36
  assert.equal(pesoLavanderia(9, 0, 12), 9)
})

test('reservas sin aforo caen a capacidad (regla anterior), nunca a 0', () => {
  assert.equal(pesoLavanderia(null, 3, 12), 36)   // ninguna con aforo → capacidad × reservas
  assert.equal(pesoLavanderia(6, 1, 12), 18)      // mixto: 6 reales + 1 reserva a capacidad
})

test('capacidad desconocida: la parte sin aforo no aporta (no se inventa)', () => {
  assert.equal(pesoLavanderia(5, 2, null), 5)
})

test('mes sin reservas: peso 0 (el caller reparte a partes iguales)', () => {
  assert.equal(pesoLavanderia(null, 0, 12), 0)
})
