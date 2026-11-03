import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarAndalucia, obtenerFestivosAndalucia } from './festivos-nager.ts'

const base = { name: 'x', types: ['Public'] }
const lista = [
  { ...base, date: '2026-01-01', localName: 'Año Nuevo', global: true, counties: null },
  { ...base, date: '2026-02-28', localName: 'Día de Andalucía', global: false, counties: ['ES-AN'] },
  { ...base, date: '2026-03-19', localName: 'San José', global: false, counties: ['ES-VC', 'ES-MC'] },
  { ...base, date: '2026-04-23', localName: 'San Jorge', global: false, counties: null },
]

test('filtrarAndalucia: global y ES-AN entran', () => {
  const r = filtrarAndalucia(lista)
  assert.deepEqual(r.map(x => x.fecha), ['2026-01-01', '2026-02-28'])
  assert.equal(r[1].nombre, 'Día de Andalucía')
})
test('filtrarAndalucia: otra comunidad excluida', () => {
  assert.ok(!filtrarAndalucia(lista).some(x => x.nombre === 'San José'))
})
test('filtrarAndalucia: counties null con global false excluido', () => {
  assert.ok(!filtrarAndalucia(lista).some(x => x.nombre === 'San Jorge'))
})
test('filtrarAndalucia: lista vacía -> []', () => {
  assert.deepEqual(filtrarAndalucia([]), [])
})
test('obtenerFestivosAndalucia: fallo de red -> null (no [])', async () => {
  const r = await obtenerFestivosAndalucia(2026, (async () => { throw new Error('red') }) as unknown as typeof fetch)
  assert.equal(r, null)
})
test('obtenerFestivosAndalucia: HTTP 500 -> null', async () => {
  const r = await obtenerFestivosAndalucia(2026, (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch)
  assert.equal(r, null)
})
test('obtenerFestivosAndalucia: JSON no-lista -> null', async () => {
  const r = await obtenerFestivosAndalucia(2026, (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch)
  assert.equal(r, null)
})
test('obtenerFestivosAndalucia: respuesta buena -> filtrada', async () => {
  const r = await obtenerFestivosAndalucia(2026, (async () => ({ ok: true, json: async () => lista })) as unknown as typeof fetch)
  assert.equal(r?.length, 2)
})

import { fechasADeduplicar } from './festivos-nager.ts'

test('fechasADeduplicar: solo fechas de Nager dentro del rango, únicas y ordenadas', () => {
  const nager = [
    { fecha: '2026-12-25', nombre: 'Navidad' }, { fecha: '2026-12-08', nombre: 'Inmaculada' },
    { fecha: '2026-12-08', nombre: 'Inmaculada (dup)' }, { fecha: '2027-12-25', nombre: 'fuera' },
  ]
  assert.deepEqual(fechasADeduplicar(nager, '2026-10-28', '2027-10-28'), ['2026-12-08', '2026-12-25'])
})
test('fechasADeduplicar: null o vacío -> [] (sin datos no se duplica nada)', () => {
  assert.deepEqual(fechasADeduplicar(null, '2026-01-01', '2026-12-31'), [])
  assert.deepEqual(fechasADeduplicar([], '2026-01-01', '2026-12-31'), [])
})
test('fechasADeduplicar: fecha local que Nager no tiene no aparece', () => {
  const r = fechasADeduplicar([{ fecha: '2026-12-08', nombre: 'x' }], '2026-01-01', '2026-12-31')
  assert.ok(!r.includes('2026-04-21'))
})
