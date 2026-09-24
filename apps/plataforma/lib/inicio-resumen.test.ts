import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimacionMes, proximosCargos, ventanaCalendario, resumenBolsa, bolsaVieja, importeDivisa, sumarDias, type ReservaCal } from './inicio-resumen.ts'

// ─── Estimación del mes ──────────────────────────────────────────────────────────────────────────

test('usa la media de gastos previstos cuando lo imputado aún no llega', () => {
  const { filas } = estimacionMes(
    [{ propertyId: 'a', nombre: 'A', reservas: 3, ingresos: 3000, gastosImputados: 400 }],
    new Map([['a', 900]]),
  )
  assert.equal(filas[0].gastos, 900)
  assert.equal(filas[0].fuente, 'prevision')
  assert.equal(filas[0].resultado, 2100)
})

test('si ya se ha gastado más que la media, cuenta lo gastado (nunca estima por debajo)', () => {
  const { filas } = estimacionMes(
    [{ propertyId: 'a', nombre: 'A', reservas: 1, ingresos: 890, gastosImputados: 1020.8 }],
    new Map([['a', 700]]),
  )
  assert.equal(filas[0].gastos, 1020.8)
  assert.equal(filas[0].fuente, 'imputados')
})

test('un piso sin histórico NO se estima con gasto 0 inventado: se dice y se usa lo imputado', () => {
  const { filas } = estimacionMes(
    [{ propertyId: 'nuevo', nombre: 'N', reservas: 2, ingresos: 500, gastosImputados: 120 }],
    new Map([['nuevo', null]]),
  )
  assert.equal(filas[0].fuente, 'sin_historico')
  assert.equal(filas[0].gastos, 120)
  // Ausente del mapa = mismo caso que null.
  assert.equal(estimacionMes([{ propertyId: 'x', nombre: 'X', reservas: 0, ingresos: 0, gastosImputados: 0 }], new Map()).filas[0].fuente, 'sin_historico')
})

test('un piso sin reservas sale con resultado negativo (los gastos corren igual)', () => {
  const { filas, total } = estimacionMes(
    [
      { propertyId: 'a', nombre: 'A', reservas: 0, ingresos: 0, gastosImputados: 0 },
      { propertyId: 'b', nombre: 'B', reservas: 2, ingresos: 1000.1, gastosImputados: 0 },
    ],
    new Map([['a', 300], ['b', 200.05]]),
  )
  assert.equal(filas[0].resultado, -300)
  assert.deepEqual(total, { reservas: 2, ingresos: 1000.1, gastos: 500.05, resultado: 500.05 })
})

// ─── Calendario ──────────────────────────────────────────────────────────────────────────────────

const HOY = '2026-09-24'
const r = (p: string, i: string, o: string, extra: Partial<ReservaCal> = {}): ReservaCal =>
  ({ propertyId: p, huesped: 'H', checkIn: i, checkOut: o, portal: 'BOOKING', pax: 2, ...extra })

test('sumarDias cruza meses sin saltos', () => {
  assert.equal(sumarDias('2026-09-29', 3), '2026-10-02')
})

test('una reserva que empezó antes se corta por la izquierda y la del borde derecho se recorta', () => {
  const v = ventanaCalendario([r('a', '2026-09-20', '2026-09-26'), r('a', '2026-10-05', '2026-10-12')], ['a'], HOY)
  const [b1, b2] = v.barras.get('a')!
  assert.deepEqual([b1.desde, b1.hasta, b1.cortadaIzq], [0, 2, true])
  assert.deepEqual([b2.desde, b2.hasta, b2.cortadaIzq], [11, 14, false])
})

test('entradas y salidas de hoy y mañana, y noches libres por piso', () => {
  const v = ventanaCalendario(
    [r('a', HOY, '2026-09-28'), r('b', '2026-09-22', '2026-09-25', { huesped: 'Novak' })],
    ['a', 'b'], HOY,
  )
  assert.equal(v.entranHoy.length, 1)
  assert.equal(v.salenManana[0].huesped, 'Novak')
  // a: 4 noches ocupadas de 14; b: 1 (la del 24) → libres 10 + 13.
  assert.equal(v.nochesLibres, 23)
})

