import test from 'node:test'
import assert from 'node:assert/strict'
import { filaCancelacion, nochesPerdidas, diasDeAntelacion } from './cancelaciones.ts'

// Payload con la forma REAL de la API de Smoobu (kebab-case en `guest-name`/`created-at`,
// `price` como número, apartamento y canal anidados). Si Smoobu cambiara de forma, este fixture
// es lo primero que hay que rehacer contra una respuesta de verdad — no a mano: la lección del
// parser de extractos de Kutxabank (08/08/2026) fue justo esa, un fixture escrito con la misma
// suposición equivocada que el código deja la suite en verde sin probar nada.
const RESERVA = {
  id: 12345678,
  type: 'cancellation',
  arrival: '2026-09-04',
  departure: '2026-09-07',
  price: 480.5,
  channel: { name: 'Booking.com' },
  apartment: { name: 'House Sevillana' },
  'guest-name': 'Ana Pérez',
  'created-at': '2026-08-20 11:32:00',
}

test('noches perdidas = las que se iban a dormir', () => {
  assert.equal(nochesPerdidas('2026-09-04', '2026-09-07'), 3)
})

test('sin una de las dos fechas NO devuelve 0, devuelve null', () => {
  // Un 0 se sumaría en el agregado como «cancelación de cero noches»: eso es afirmar que no se
  // perdió ninguna. No sabemos cuántas se perdieron, y esas dos cosas no son la misma.
  assert.equal(nochesPerdidas(undefined, '2026-09-07'), null)
  assert.equal(nochesPerdidas('2026-09-04', undefined), null)
  assert.equal(nochesPerdidas(undefined, undefined), null)
})

test('una salida anterior a la entrada tampoco vale como 0', () => {
  assert.equal(nochesPerdidas('2026-09-07', '2026-09-04'), null)
})

test('la fila guarda el precio BRUTO tal cual lo manda Smoobu', () => {
  const f = filaCancelacion(RESERVA, { propertyId: 'prop_house_sevillana', portal: 'BOOKING', estabaEnIncomes: true })
  // 480,5 y NO 385,7 (= 480,5 × 0,8028). El neto lo calcula el trigger de `incomes` leyendo
  // `portal_rates`; aquí no hay trigger, así que descontar comisión dejaría un neto disfrazado
  // de bruto en una columna llamada `amount_gross`.
  assert.equal(f.amount_gross, 480.5)
})

test('la fila conserva piso, portal, huésped, fechas y noches', () => {
  const f = filaCancelacion(RESERVA, { propertyId: 'prop_house_sevillana', portal: 'BOOKING', estabaEnIncomes: true })
  assert.equal(f.reservation_id, '12345678')
  assert.equal(f.property_id, 'prop_house_sevillana')
  assert.equal(f.property_name, 'House Sevillana')
  assert.equal(f.portal, 'BOOKING')
  assert.equal(f.guest_name, 'Ana Pérez')
  assert.equal(f.nights, 3)
  assert.equal(f.estaba_en_incomes, true)
  assert.match(f.check_in!, /^2026-09-04/)
  assert.match(f.reserved_at!, /^2026-08-20/)
})

test('si el piso no casa con `properties`, se conserva el nombre en vez de perder la fila', () => {
  const f = filaCancelacion(
    { ...RESERVA, apartment: { name: 'Apartamento nuevo sin dar de alta' } },
    { propertyId: null, portal: 'AIRBNB', estabaEnIncomes: false },
  )
  assert.equal(f.property_id, null)
  assert.equal(f.property_name, 'Apartamento nuevo sin dar de alta')
  // Lo que importa: la cancelación NO se pierde por no saber a qué piso va.
  assert.equal(f.reservation_id, '12345678')
})

test('`estaba_en_incomes` distingue la que descontaba ingreso de la que nunca existió para nosotros', () => {
  const contada = filaCancelacion(RESERVA, { propertyId: 'p', portal: 'BOOKING', estabaEnIncomes: true })
  const fugaz = filaCancelacion(RESERVA, { propertyId: 'p', portal: 'BOOKING', estabaEnIncomes: false })
  assert.equal(contada.estaba_en_incomes, true)
  assert.equal(fugaz.estaba_en_incomes, false)
})

test('el precio puede venir como cadena (Smoobu no es consistente)', () => {
  const f = filaCancelacion({ ...RESERVA, price: '480.50' }, { propertyId: 'p', portal: 'BOOKING', estabaEnIncomes: true })
  assert.equal(f.amount_gross, 480.5)
})

test('sin precio NO se escribe 0', () => {
  const f = filaCancelacion({ ...RESERVA, price: undefined }, { propertyId: 'p', portal: 'BOOKING', estabaEnIncomes: true })
  assert.equal(f.amount_gross, null)
})

test('antelación = de cuándo se reservó a cuándo se entraba', () => {
  assert.equal(diasDeAntelacion('2026-08-20T11:32:00Z', '2026-09-04T00:00:00Z'), 15)
})

test('sin fecha de reserva la antelación es null, no 0', () => {
  // 0 significaría «reservó y canceló el mismo día de entrada», que es justo el patrón caro
  // que se quiere detectar. Confundirlo con «no lo sé» arruinaría la métrica entera.
  assert.equal(diasDeAntelacion(null, '2026-09-04T00:00:00Z'), null)
  assert.equal(diasDeAntelacion('2026-08-20T11:32:00Z', null), null)
})
