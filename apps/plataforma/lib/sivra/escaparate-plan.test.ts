import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  planEscaparate, recorrido,
  type CandidataEscaparate, type PisoEscaparate,
} from './escaparate-plan.ts'

const HOY = '2026-08-19'

// Fechas reales del calendario de House con su base de Smoobu del 19/08/2026.
const CANDIDATAS: CandidataEscaparate[] = [
  { checkin: '2026-09-08', noches: 2, baseTotal: 860 },
  { checkin: '2026-09-08', noches: 3, baseTotal: 1429 },
  { checkin: '2026-11-10', noches: 2, baseTotal: 804 },
  { checkin: '2026-12-26', noches: 2, baseTotal: 2787 },
  { checkin: '2026-12-26', noches: 3, baseTotal: 4222 },
]

const piso = (
  medidas: PisoEscaparate['medidas'] = [],
  candidatas: CandidataEscaparate[] = CANDIDATAS,
): PisoEscaparate =>
  ({ propertyId: 'prop_house_sevillana', aforo: 12, nombrePortal: 'HOUSE SEVILLANA 6 habitaciones', medidas, candidatas })

test('un piso sin ninguna medición es lo PRIMERO que se pide', () => {
  const { peticiones } = planEscaparate([piso()], HOY)
  assert.ok(peticiones.length > 0)
  assert.equal(peticiones[0].motivo, 'sin_ninguna')
  assert.equal(peticiones[0].guests, 12)
  assert.equal(peticiones[0].nombre_portal, 'HOUSE SEVILLANA 6 habitaciones')
})

test('🚨 se eligen ventanas con RECORRIDO de precio, no tres findes parecidos', () => {
  // Es la diferencia entre poder ajustar y no poder: sin recorrido, `ajusteCanal` responde
  // `indeterminado` y el motor sigue con los parámetros viejos.
  const { peticiones } = planEscaparate([piso()], HOY, { porPiso: 2 })
  const bases = peticiones.map(p => p.base_total)
  assert.equal(bases.length, 2)
  assert.ok(recorrido(bases) >= 0.25, `recorrido pobre: ${recorrido(bases)} sobre ${bases}`)
})

test('el checkout se calcula de las noches (el conector pide las dos fechas)', () => {
  const { peticiones } = planEscaparate([piso([], [CANDIDATAS[0]])], HOY, { porPiso: 1 })
  assert.equal(peticiones[0].checkin, '2026-09-08')
  assert.equal(peticiones[0].noches, 2)
  assert.equal(peticiones[0].checkout, '2026-09-10')
})

test('con el ajuste ya cubierto solo se pide UNA ventana de refresco', () => {
  const medidas = [
    { checkin: '2026-09-08', noches: 2, guests: 12, baseTotal: 860, medidoEl: '2026-08-01' },
    { checkin: '2026-09-08', noches: 3, guests: 12, baseTotal: 1429, medidoEl: '2026-08-01' },
    { checkin: '2026-12-26', noches: 2, guests: 12, baseTotal: 2787, medidoEl: '2026-08-01' },
  ]
  const { peticiones } = planEscaparate([piso(medidas)], HOY, { porPiso: 3 })
  assert.equal(peticiones.length, 1)
  assert.equal(peticiones[0].motivo, 'refresco')
})

test('tres ventanas al mismo precio NO cuentan como cubierto: falta recorrido', () => {
  const medidas = [
    { checkin: '2026-09-08', noches: 2, guests: 12, baseTotal: 860, medidoEl: '2026-08-15' },
    { checkin: '2026-09-15', noches: 2, guests: 12, baseTotal: 870, medidoEl: '2026-08-15' },
    { checkin: '2026-09-22', noches: 2, guests: 12, baseTotal: 855, medidoEl: '2026-08-15' },
  ]
  const { peticiones } = planEscaparate([piso(medidas)], HOY)
  assert.ok(peticiones.every(p => p.motivo === 'falta_recorrido'))
  // Y entre lo que pide está la fecha CARA, que es la única que rompe el empate: con lo medido
  // (860/870/855) más lo pedido, el conjunto ya tiene recorrido suficiente para ajustar.
  assert.ok(peticiones.some(p => p.checkin === '2026-12-26'), peticiones.map(p => p.checkin).join())
  const bases = [860, 870, 855, ...peticiones.map(p => p.base_total)]
  assert.ok(recorrido(bases) >= 0.25, `recorrido ${recorrido(bases)}`)
})

