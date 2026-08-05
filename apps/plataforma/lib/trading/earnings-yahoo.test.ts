import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCalendarEvents, parseQuoteSummary, lineaEarningsProximos } from './earnings-yahoo.ts'

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

// Fixture REAL: fundamentales de STX en quoteSummary el 05/08/2026 (valores raw de la respuesta).
const fixtureFundamentales = {
  quoteSummary: {
    result: [{
      ...fixtureStx.quoteSummary.result[0],
      summaryDetail: { trailingPE: { raw: 60.43723, fmt: '60.44' } },
      defaultKeyStatistics: { priceToBook: { raw: 171.65163, fmt: '171.65' } },
      financialData: {
        totalDebt: { raw: 3564999936, fmt: '3.56B' },
        ebitda: { raw: 4502000128, fmt: '4.5B' },
        profitMargins: { raw: 0.26108998, fmt: '26.11%' },
        financialCurrency: 'USD',
      },
    }],
    error: null,
  },
}

test('parseQuoteSummary con la respuesta real de STX → PER/PB/deuda-EBITDA/margen + calendario', () => {
  const d = parseQuoteSummary(fixtureFundamentales, '2026-08-05')!
  assert.deepEqual(d.earnings, { fecha: '2026-10-27', confirmada: true })
  assert.equal(d.per, 60.43723)
  assert.equal(d.pb, 171.65163)
  assert.ok(Math.abs(d.deudaEbitda! - 3564999936 / 4502000128) < 1e-9)
  assert.equal(d.margenNeto, 0.26108998)
})

test('parseQuoteSummary: EBITDA ausente o ≤0 deja deudaEbitda undefined (jamás 0 ni Infinity)', () => {
  const sinEbitda = { quoteSummary: { result: [{ financialData: { totalDebt: { raw: 100 } } }] } }
  assert.equal(parseQuoteSummary(sinEbitda, '2026-08-05')!.deudaEbitda, undefined)
  const ebitdaNegativo = { quoteSummary: { result: [{ financialData: { totalDebt: { raw: 100 }, ebitda: { raw: -5 } } }] } }
  assert.equal(parseQuoteSummary(ebitdaNegativo, '2026-08-05')!.deudaEbitda, undefined)
  assert.equal(parseQuoteSummary({}, '2026-08-05'), null)
})

test('lineaEarningsProximos: solo ≤2 días, con HOY/mañana y marca de sin confirmar', () => {
  const linea = lineaEarningsProximos([
    { simbolo: 'SNDK', earnings: { fecha: '2026-08-05', confirmada: true } },
    { simbolo: 'WDC', earnings: { fecha: '2026-08-06', confirmada: false } },
    { simbolo: 'STX', earnings: { fecha: '2026-10-27', confirmada: true } },   // lejano → fuera
    { simbolo: 'AAA', earnings: { fecha: '2026-08-01', confirmada: true } },   // pasado → fuera
    { simbolo: 'BBB', earnings: null },
  ], '2026-08-05')
  assert.equal(linea, '📅 Resultados en la watchlist: <b>SNDK</b> HOY · <b>WDC</b> mañana (sin confirmar) — ojo al gap.')
})

test('lineaEarningsProximos: sin nada en ventana → null (no manda mensaje vacío)', () => {
  assert.equal(lineaEarningsProximos([{ simbolo: 'STX', earnings: { fecha: '2026-10-27', confirmada: true } }], '2026-08-05'), null)
  assert.equal(lineaEarningsProximos([], '2026-08-05'), null)
})

test('respuestas rotas/vacías → null sin lanzar', () => {
  assert.equal(parseCalendarEvents(null, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({}, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({ quoteSummary: { result: [] } }, '2026-08-05'), null)
  assert.equal(parseCalendarEvents({ quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ fmt: 'pronto' }] } } }] } }, '2026-08-05'), null)
})
