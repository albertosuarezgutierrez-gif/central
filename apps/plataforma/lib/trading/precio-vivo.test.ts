import test from 'node:test'
import assert from 'node:assert/strict'
import { parseYahooVivo, precioVivoFiable, conPrecioVivo, urlYahooVivo } from './precio-vivo.ts'
import type { PosicionRealIn } from './cartera-real.ts'

// Respuesta REAL de https://query1.finance.yahoo.com/v8/finance/chart/ORCL?interval=1d&range=1d
// capturada el 23/08/2026 (vía pg_net desde Supabase; el sandbox local bloquea la salida). Regla
// del repo: el fixture de un parser de fuente externa se copia de un documento real, no se
// redacta de memoria. Recortado a los campos que el parser toca + vecinos, valores literales.
const YAHOO_ORCL = {
  chart: {
    result: [{
      meta: {
        currency: 'USD', symbol: 'ORCL', exchangeName: 'NYQ', fullExchangeName: 'NYSE',
        instrumentType: 'EQUITY', firstTradeDate: 511021800, regularMarketTime: 1787342665,
        hasPrePostMarketData: true, gmtoffset: -14400, timezone: 'EDT',
        exchangeTimezoneName: 'America/New_York', regularMarketPrice: 146.47,
        fiftyTwoWeekHigh: 345.72, fiftyTwoWeekLow: 114.5, regularMarketDayHigh: 148.325,
        regularMarketDayLow: 142.6, regularMarketVolume: 16685495,
        longName: 'Oracle Corporation', shortName: 'Oracle Corporation',
        chartPreviousClose: 142.07, priceHint: 2, dataGranularity: '1d', range: '1d',
      },
      timestamp: [1787319000],
      indicators: { quote: [{ low: [142.60000610351562], open: [143.72000122070312], volume: [19567800], high: [148.35000610351562], close: [146.47000122070312] }] },
    }],
    error: null,
  },
}

test('parseYahooVivo lee precio, divisa y hora de la meta real', () => {
  const v = parseYahooVivo(YAHOO_ORCL)
  assert.ok(v)
  assert.equal(v.precio, 146.47)
  assert.equal(v.divisa, 'USD')
  assert.equal(v.horaISO, new Date(1787342665 * 1000).toISOString())
})

test('parseYahooVivo: sin precio, precio no numérico o sin divisa → null, nunca 0', () => {
  assert.equal(parseYahooVivo({}), null)
  assert.equal(parseYahooVivo({ chart: { result: [{ meta: {} }] } }), null)
  assert.equal(parseYahooVivo({ chart: { result: [{ meta: { regularMarketPrice: 'n/a', currency: 'USD' } }] } }), null)
  assert.equal(parseYahooVivo({ chart: { result: [{ meta: { regularMarketPrice: 0, currency: 'USD' } }] } }), null)
  assert.equal(parseYahooVivo({ chart: { result: [{ meta: { regularMarketPrice: 146.47 } }] } }), null)
})

test('parseYahooVivo: sin regularMarketTime el precio vale pero la hora queda null (no una hora inventada)', () => {
  const v = parseYahooVivo({ chart: { result: [{ meta: { regularMarketPrice: 10, currency: 'EUR' } }] } })
  assert.ok(v)
  assert.equal(v.precio, 10)
  assert.equal(v.horaISO, null)
})

test('banda ×2: sin referencia NO se juzga (falso), y el caso CVX 590$ contra 193$ se rechaza', () => {
  assert.equal(precioVivoFiable(146.47, 142.07), true)        // ORCL real vs su cierre previo real
  assert.equal(precioVivoFiable(146.47, null), false)          // sin referencia → conservador
  assert.equal(precioVivoFiable(590.17, 193.18), false)        // el precio envenenado del PR #1315
  assert.equal(precioVivoFiable(96, 193.18), false)            // desplome a menos de la mitad, tampoco
  assert.equal(precioVivoFiable(0, 100), false)
  assert.equal(precioVivoFiable(NaN, 100), false)
})

const POS: PosicionRealIn = {
  simbolo: 'ORCL', descripcion: 'Oracle Corporation', cantidad: 10,
  precioMedio: 140, precioActual: 142.07, valorMercado: 1420.7,
  pnlNoRealizado: 20.7, pnlDiario: -1.2, divisa: 'USD',
}

test('conPrecioVivo re-valora la posición y recalcula valor y P&L con el precio vivo', () => {
  const { posicion, esVivo } = conPrecioVivo(POS, { precio: 146.47, divisa: 'USD', horaISO: null })
  assert.equal(esVivo, true)
  assert.equal(posicion.precioActual, 146.47)
  assert.ok(Math.abs((posicion.valorMercado ?? 0) - 1464.7) < 1e-9)
  assert.ok(Math.abs((posicion.pnlNoRealizado ?? 0) - 64.7) < 1e-9)
  assert.equal(posicion.pnlDiario, -1.2)   // el diario es de la sesión de IBKR: no se recalcula
})

test('conPrecioVivo: divisa distinta = OTRO instrumento → posición intacta (landmine unidades, PR #1189)', () => {
  const { posicion, esVivo } = conPrecioVivo(POS, { precio: 146.47, divisa: 'EUR', horaISO: null })
  assert.equal(esVivo, false)
  assert.equal(posicion.precioActual, 142.07)
})

test('conPrecioVivo: sin referencia de IBKR o fuera de la banda ×2 → posición intacta', () => {
  const sinRef = { ...POS, precioActual: null }
  assert.equal(conPrecioVivo(sinRef, { precio: 146.47, divisa: 'USD', horaISO: null }).esVivo, false)
  assert.equal(conPrecioVivo(POS, { precio: 590.17, divisa: 'USD', horaISO: null }).esVivo, false)
  assert.equal(conPrecioVivo(POS, null).esVivo, false)
})

test('conPrecioVivo: sin precio medio el P&L queda null (no 0) aunque el precio vivo valga', () => {
  const sinMedio = { ...POS, precioMedio: null, pnlNoRealizado: null }
  const { posicion, esVivo } = conPrecioVivo(sinMedio, { precio: 146.47, divisa: 'USD', horaISO: null })
  assert.equal(esVivo, true)
  assert.equal(posicion.pnlNoRealizado, null)
})

test('urlYahooVivo: mayúsculas y punto de clase a guion (BRK.B), rango de 1 día', () => {
  assert.equal(urlYahooVivo('brk.b'), 'https://query1.finance.yahoo.com/v8/finance/chart/BRK-B?interval=1d&range=1d')
})
