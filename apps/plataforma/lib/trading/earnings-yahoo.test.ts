import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCalendarEvents } from './earnings-yahoo.ts'

// Fixture REAL: respuesta de quoteSummary/calendarEvents para STX el 05/08/2026 (recortada a lo usado).
const fixtureStx = {
  quoteSummary: {
    result: [{
      calendarEvents: {
        maxAge: 1,
        earnings: {
          earningsDate: [{ raw: 1793131200, fmt: '2026-10-27' }],
          earningsCallDate: [{ raw: 1785272400, fmt: '2026-07-28' }],
          isEarningsDateEstimate: false,
        },
        exDividendDate: { raw: 1790208000, fmt: '2026-09-24' },
      },
    }],
    error: null,
  },
}

test('respuesta real de STX → fecha exacta confirmada', () => {
  assert.deepEqual(parseCalendarEvents(fixtureStx, '2026-08-05'), { fecha: '2026-10-27', confirmada: true })
})

test('rango estimado (2 fechas, isEarningsDateEstimate=true) → primera fecha, NO confirmada', () => {
  const j = { quoteSummary: { result: [{ calendarEvents: { earnings: {
    earningsDate: [{ fmt: '2026-10-26' }, { fmt: '2026-10-30' }], isEarningsDateEstimate: true,
  } } }] } }
  assert.deepEqual(parseCalendarEvents(j, '2026-08-05'), { fecha: '2026-10-26', confirmada: false })
})

test('flag ausente → NO se afirma confirmada (el «no lo sé» no se disfraza de dato)', () => {
  const j = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ fmt: '2026-10-27' }] } } }] } }
  assert.deepEqual(parseCalendarEvents(j, '2026-08-05'), { fecha: '2026-10-27', confirmada: false })
})

test('fecha ya pasada (Yahoo sin refrescar tras el informe) → null, no un "próximo" falso', () => {
  assert.equal(parseCalendarEvents(fixtureStx, '2026-11-01'), null)
})

test('respuestas rotas/vacías → null sin lanzar', () => {
  assert.equal(parseCalendarEvents(null, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({}, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({ quoteSummary: { result: [] } }, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({ quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ fmt: 'pronto' }] } } }] } }, '2026-08-05'), null)
})
