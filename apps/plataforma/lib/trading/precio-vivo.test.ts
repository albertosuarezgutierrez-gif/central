import test from 'node:test'
import assert from 'node:assert/strict'
import { parseYahooVivo, precioVivoFiable, conPrecioVivo, urlYahooVivo, simboloYahoo, mercadoIbkr } from './precio-vivo.ts'
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

// Meta REAL de https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?interval=1d&range=1d
// capturada el 28/08/2026 (vía pg_net desde Supabase; el sandbox local no sale a Yahoo). Es el
// ETF núcleo de la cartera real de IBKR — el mismo día, `.../chart/VWCE` (ticker pelado) y
// `.../chart/VWCE-DE` devolvieron **404 «No data found, symbol may be delisted»**: por eso el
// botón «Actualizar» no refrescaba esta posición.
const YAHOO_VWCE_DE = {
  chart: {
    result: [{
      meta: {
        currency: 'EUR', symbol: 'VWCE.DE', exchangeName: 'GER', fullExchangeName: 'XETRA',
        instrumentType: 'ETF', firstTradeDate: 1564383600, regularMarketTime: 1787931373,
        hasPrePostMarketData: false, gmtoffset: 7200, timezone: 'CEST',
        exchangeTimezoneName: 'Europe/Berlin', regularMarketPrice: 168.54,
        fiftyTwoWeekHigh: 170.12, fiftyTwoWeekLow: 134.4, regularMarketDayHigh: 168.6,
        regularMarketDayLow: 167.48, regularMarketVolume: 137448,
        longName: 'Vanguard FTSE All-World UCITS ETF USD Accumulation',
        shortName: 'Vanguard FTSE All-World U.ETF R', chartPreviousClose: 167.14,
        priceHint: 2, dataGranularity: '1d', range: '1d',
      },
      timestamp: [1787931373],
      indicators: { quote: [{ high: [168.60000610351562], low: [167.47999572753906], volume: [137448], open: [167.66000366210938], close: [168.5399932861328] }] },
    }],
    error: null,
  },
}

// La posición REAL tal y como la deja la pasada nocturna en `trading_cartera_real` (28/08/2026).
const VWCE: PosicionRealIn = {
  simbolo: 'VWCE', descripcion: 'VWCE @IBIS2', cantidad: 188,
  precioMedio: 169.44468, precioActual: 167.539993, valorMercado: 31497.52,
  pnlNoRealizado: -358.08, pnlDiario: null, divisa: 'EUR',
}

test('mercadoIbkr saca el mercado de la descripción, y null cuando no lo hay (CVX)', () => {
  assert.equal(mercadoIbkr('VWCE @IBIS2'), 'IBIS2')
  assert.equal(mercadoIbkr('VANG FTSE AW USDA (VWCE @IBIS2)'), 'IBIS2')
  assert.equal(mercadoIbkr('CVX'), null)
  assert.equal(mercadoIbkr(null), null)
})

test('simboloYahoo cualifica el UCITS europeo por su mercado y deja en paz al resto', () => {
  assert.equal(simboloYahoo(VWCE), 'VWCE.DE')                                        // el 404 que rompía el botón
  assert.equal(simboloYahoo({ simbolo: 'CVX', descripcion: 'CVX', divisa: 'USD' }), 'CVX')
  assert.equal(simboloYahoo({ simbolo: 'VWCE', descripcion: 'VWCE @BVME.ETF', divisa: 'EUR' }), 'VWCE.MI')
  assert.equal(simboloYahoo({ simbolo: 'VWCE.DE', descripcion: 'VWCE @IBIS2', divisa: 'EUR' }), 'VWCE.DE') // ya cualificado
})

test('simboloYahoo: mercado desconocido o divisa que no cuadra → ticker tal cual, nunca un sufijo a ojo', () => {
  // Un sufijo puesto por intuición no falla en silencio: resuelve a OTRO papel (PR #1189).
  assert.equal(simboloYahoo({ simbolo: 'ABC', descripcion: 'ABC @NOEXISTE', divisa: 'EUR' }), 'ABC')
  assert.equal(simboloYahoo({ simbolo: 'ABC', descripcion: 'ABC @IBIS2', divisa: 'USD' }), 'ABC')
  assert.equal(simboloYahoo({ simbolo: 'abc', descripcion: null, divisa: null }), 'ABC')
})

test('urlYahooVivo conserva el punto de MERCADO (VWCE.DE) — con guion Yahoo da 404', () => {
  assert.equal(urlYahooVivo('VWCE.DE'), 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?interval=1d&range=1d')
  assert.equal(urlYahooVivo('vwce.mi'), 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.MI?interval=1d&range=1d')
})

test('el VWCE de la cartera real SÍ se re-valora con la respuesta real de Xetra (era el bug)', () => {
  const vivo = parseYahooVivo(YAHOO_VWCE_DE)
  assert.ok(vivo)
  assert.equal(vivo.precio, 168.54)
  assert.equal(vivo.divisa, 'EUR')
  const { posicion, esVivo } = conPrecioVivo(VWCE, vivo)
  assert.equal(esVivo, true)
  assert.equal(posicion.precioActual, 168.54)
  assert.ok(Math.abs((posicion.valorMercado ?? 0) - 31685.52) < 1e-6)
})
