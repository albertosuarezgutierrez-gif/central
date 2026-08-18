import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarPosiciones, resumenPorDivisa, rentabilidadPosicion } from './cartera-real.ts'

// Payload real de get_account_positions (IBKR MCP, 17/08/2026) tal y como lo empuja la pasada.
const VWCE = {
  simbolo: 'vwce', descripcion: 'VANG FTSE AW USDA (VWCE @IBIS2)', cantidad: 188,
  precioMedio: 169.44467979, precioActual: 169.08000185, valorMercado: 31787.0403478,
  pnlNoRealizado: -68.5594522, pnlDiario: -68.5594522, divisa: 'eur',
}

test('normaliza el payload real: símbolo/divisa a mayúsculas, números intactos', () => {
  const { posiciones, descartadas } = normalizarPosiciones([VWCE])
  assert.equal(descartadas.length, 0)
  assert.equal(posiciones.length, 1)
  assert.equal(posiciones[0].simbolo, 'VWCE')
  assert.equal(posiciones[0].divisa, 'EUR')
  assert.equal(posiciones[0].cantidad, 188)
  assert.ok(Math.abs((posiciones[0].valorMercado ?? 0) - 31787.0403478) < 1e-9)
})

test('lo ilegible se DESCARTA y se cuenta — nunca se traga en silencio ni se colapsa a 0', () => {
  const { posiciones, descartadas } = normalizarPosiciones([
    VWCE,
    { simbolo: '', cantidad: 5 },                       // sin símbolo
    { simbolo: 'AAPL', cantidad: 'muchas' },            // cantidad ilegible
    { simbolo: 'MSFT', cantidad: 0 },                   // posición 0 = no es una posición
    { simbolo: 'VWCE', cantidad: 1 },                   // duplicado del mismo set
  ])
  assert.equal(posiciones.length, 1)
  assert.equal(descartadas.length, 4)
})

test('un dato ausente queda null, jamás 0 (regla dato-que-no-hay)', () => {
  const { posiciones } = normalizarPosiciones([{ simbolo: 'X', cantidad: 10, precioMedio: NaN }])
  assert.equal(posiciones[0].precioMedio, null)
  assert.equal(posiciones[0].valorMercado, null)
})

test('payload que no es array → 0 posiciones con el motivo contado', () => {
  const r = normalizarPosiciones({ posiciones: [VWCE] })
  assert.equal(r.posiciones.length, 0)
  assert.equal(r.descartadas.length, 1)
})

test('resumen POR DIVISA: euros y dólares no se suman entre sí', () => {
  const { posiciones } = normalizarPosiciones([
    VWCE,
    { simbolo: 'AAPL', cantidad: 10, precioMedio: 200, valorMercado: 2100, pnlNoRealizado: 100, divisa: 'USD' },
  ])
  const r = resumenPorDivisa(posiciones)
  assert.equal(r.length, 2)
  assert.equal(r[0].divisa, 'EUR')                     // ordenado por valor desc
  assert.ok(Math.abs((r[0].invertido ?? 0) - 188 * 169.44467979) < 1e-6)
  assert.equal(r[1].divisa, 'USD')
  assert.equal(r[1].valor, 2100)
  assert.ok(r[0].completo && r[1].completo)
})

test('total con posiciones sin valor → completo:false (parcial declarado, no cartera entera)', () => {
  const { posiciones } = normalizarPosiciones([
    VWCE,
    { simbolo: 'OTRO', cantidad: 3, divisa: 'EUR' },   // sin precio ni valor
  ])
  const r = resumenPorDivisa(posiciones)
  assert.equal(r[0].completo, false)
  assert.equal(r[0].n, 2)
})

test('rentabilidad = pnl sobre coste; sin coste o sin pnl → null (nunca un 0%)', () => {
  const ret = rentabilidadPosicion({ cantidad: 188, precioMedio: 169.44467979, pnlNoRealizado: -68.5594522 })
  assert.ok(ret != null && Math.abs(ret - -68.5594522 / (188 * 169.44467979)) < 1e-12)
  assert.equal(rentabilidadPosicion({ cantidad: 188, precioMedio: null, pnlNoRealizado: -68 }), null)
  assert.equal(rentabilidadPosicion({ cantidad: 188, precioMedio: 169, pnlNoRealizado: null }), null)
})
