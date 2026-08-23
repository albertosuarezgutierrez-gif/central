import { test } from 'node:test'
import assert from 'node:assert/strict'
import { traducirFila, traducirScreener, truncadaPorLimite, ROIC_MAX_CREIBLE } from '../src/screenerMercado.ts'
import { rankearFactores } from '../src/factores.ts'

// Filas REALES de la respuesta del 21/08/2026 (primer uso con crédito), recortadas a lo que importa.
const ACN = { ticker: 'ACN', currency: 'USD', market_cap: 121154250394, free_cash_flow_yield: 0.10384850683392195, return_on_invested_capital: 0.3798457368410135 }
const ASAN = { ticker: 'ASAN', currency: 'USD', market_cap: 2187538258, free_cash_flow_yield: 0.05388660041437319, return_on_invested_capital: 6.675343091908363 }
const ATAT = { ticker: 'ATAT', currency: 'USD', market_cap: 4746636006, free_cash_flow_yield: 0.05743236571234993, return_on_invested_capital: 3.4528848824598906 }

test('una fila normal se traduce entera y sin avisos', () => {
  const { metricas, avisos } = traducirFila(ACN)
  assert.equal(metricas.simbolo, 'ACN')
  assert.equal(metricas.roic, 0.3798457368410135)
  assert.equal(metricas.fcfYield, 0.10384850683392195)
  assert.deepEqual(avisos, [])
})

test('el ROIC increíble se ANULA, no se recorta a un tope', () => {
  const { metricas, avisos } = traducirFila(ASAN)
  assert.equal(metricas.roic, undefined, 'un 668% de ROIC es capital invertido ≈ 0, no calidad')
  assert.notEqual(metricas.roic, ROIC_MAX_CREIBLE, 'recortarlo seguiría afirmando calidad altísima')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /no es creíble/)
  assert.equal(metricas.fcfYield, 0.05388660041437319, 'el resto de la fila se conserva')
})

test('justo en el umbral el dato se conserva; por encima se anula', () => {
  assert.equal(traducirFila({ ticker: 'X', return_on_invested_capital: 1.0 }).metricas.roic, 1.0)
  assert.equal(traducirFila({ ticker: 'X', return_on_invested_capital: 1.0001 }).metricas.roic, undefined)
})

test('un ROIC muy NEGATIVO también es denominador roto', () => {
  const { metricas } = traducirFila({ ticker: 'X', return_on_invested_capital: -4.2 })
  assert.equal(metricas.roic, undefined)
})

test('sin ROIC no se inventa nada ni se avisa de nada', () => {
  const { metricas, avisos } = traducirFila({ ticker: 'X', fcfYield: undefined } as never)
  assert.equal(metricas.roic, undefined)
  assert.deepEqual(avisos, [])
})

test('fuera de USD se anulan los yields (la capitalización es en USD)', () => {
  const { metricas, avisos } = traducirFila({ ticker: 'BRZ', currency: 'BRL', free_cash_flow_yield: 0.4, return_on_invested_capital: 0.2 })
  assert.equal(metricas.fcfYield, undefined)
  assert.equal(metricas.roic, 0.2, 'el ROIC es un ratio interno: no cruza divisas y se conserva')
  assert.match(avisos[0], /divisa BRL/)
})

test('sin campo `currency` se asume USD y no se pierde el dato', () => {
  const { metricas, avisos } = traducirFila({ ticker: 'X', free_cash_flow_yield: 0.07 })
  assert.equal(metricas.fcfYield, 0.07)
  assert.deepEqual(avisos, [])
})

test('llegar al límite marca TRUNCADA: el proveedor ordena por abecedario, no por calidad', () => {
  assert.equal(truncadaPorLimite([ACN, ASAN], 2), true)
  assert.equal(truncadaPorLimite([ACN, ASAN], 3), false)
  assert.equal(truncadaPorLimite([], 25), false)
})

test('la traducción completa acumula métricas y avisos por símbolo', () => {
  const t = traducirScreener([ACN, ASAN, ATAT], 100)
  assert.equal(t.metricas.length, 3)
  assert.equal(t.truncada, false)
  assert.deepEqual(t.avisos.map(a => a.simbolo), ['ASAN', 'ATAT'])
})

test('sin la guarda, el ROIC roto SECUESTRA el pilar de CALIDAD', () => {
  const crudo = [ACN, ASAN, ATAT].map(f => ({ simbolo: f.ticker, fcfYield: f.free_cash_flow_yield, roic: f.return_on_invested_capital }))
  const conGuarda = traducirScreener([ACN, ASAN, ATAT], 100).metricas
  const soloCalidad = { valor: 0, calidad: 1, momentum: 0 }

  // Así es como se usa el ROIC de verdad: como puerta de calidad (`seleccionCombinada`, minRoic 0,10).
  assert.equal(rankearFactores(crudo, soloCalidad)[0].simbolo, 'ASAN', 'el 668% se lleva el primer puesto')
  assert.notEqual(rankearFactores(conGuarda, soloCalidad)[0].simbolo, 'ASAN', 'anulado, ya no puntúa')
})

test('la guarda es lo único que impide que ASAN cruce un gate de calidad `roic >= 0,10`', () => {
  const MIN_ROIC = 0.1
  assert.equal(ASAN.return_on_invested_capital >= MIN_ROIC, true, 'el dato crudo pasa la puerta')
  const roic = traducirFila(ASAN).metricas.roic
  assert.equal(roic !== undefined && roic >= MIN_ROIC, false, 'saneado ya no la pasa: es un «no lo sé»')
})
