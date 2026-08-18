import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filasTrack, serieCartera, divisasDeTrack, diaMadrid, type FilaTrack } from './cartera-track.ts'
import { resumenPorDivisa, type PosicionRealIn } from './cartera-real.ts'

const pos = (o: Partial<PosicionRealIn> & { simbolo: string }): PosicionRealIn => ({
  descripcion: null, cantidad: 1, precioMedio: null, precioActual: null,
  valorMercado: null, pnlNoRealizado: null, pnlDiario: null, divisa: 'EUR', ...o,
})

// La compra real del 17/08: 188 VWCE a 169,44€ valiendo 167,62€.
const VWCE = pos({ simbolo: 'VWCE', cantidad: 188, precioMedio: 169.44467979, precioActual: 167.62, valorMercado: 31512.56, pnlNoRealizado: -343.04 })

test('filasTrack agrega por divisa y fecha, sin mezclar monedas', () => {
  const filas = filasTrack(resumenPorDivisa([VWCE, pos({ simbolo: 'AAPL', cantidad: 10, precioMedio: 100, valorMercado: 1200, pnlNoRealizado: 200, divisa: 'USD' })]), new Date('2026-08-18T20:15:00Z'))
  assert.equal(filas.length, 2)
  const eur = filas.find(f => f.divisa === 'EUR')!
  assert.equal(eur.fecha, '2026-08-18')
  assert.equal(Math.round(eur.valor!), 31513)
  assert.equal(eur.completo, true)
  assert.equal(filas.find(f => f.divisa === 'USD')!.valor, 1200)
})

test('sin posiciones no se escribe punto (eso lo dice la marca de sincronización, no la curva)', () => {
  assert.deepEqual(filasTrack(resumenPorDivisa([]), new Date('2026-08-18T20:15:00Z')), [])
})

test('el día es el de Madrid: una pasada tras medianoche local no retrocede de día', () => {
  // 22:15 UTC del 18 = 00:15 del 19 en Madrid (verano).
  assert.equal(diaMadrid(new Date('2026-08-18T22:15:00Z')), '2026-08-19')
})

test('una posición sin valor de mercado deja el total PARCIAL, no lo da por completo', () => {
  const filas = filasTrack(resumenPorDivisa([VWCE, pos({ simbolo: 'XXX', cantidad: 5, precioMedio: 10 })]), new Date('2026-08-18T20:15:00Z'))
  assert.equal(filas[0].completo, false)
})

const serieBase: FilaTrack[] = [
  { fecha: '2026-08-17', divisa: 'EUR', invertido: 31855.6, valor: 31512.56, pnl: -343.04, completo: true, numPosiciones: 1 },
  { fecha: '2026-08-18', divisa: 'EUR', invertido: 31855.6, valor: 32100, pnl: 244.4, completo: true, numPosiciones: 1 },
]

test('serieCartera calcula rentabilidad sobre el coste y ordena por fecha', () => {
  const s = serieCartera([...serieBase].reverse(), 'EUR')
  assert.deepEqual(s.puntos.map(p => p.fecha), ['2026-08-17', '2026-08-18'])
  assert.ok(s.puntos[0].rentabilidad! < 0 && s.puntos[1].rentabilidad! > 0)
  assert.equal(s.parciales, 0)
  assert.equal(s.sinValor, 0)
})

test('un punto sin valor NO se dibuja pero se CUENTA (hueco declarado, no borrado)', () => {
  const s = serieCartera([...serieBase, { fecha: '2026-08-19', divisa: 'EUR', invertido: 31855.6, valor: null, pnl: null, completo: false, numPosiciones: 1 }], 'EUR')
  assert.equal(s.puntos.length, 2)
  assert.equal(s.sinValor, 1)
})

test('sin coste conocido la rentabilidad es null, nunca 0%', () => {
  const s = serieCartera([{ fecha: '2026-08-17', divisa: 'EUR', invertido: null, valor: 31512.56, pnl: null, completo: false, numPosiciones: 1 }], 'EUR')
  assert.equal(s.puntos[0].rentabilidad, null)
  assert.equal(s.parciales, 1)
})

test('divisasDeTrack pone primero la divisa con más peso en la última lectura', () => {
  assert.deepEqual(divisasDeTrack([
    { fecha: '2026-08-18', divisa: 'USD', invertido: 1000, valor: 1200, pnl: 200, completo: true, numPosiciones: 1 },
    ...serieBase,
  ]), ['EUR', 'USD'])
})