test('quien sale HOY cuenta como salida de hoy (la consulta trae checkOut >= hoy)', () => {
  const v = ventanaCalendario([r('a', '2026-09-20', HOY, { huesped: 'Sale' })], ['a'], HOY)
  assert.equal(v.salenHoy[0]?.huesped, 'Sale')
  assert.equal(v.nochesLibres, 14, 'no ocupa ninguna noche de la ventana')
})

test('reservas de pisos que no se pintan (multi, personal) no cuentan', () => {
  const v = ventanaCalendario([r('prop_personal', HOY, '2026-09-30')], ['a'], HOY)
  assert.equal(v.entranHoy.length, 0)
  assert.equal(v.nochesLibres, 14)
})

// ─── Bolsa ───────────────────────────────────────────────────────────────────────────────────────

test('la bolsa se resume POR DIVISA: nunca suma dólares con euros', () => {
  const res = resumenBolsa([
    { simbolo: 'CVX', cantidad: 6, valorMercado: 1000, pnlNoRealizado: 80, pnlDiario: 5, divisa: 'USD' },
    { simbolo: 'SAN', cantidad: 10, valorMercado: 50, pnlNoRealizado: -2, pnlDiario: null, divisa: 'EUR' },
  ])
  assert.equal(res.length, 2)
  assert.deepEqual(res.map(x => x.divisa), ['USD', 'EUR'])
  assert.equal(res[1].pnlHoy, null, 'sin dato diario = null, no 0')
})

test('un valor que falta marca la divisa como incompleta (la cifra es un mínimo)', () => {
  const [usd] = resumenBolsa([
    { simbolo: 'A', cantidad: 1, valorMercado: 100, pnlNoRealizado: 1, pnlDiario: 1, divisa: 'USD' },
    { simbolo: 'B', cantidad: 1, valorMercado: null, pnlNoRealizado: null, pnlDiario: null, divisa: 'USD' },
  ])
  assert.equal(usd.completo, false)
  assert.equal(usd.valor, 100)
})

test('la bolsa se da por vieja pasadas 72 h sin leer IBKR', () => {
  const ahora = new Date('2026-09-24T10:00:00Z')
  assert.equal(bolsaVieja(new Date('2026-09-22T10:00:00Z'), ahora), false)
  assert.equal(bolsaVieja(new Date('2026-09-21T09:00:00Z'), ahora), true)
})

test('importes en formato español con la divisa detrás', () => {
  assert.equal(importeDivisa(1084.2, 'EUR'), '1.084,20€')
  assert.equal(importeDivisa(2000.12, 'USD'), '2.000,12 $')
})

// ─── Próximos cargos ─────────────────────────────────────────────────────────────────────────────

test('próximos cargos: solo lo que cae en los 7 días siguientes, ordenado por fecha', () => {
  const r = proximosCargos([
    { concepto: 'Hipoteca', importeMedio: -1245.6, intervaloDias: 30, ultimaFecha: '2026-08-28' }, // → 27/09
    { concepto: 'Payout Booking', importeMedio: 2310.4, intervaloDias: 7, ultimaFecha: '2026-09-22' }, // → 29/09
    { concepto: 'Seguro anual raro', importeMedio: -90, intervaloDias: 90, ultimaFecha: '2026-09-01' }, // → 30/11, fuera
  ], '2026-09-24')
  assert.deepEqual(r.map(x => [x.concepto, x.fecha]), [['Hipoteca', '2026-09-27'], ['Payout Booking', '2026-09-29']])
})

test('un recurrente atrasado no se pinta como «hoy»: salta al siguiente ciclo, como la tesorería', () => {
  const r = proximosCargos([{ concepto: 'Luz', importeMedio: -60, intervaloDias: 30, ultimaFecha: '2026-07-20' }], '2026-09-24')
  // 19/08 y 18/09 ya pasaron; el siguiente es 18/10, fuera de la semana.
  assert.equal(r.length, 0)
})
