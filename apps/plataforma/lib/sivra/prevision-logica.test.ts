import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimadoAdicional, mediaGastos, diasHastaMes, pace, desvioPrevision, decidirAlertaPace,
} from './prevision-logica.ts'

test('estimadoAdicional: gap contra el mismo mes del año anterior, nunca negativo', () => {
  assert.equal(estimadoAdicional(1000, 4000), 3000)
  assert.equal(estimadoAdicional(5000, 4000), 0) // ya superó el año pasado
})

test('estimadoAdicional sin base (null o 0€) → null, no 0', () => {
  // Una base de 0€ puede ser un piso que aún no operaba: estimar 0 desde ahí sería afirmar
  // «no vas a vender más» con un dato que no dice eso.
  assert.equal(estimadoAdicional(1000, null), null)
  assert.equal(estimadoAdicional(1000, 0), null)
})

test('mediaGastos: media de meses cerrados; sin meses → null', () => {
  assert.equal(mediaGastos([300, 400, 500]), 400)
  assert.equal(mediaGastos([]), null)
})

test('diasHastaMes cuenta días naturales hasta el día 1', () => {
  assert.equal(diasHastaMes('2026-10', new Date(Date.UTC(2026, 8, 1))), 30)  // 1-sep → 1-oct
  assert.equal(diasHastaMes('2026-09', new Date(Date.UTC(2026, 8, 15))), -14) // ya empezó
})

test('pace: delta contra lo confirmado a la misma altura del año pasado', () => {
  const p = pace({ confirmadoHoy: 1200, anteriorMismaAltura: 1000, totalAnterior: 3000, sinFechaReserva: 0 })
  assert.equal(p.deltaPct, 20)
  assert.equal(p.anteriorMismaAltura, 1000)
})

test('pace se degrada a «no medible» si el año pasado tiene demasiado ingreso sin reserved_at', () => {
  // 30% del mes equivalente sin fecha de reserva → no se sabe si ya estaban a esta altura.
  const p = pace({ confirmadoHoy: 1200, anteriorMismaAltura: 1000, totalAnterior: 3000, sinFechaReserva: 900 })
  assert.equal(p.deltaPct, null)
  assert.equal(p.anteriorMismaAltura, null)
  assert.equal(p.sinFechaReserva, 900)
})

test('pace con base 0 → delta null (no hay contra qué medir)', () => {
  const p = pace({ confirmadoHoy: 500, anteriorMismaAltura: 0, totalAnterior: 0, sinFechaReserva: 0 })
  assert.equal(p.deltaPct, null)
})

test('desvioPrevision: real contra previsto; sin previsto → null', () => {
  assert.equal(desvioPrevision(1000, 900), -10)
  assert.equal(desvioPrevision(1000, 1200), 20)
  assert.equal(desvioPrevision(null, 1200), null)
  assert.equal(desvioPrevision(0, 1200), null)
})

test('decidirAlertaPace: solo en la ventana de ~30 días y con base relevante', () => {
  // En ventana, flojo → avisa
  assert.equal(decidirAlertaPace({ diasHastaInicio: 30, confirmado: 500, totalAnterior: 3000 }).avisar, true)
  // En ventana pero va bien (≥40%) → no
  assert.equal(decidirAlertaPace({ diasHastaInicio: 30, confirmado: 1300, totalAnterior: 3000 }).avisar, false)
  // Fuera de ventana → no
  assert.equal(decidirAlertaPace({ diasHastaInicio: 45, confirmado: 100, totalAnterior: 3000 }).avisar, false)
  assert.equal(decidirAlertaPace({ diasHastaInicio: 10, confirmado: 100, totalAnterior: 3000 }).avisar, false)
  // Sin base o base irrisoria → no hay contra qué medir «flojo»
  assert.equal(decidirAlertaPace({ diasHastaInicio: 30, confirmado: 0, totalAnterior: null }).avisar, false)
  assert.equal(decidirAlertaPace({ diasHastaInicio: 30, confirmado: 0, totalAnterior: 200 }).avisar, false)
})
