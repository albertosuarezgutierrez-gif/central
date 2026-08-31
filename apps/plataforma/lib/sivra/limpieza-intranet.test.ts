import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paxDe, entradaMismoDia, nocheOcupada, mezclarNovedades, type Novedad } from './limpieza-intranet.ts'

test('paxDe: NULL+NULL = «no se sabe» (null), nunca 0', () => {
  assert.equal(paxDe(null, null), null)
  assert.equal(paxDe(undefined, undefined), null)
})

test('paxDe: suma cuando hay dato; el que falta cuenta como 0', () => {
  assert.equal(paxDe(2, 1), 3)
  assert.equal(paxDe(4, null), 4)
  assert.equal(paxDe(null, 2), 2)
  assert.equal(paxDe(0, 0), 0) // 0 explícito de la fuente SÍ es 0
})

const reservas = [
  { propertyId: 'prop_luxury_busto', checkIn: '2026-08-30', checkOut: '2026-09-03', pax: 4 },
  { propertyId: 'prop_house_sevillana', checkIn: '2026-08-27', checkOut: '2026-09-01', pax: null },
]

test('entradaMismoDia: detecta el checkin del día y arrastra su pax (incluido null)', () => {
  assert.deepEqual(entradaMismoDia(reservas, 'prop_luxury_busto', '2026-08-30'), { pax: 4 })
  assert.deepEqual(entradaMismoDia(reservas, 'prop_house_sevillana', '2026-08-27'), { pax: null })
  assert.equal(entradaMismoDia(reservas, 'prop_luxury_busto', '2026-08-31'), null)
  assert.equal(entradaMismoDia(reservas, 'prop_duplex_center', '2026-08-30'), null)
})

test('mezclarNovedades: ordena por detectada desc, mezcla tipos y respeta el tope', () => {
  const n = (tipo: Novedad['tipo'], detectada: string): Novedad =>
    ({ tipo, propertyId: 'prop_luxury_busto', checkIn: null, checkOut: null, pax: null, detectada })
  const out = mezclarNovedades(
    [n('nueva', '2026-08-27T10:00:00Z'), n('nueva', '2026-08-29T08:00:00Z')],
    [n('cancelada', '2026-08-28T12:00:00Z')],
  )
  assert.deepEqual(out.map(x => x.detectada), ['2026-08-29T08:00:00Z', '2026-08-28T12:00:00Z', '2026-08-27T10:00:00Z'])
  assert.deepEqual(out.map(x => x.tipo), ['nueva', 'cancelada', 'nueva'])
  assert.equal(mezclarNovedades([n('nueva', '1'), n('nueva', '2')], [n('cancelada', '3')], 2).length, 2)
})

test('nocheOcupada: checkIn <= fecha < checkOut (la noche de salida ya no cuenta)', () => {
  assert.ok(nocheOcupada(reservas, 'prop_luxury_busto', '2026-08-30'))
  assert.ok(nocheOcupada(reservas, 'prop_luxury_busto', '2026-09-02'))
  assert.equal(nocheOcupada(reservas, 'prop_luxury_busto', '2026-09-03'), null)
  assert.equal(nocheOcupada(reservas, 'prop_luxury_busto', '2026-08-29'), null)
})
