import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirDuplicado, VENTANA_DUPLICADO_MIN, VENTANA_REUTILIZAR_MIN, type FilaPrevia } from './huella.ts'

const AHORA = new Date('2026-10-08T12:00:00Z')
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000)
const fila = (estado: FilaPrevia['estado'], min: number, intentoId = 'i1'): FilaPrevia => ({ estado, creadoAt: hace(min), intentoId })

test('ventanas: bloqueo 15 min, reutilización 24 h', () => {
  assert.equal(VENTANA_DUPLICADO_MIN, 15)
  assert.equal(VENTANA_REUTILIZAR_MIN, 24 * 60)
})

test('facturable con copia de hace 6 h y efecto vigente reutiliza', () => {
  const base = { previas: [fila('facturable', 6 * 60, 'f6')], copias: new Set(['f6']), ahora: AHORA, hoy: '2026-10-08' }
  assert.deepEqual(decidirDuplicado({ ...base, fechaEfecto: '2026-10-20' }), { accion: 'reutilizar', intentoId: 'f6' })
  assert.deepEqual(decidirDuplicado({ ...base, fechaEfecto: '2026-10-08' }), { accion: 'reutilizar', intentoId: 'f6' })
})

test('efecto pasado, desconocido o mal formado: se llama (no se sirve un precio caducado)', () => {
  const base = { previas: [fila('facturable', 6 * 60, 'f6')], copias: new Set(['f6']), ahora: AHORA, hoy: '2026-10-08' }
  assert.deepEqual(decidirDuplicado({ ...base, fechaEfecto: '2026-10-07' }), { accion: 'llamar' })
  assert.deepEqual(decidirDuplicado({ ...base, fechaEfecto: null }), { accion: 'llamar' })
  assert.deepEqual(decidirDuplicado({ ...base, fechaEfecto: 'mañana' }), { accion: 'llamar' })
})

test('pasadas 24 h, sin copia, descartada o forzar: se llama', () => {
  const ok = { ahora: AHORA, hoy: '2026-10-08', fechaEfecto: '2026-10-20' }
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('facturable', 25 * 60, 'f')], copias: new Set(['f']) }), { accion: 'llamar' })
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('facturable', 60, 'f')], copias: new Set() }), { accion: 'llamar' })
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('descartado', 60, 'f')], copias: new Set(['f']) }), { accion: 'llamar' })
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('facturable', 60, 'f')], copias: new Set(['f']), forzar: true }), { accion: 'llamar' })
})

test('reservada con copia (cobró y falló el cierre) se reutiliza pasados 15 min; dentro de 15 sigue bloqueando', () => {
  const ok = { ahora: AHORA, hoy: '2026-10-08', fechaEfecto: '2026-10-20' }
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('reservado', 120, 'r')], copias: new Set(['r']) }), { accion: 'reutilizar', intentoId: 'r' })
  assert.deepEqual(decidirDuplicado({ ...ok, previas: [fila('reservado', 2, 'r')], copias: new Set(['r']) }), { accion: 'bloquear', intentoId: 'r', estado: 'reservado' })
})

test('huellaEmision: estable, distingue proyecto/precio/efecto y no lleva datos', async () => {
  const { huellaEmision } = await import('./huella.ts')
  const b = { operacion: 'rerate', correduriaId: 'c1', projectId: '123', precioId: 'p1', productId: 7, fechaEfecto: '2026-11-10' }
  const h = huellaEmision(b)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.equal(h, huellaEmision({ ...b }))
  assert.notEqual(h, huellaEmision({ ...b, projectId: '124' }))
  assert.notEqual(h, huellaEmision({ ...b, precioId: 'p2' }))
  assert.notEqual(h, huellaEmision({ ...b, fechaEfecto: '2026-11-11' }))
  assert.notEqual(h, huellaEmision({ ...b, correduriaId: 'c2' }))
})
