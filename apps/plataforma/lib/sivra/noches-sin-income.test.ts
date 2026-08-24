import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarNoche, reservaDesdeSmoobu, agruparRangos, ventanaConsulta,
  type ReservaVentana,
} from './noches-sin-income.ts'

// Payload REAL (reducido) de la reserva que fundó este módulo: Airbnb HM9KR9FJFK sobre
// Busto Reform, 15→18 abr 2027, que el sync incremental se saltó y bloqueó el calendario
// «sin income» durante tres ciclos del agente de pricing (resuelto 24/08/2026).
const AIRBNB_FERIA = {
  id: 144202951,
  type: 'reservation',
  arrival: '2027-04-15',
  departure: '2027-04-18',
  'guest-name': 'Esther Herreria',
  'is-blocked-booking': false,
  apartment: { id: 352418, name: 'Busto Reform' },
}

const r = (parte: Partial<ReservaVentana>): ReservaVentana => ({
  id: '1', arrival: null, departure: null, cancelada: false, bloqueada: false,
  guestName: null, apartmentName: null, ...parte,
})

test('reservaDesdeSmoobu lee el payload real (kebab-case incluido)', () => {
  const v = reservaDesdeSmoobu(AIRBNB_FERIA)
  assert.equal(v.id, '144202951')
  assert.equal(v.arrival, '2027-04-15')
  assert.equal(v.departure, '2027-04-18')
  assert.equal(v.cancelada, false)
  assert.equal(v.bloqueada, false)
  assert.equal(v.guestName, 'Esther Herreria')
  assert.equal(v.apartmentName, 'Busto Reform')
})

test('la reserva viva que el sync se saltó se clasifica como reserva_sin_income (caso Feria)', () => {
  const reservas = [reservaDesdeSmoobu(AIRBNB_FERIA)]
  for (const fecha of ['2027-04-15', '2027-04-16', '2027-04-17']) {
    const c = clasificarNoche(fecha, reservas)
    assert.equal(c.tipo, 'reserva_sin_income', fecha)
    assert.equal(c.reserva?.id, '144202951')
  }
  // La noche de SALIDA no está ocupada por esta reserva (departure es exclusivo).
  assert.equal(clasificarNoche('2027-04-18', reservas).tipo, 'sin_explicar')
})

test('un bloqueo manual del dueño NO es un fallo: bloqueo_manual, sin income a propósito', () => {
  const c = clasificarNoche('2026-09-20', [
    r({ id: 'b1', arrival: '2026-09-19', departure: '2026-09-21', bloqueada: true }),
  ])
  assert.equal(c.tipo, 'bloqueo_manual')
})

test('si solo la cubre una cancelación, es calendario sin refrescar (se cura solo)', () => {
  const c = clasificarNoche('2027-04-16', [
    r({ id: 'c1', arrival: '2027-04-15', departure: '2027-04-18', cancelada: true }),
  ])
  assert.equal(c.tipo, 'cancelada')
})

test('la reserva viva manda sobre el bloqueo y sobre la cancelada (prioridad por coste de ignorarla)', () => {
  const reservas = [
    r({ id: 'c1', arrival: '2027-04-15', departure: '2027-04-18', cancelada: true }),
    r({ id: 'b1', arrival: '2027-04-15', departure: '2027-04-18', bloqueada: true }),
    r({ id: 'v1', arrival: '2027-04-16', departure: '2027-04-17' }),
  ]
  assert.equal(clasificarNoche('2027-04-16', reservas).reserva?.id, 'v1')
  // Donde la viva no llega, gana el bloqueo sobre la cancelada.
  assert.equal(clasificarNoche('2027-04-15', reservas).tipo, 'bloqueo_manual')
})

test('sin nada que la cubra → sin_explicar, nunca un tipo tranquilizador', () => {
  assert.equal(clasificarNoche('2027-04-16', []).tipo, 'sin_explicar')
  // Una reserva sin fechas legibles no cubre nada.
  assert.equal(clasificarNoche('2027-04-16', [r({ id: 'x' })]).tipo, 'sin_explicar')
})

test('agruparRangos junta consecutivas y separa huecos (y deduplica)', () => {
  assert.deepEqual(
    agruparRangos(['2027-04-17', '2027-04-15', '2027-04-16', '2027-04-16', '2027-03-22']),
    [
      { desde: '2027-03-22', hasta: '2027-03-22' },
      { desde: '2027-04-15', hasta: '2027-04-17' },
    ],
  )
  assert.deepEqual(agruparRangos([]), [])
})

test('agruparRangos cruza el fin de mes sin partir el rango', () => {
  assert.deepEqual(agruparRangos(['2026-08-31', '2026-09-01']), [{ desde: '2026-08-31', hasta: '2026-09-01' }])
})

test('ventanaConsulta abre 35 días atrás (estancias largas) y un día después de la última noche', () => {
  const v = ventanaConsulta(['2027-04-15', '2027-04-17'])
  assert.deepEqual(v, { desde: '2027-03-11', hasta: '2027-04-18' })
  assert.equal(ventanaConsulta([]), null)
})
