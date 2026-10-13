import test from 'node:test'
import assert from 'node:assert/strict'
import { atajosAparcar, bloqueDe, cuandoRelativo, fechaCorta, masDias, repartirMesa, BLOQUES_MESA } from './mesa.ts'
import type { Expediente } from './expedientes.ts'

const HOY = '2026-10-13'
const exp = (o: Partial<Expediente> = {}): Expediente => ({
  id: 'e1', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', clase: 'venta_nueva', estadoVisible: 'abierta', estado: 'en_negociacion',
  delVolcado: false, aparcadaHasta: null, aparcadaMotivo: null,
  proximaAccion: { tareaId: 't1', texto: 'Llamar', tipo: 'llamada', fecha: '2026-10-20' },
  prima: 100, fechaFinVigencia: null, notas: null, creada: '2026-10-01', rescate: null, ...o,
})
const con = (p: Partial<NonNullable<Expediente['proximaAccion']>> | null): Partial<Expediente> =>
  ({ proximaAccion: p === null ? null : { tareaId: 't', texto: '', tipo: 'llamada', fecha: '2026-10-20', ...p } })

test('bloques: hoy y vencido incluye hoy y fechas pasadas, no mañana', () => {
  assert.equal(bloqueDe(exp(con({ fecha: HOY })), HOY), 'hoy')
  assert.equal(bloqueDe(exp(con({ fecha: '2026-09-01' })), HOY), 'hoy')
  assert.equal(bloqueDe(exp(con({ fecha: '2026-10-14' })), HOY), 'abiertas')
})

test('bloques: sin fecha o sin próxima acción NO es hoy', () => {
  assert.equal(bloqueDe(exp(con({ fecha: null })), HOY), 'abiertas')
  assert.equal(bloqueDe(exp(con(null)), HOY), 'abiertas')
})

test('bloques: una aparcada nunca sale fuera de Aparcadas, aunque su acción esté vencida', () => {
  const e = exp({ estadoVisible: 'aparcada', aparcadaHasta: '2027-01-10', ...con({ fecha: '2026-09-01' }) })
  assert.equal(bloqueDe(e, HOY), 'aparcadas')
})

test('bloques: rescate y esperando cliente', () => {
  assert.equal(bloqueDe(exp({ clase: 'rescate' }), HOY), 'rescates')
  assert.equal(bloqueDe(exp({ estadoVisible: 'esperando_cliente' }), HOY), 'esperando')
  assert.equal(bloqueDe(exp({ clase: 'rescate', ...con({ fecha: HOY }) }), HOY), 'hoy')
})

test('repartir: cada expediente en UN solo bloque y no se pierde ninguno', () => {
  const lista = [
    exp({ id: 'a', ...con({ fecha: HOY }) }), exp({ id: 'b' }), exp({ id: 'c', estadoVisible: 'esperando_cliente' }),
    exp({ id: 'd', clase: 'rescate' }), exp({ id: 'e', estadoVisible: 'aparcada', aparcadaHasta: '2027-01-01' }),
    exp({ id: 'f', clase: 'rescate', estadoVisible: 'esperando_cliente' }),
  ]
  const r = repartirMesa(lista, HOY)
  const ids = BLOQUES_MESA.flatMap(b => r[b].map(x => x.id))
  assert.equal(ids.length, lista.length)
  assert.equal(new Set(ids).size, lista.length)
  assert.deepEqual(r.hoy.map(x => x.id), ['a'])
  assert.deepEqual(r.rescates.map(x => x.id).sort(), ['d', 'f'])
})

test('orden: fecha más antigua primero, sin fecha al final, prima mayor, prima null última', () => {
  const r = repartirMesa([
    exp({ id: 'x', ...con({ fecha: '2026-10-25' }), prima: 50 }),
    exp({ id: 'y', ...con({ fecha: null }), prima: 999 }),
    exp({ id: 'z', ...con({ fecha: '2026-10-25' }), prima: 300 }),
    exp({ id: 'n', ...con({ fecha: '2026-10-25' }), prima: null }),
    exp({ id: 'w', ...con({ fecha: '2026-10-15' }), prima: 1 }),
  ], HOY)
  assert.deepEqual(r.abiertas.map(x => x.id), ['w', 'z', 'x', 'n', 'y'])
})

test('aparcadas: la que vuelve antes primero', () => {
  const r = repartirMesa([
    exp({ id: 'l', estadoVisible: 'aparcada', aparcadaHasta: '2027-06-01' }),
    exp({ id: 'k', estadoVisible: 'aparcada', aparcadaHasta: '2026-12-01' }),
  ], HOY)
  assert.deepEqual(r.aparcadas.map(x => x.id), ['k', 'l'])
})

test('fechas: relativo, corta y atajos de aparcar', () => {
  assert.equal(cuandoRelativo(HOY, HOY), 'hoy')
  assert.equal(cuandoRelativo('2026-10-10', HOY), 'hace 3 d')
  assert.equal(cuandoRelativo('2026-10-14', HOY), 'mañana')
  assert.equal(cuandoRelativo(null, HOY), 'sin fecha')
  assert.equal(cuandoRelativo('2026-12-02T10:00:00Z', HOY), '2 dic')
  assert.equal(fechaCorta('2027-03-15', HOY), '15 mar 2027')
  assert.equal(masDias('2026-12-30', 3), '2027-01-02')
  const a = atajosAparcar('2026-08-31')
  assert.deepEqual(a.map(x => x.fecha), ['2026-11-30', '2027-02-28', '2027-08-31'])
  // Ningún atajo pasa el máximo del puerto (13 meses ≈ 395 d).
  for (const x of atajosAparcar('2028-02-29')) assert.ok(Date.parse(x.fecha) - Date.parse('2028-02-29') <= 395 * 86_400_000)
})
