import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapActividadDataroma, parseDataromaHoldings } from './dataroma.ts'

test('mapActividadDataroma traduce la columna de actividad', () => {
  assert.equal(mapActividadDataroma('Buy'), 'nueva')
  assert.equal(mapActividadDataroma('Add 5.2%'), 'amplia')
  assert.equal(mapActividadDataroma('Reduce 12%'), 'recorta')
  assert.equal(mapActividadDataroma('Sell'), 'vende')
  assert.equal(mapActividadDataroma(''), 'mantiene')
  assert.equal(mapActividadDataroma('—'), 'mantiene')
})

test('parseDataromaHoldings extrae ticker + actividad por fila (defensivo)', () => {
  // Fixture con la estructura conocida de Dataroma (tabla de holdings).
  const html = `
  <table id="grid"><tbody>
    <tr><td><a href="/m/stock.php?sym=AAPL">AAPL</a></td><td>Apple</td><td>25%</td><td>Add 3%</td></tr>
    <tr><td><a href="/m/stock.php?sym=GOOGL">GOOGL</a></td><td>Alphabet</td><td>10%</td><td>Buy</td></tr>
    <tr><td><a href="/m/stock.php?sym=KO">KO</a></td><td>Coca-Cola</td><td>8%</td><td>Reduce 5%</td></tr>
    <tr><td><a href="/m/stock.php?sym=XOM">XOM</a></td><td>Exxon</td><td>4%</td><td></td></tr>
  </tbody></table>`
  const r = parseDataromaHoldings(html)
  const byS = Object.fromEntries(r.map(x => [x.simbolo, x.tipo]))
  assert.equal(byS.AAPL, 'amplia')
  assert.equal(byS.GOOGL, 'nueva')
  assert.equal(byS.KO, 'recorta')
  assert.equal(byS.XOM, 'mantiene')
  assert.equal(r.length, 4)
})

test('parseDataromaHoldings tolera el parámetro ?t= y no duplica tickers', () => {
  const html = `<tr><td><a href="/m/stock.php?t=MSFT">MSFT</a></td><td>Buy</td></tr>
                <tr><td><a href="/m/stock.php?t=MSFT">MSFT</a></td><td>Add</td></tr>`
  const r = parseDataromaHoldings(html)
  assert.equal(r.length, 1)           // no duplica
  assert.equal(r[0].simbolo, 'MSFT')
  assert.equal(r[0].tipo, 'nueva')    // se queda con la primera aparición
})

test('parseDataromaHoldings devuelve [] si no hay tickers', () => {
  assert.deepEqual(parseDataromaHoldings('<html><body>sin tabla</body></html>'), [])
})
