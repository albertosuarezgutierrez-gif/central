import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaEfectoCaducada, hoyEnMadrid, reparoFechaCaducada, mensajeFechaCaducada, sumarDias, motivoFechaEfectoInvalida, fechaEfectoDeOferta } from './fecha-efecto.ts'

// El caso real (13/09/2026): proyecto 40685666 cotizado el 12/09 con efecto
// 12/09; al día siguiente, «The effective date cannot be before today.»
test('fechaEfectoCaducada: la fecha de ayer está caducada; la de hoy y la de mañana, no', () => {
  assert.equal(fechaEfectoCaducada('2026-09-12', '2026-09-13'), true)
  assert.equal(fechaEfectoCaducada('2026-09-13', '2026-09-13'), false)
  assert.equal(fechaEfectoCaducada('2026-09-14', '2026-09-13'), false)
})

test('fechaEfectoCaducada: sin fecha o con forma rara NO se afirma nada (false, que hable el vendor)', () => {
  assert.equal(fechaEfectoCaducada(null, '2026-09-13'), false)
  assert.equal(fechaEfectoCaducada(undefined, '2026-09-13'), false)
  assert.equal(fechaEfectoCaducada('', '2026-09-13'), false)
  assert.equal(fechaEfectoCaducada('12/09/2026', '2026-09-13'), false)
})

test('hoyEnMadrid: a las 23:30 UTC ya es el día siguiente en Madrid (el vendor decide en hora española)', () => {
  assert.equal(hoyEnMadrid(new Date('2026-09-12T23:30:00Z')), '2026-09-13')
  assert.equal(hoyEnMadrid(new Date('2026-09-12T21:30:00Z')), '2026-09-12')
  assert.match(hoyEnMadrid(), /^\d{4}-\d{2}-\d{2}$/)
})

test('reparoFechaCaducada/mensajeFechaCaducada: nombran las dos fechas, el proyecto y la salida (de cero), sin prometer un PATCH', () => {
  const r = reparoFechaCaducada('2026-09-12', '2026-09-13')
  assert.equal(r.campo, 'fechaEfecto')
  assert.match(r.motivo, /2026-09-12/)
  assert.match(r.motivo, /2026-09-13/)
  assert.match(r.motivo, /no se puede cambiar/)
  const m = mensajeFechaCaducada('2026-09-12', '40685666', '2026-09-13')
  assert.match(m, /40685666/)
  assert.match(m, /No se ha gastado nada/)
  assert.match(m, /pedir precio de cero/)
})

test('sumarDias: cruza mes y año sin horas de por medio', () => {
  assert.equal(sumarDias('2026-09-13', 90), '2026-12-12')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
})

test('motivoFechaEfectoInvalida: la regla entera — ayer no, hoy sí, +90 sí, +91 no, sin forma ISO no opina', () => {
  assert.match(motivoFechaEfectoInvalida('2026-09-12', '2026-09-13') ?? '', /anterior a hoy/)
  assert.equal(motivoFechaEfectoInvalida('2026-09-13', '2026-09-13'), null)
  assert.equal(motivoFechaEfectoInvalida('2026-12-12', '2026-09-13'), null)
  assert.match(motivoFechaEfectoInvalida('2026-12-13', '2026-09-13') ?? '', /90 días/)
  assert.equal(motivoFechaEfectoInvalida('13/09/2026', '2026-09-13'), null)
})

test('fechaEfectoDeOferta: encuentra la fecha de la oferta aceptada, anidada', () => {
  const crudo = {
    id: 40842815,
    effectiveDate: '2026-09-12',
    quotes: [
      { id: 'q-1', effectiveDate: '2026-09-12' },
      { id: 'q-2', offers: [{ id: 'of-9', effectiveDate: '2026-09-29T00:00:00' }] },
    ],
  }
  assert.equal(fechaEfectoDeOferta(crudo, 'of-9'), '2026-09-29')
})

test('fechaEfectoDeOferta: sin oferta, sin id o sin fecha → null (cae a la del proyecto)', () => {
  assert.equal(fechaEfectoDeOferta({ quotes: [{ id: 'x' }] }, 'x'), null)
  assert.equal(fechaEfectoDeOferta({ quotes: [] }, 'y'), null)
  assert.equal(fechaEfectoDeOferta({ quotes: [{ id: 'y', effectiveDate: '2026-10-01' }] }, null), null)
})