test('las mediciones caducadas no cuentan (el portal cambia de tarifa)', () => {
  const viejas = [
    { checkin: '2026-09-08', noches: 2, guests: 12, baseTotal: 860, medidoEl: '2026-05-01' },
    { checkin: '2026-09-08', noches: 3, guests: 12, baseTotal: 1429, medidoEl: '2026-05-01' },
    { checkin: '2026-12-26', noches: 2, guests: 12, baseTotal: 2787, medidoEl: '2026-05-01' },
  ]
  const { peticiones } = planEscaparate([piso(viejas)], HOY)
  assert.equal(peticiones[0].motivo, 'sin_ninguna')
})

test('las mediciones de OTRO aforo no cuentan: medirían el recargo por persona', () => {
  const otroAforo = [
    { checkin: '2026-09-08', noches: 2, guests: 6, baseTotal: 860, medidoEl: '2026-08-18' },
    { checkin: '2026-09-08', noches: 3, guests: 6, baseTotal: 1429, medidoEl: '2026-08-18' },
    { checkin: '2026-12-26', noches: 2, guests: 6, baseTotal: 2787, medidoEl: '2026-08-18' },
  ]
  const { peticiones } = planEscaparate([piso(otroAforo)], HOY)
  assert.equal(peticiones[0].motivo, 'sin_ninguna')
})

test('no se repite lo medido hace nada: gastaría una consulta en algo ya sabido', () => {
  const recien = [{ checkin: '2026-12-26', noches: 2, guests: 12, baseTotal: 2787, medidoEl: '2026-08-18' }]
  const { peticiones } = planEscaparate([piso(recien)], HOY, { porPiso: 4 })
  assert.ok(!peticiones.some(p => p.checkin === '2026-12-26' && p.noches === 2))
})

test('🕳️ un piso sin nombre de portal se DECLARA, no desaparece', () => {
  const anonimo: PisoEscaparate = { propertyId: 'prop_nuevo', aforo: 4, nombrePortal: null, medidas: [], candidatas: CANDIDATAS }
  const { peticiones, huecos } = planEscaparate([anonimo], HOY)
  assert.equal(peticiones.length, 0)
  assert.equal(huecos.length, 1)
  assert.match(huecos[0].motivo, /nombre de portal/)
})

test('🕳️ sin snapshots de base no se pide nada, y se dice por qué', () => {
  const sinBase = CANDIDATAS.map(c => ({ ...c, baseTotal: null }))
  const { peticiones, huecos } = planEscaparate([piso([], sinBase)], HOY)
  assert.equal(peticiones.length, 0)
  assert.match(huecos[0].motivo, /base conocida/)
})

test('una fecha pasada nunca se pide (el portal no la vende)', () => {
  const { peticiones } = planEscaparate([piso([], [{ checkin: '2026-01-01', noches: 2, baseTotal: 900 }])], HOY)
  assert.equal(peticiones.length, 0)
})

test('los pisos que no pueden ajustar van ANTES que los que solo refrescan', () => {
  const cubierto: PisoEscaparate = {
    propertyId: 'prop_busto_reform', aforo: 2, nombrePortal: 'Busto Reform',
    medidas: [
      { checkin: '2026-09-08', noches: 2, guests: 2, baseTotal: 227, medidoEl: '2026-08-01' },
      { checkin: '2026-09-08', noches: 4, guests: 2, baseTotal: 572, medidoEl: '2026-08-01' },
      { checkin: '2026-10-06', noches: 2, guests: 2, baseTotal: 686, medidoEl: '2026-08-01' },
    ],
    candidatas: CANDIDATAS,
  }
  const { peticiones } = planEscaparate([cubierto, piso()], HOY)
  assert.equal(peticiones[0].property_id, 'prop_house_sevillana')
  assert.equal(peticiones.at(-1)!.property_id, 'prop_busto_reform')
})
