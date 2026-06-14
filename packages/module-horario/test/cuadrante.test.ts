import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararPrevistoReal } from '../src/cuadrante.ts'
import type { TurnoFichaje, TurnoPrevisto } from '../src/types.ts'

function real(p: Partial<TurnoFichaje> & { camarero_id: string | null; fecha: string; horas_totales: number }): TurnoFichaje {
  return {
    camarero_nombre: p.camarero_id ?? 'X',
    entrada_at: `${p.fecha}T09:00:00Z`,
    salida_at: `${p.fecha}T17:00:00Z`,
    tipo: 'normal',
    ...p,
  }
}
const prev = (camarero_id: string | null, fecha: string, hora_inicio: string, hora_fin: string): TurnoPrevisto =>
  ({ camarero_id, camarero_nombre: camarero_id ?? 'X', fecha, hora_inicio, hora_fin, tipo: 'normal' })

test('compararPrevistoReal: ok, exceso, defecto, no_show y sin_planificar', () => {
  const previstos: TurnoPrevisto[] = [
    prev('a', '2026-06-15', '09:00', '17:00'), // 8h prev
    prev('b', '2026-06-15', '09:00', '13:00'), // 4h prev
    prev('c', '2026-06-15', '09:00', '17:00'), // 8h prev, no ficha → no_show
  ]
  const reales: TurnoFichaje[] = [
    real({ camarero_id: 'a', fecha: '2026-06-15', horas_totales: 8 }),   // ok
    real({ camarero_id: 'b', fecha: '2026-06-15', horas_totales: 6 }),   // exceso (+2)
    real({ camarero_id: 'd', fecha: '2026-06-15', horas_totales: 5 }),   // sin_planificar
  ]
  const c = compararPrevistoReal(previstos, reales)
  const get = (id: string) => c.lineas.find(l => l.camarero_id === id)!
  assert.equal(get('a').estado, 'ok')
  assert.equal(get('b').estado, 'exceso')
  assert.equal(get('b').desviacion, 2)
  assert.equal(get('c').estado, 'no_show')
  assert.equal(get('c').horas_reales, 0)
  assert.equal(get('d').estado, 'sin_planificar')
  assert.equal(c.horas_previstas_total, 20) // 8+4+8
  assert.equal(c.horas_reales_total, 19)    // 8+6+5
})

test('compararPrevistoReal: defecto cuando ficha menos de lo previsto', () => {
  const c = compararPrevistoReal(
    [prev('a', '2026-06-16', '09:00', '17:00')], // 8h
    [real({ camarero_id: 'a', fecha: '2026-06-16', horas_totales: 5 })],
  )
  assert.equal(c.lineas[0].estado, 'defecto')
  assert.equal(c.lineas[0].desviacion, -3)
})

test('horasPrevisto: turno que cruza medianoche', () => {
  const c = compararPrevistoReal(
    [prev('a', '2026-06-16', '22:00', '02:00')], // 4h (cruza medianoche)
    [],
  )
  assert.equal(c.lineas[0].horas_previstas, 4)
  assert.equal(c.lineas[0].estado, 'no_show')
})
