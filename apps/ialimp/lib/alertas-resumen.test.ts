import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenAlertasPendientes, diasDesde, type AlertaPendiente } from './alertas-resumen.ts'

const AHORA = new Date('2026-07-11T08:00:00Z')

test('diasDesde: hoy = 0, ayer = 1, nunca negativo', () => {
  assert.equal(diasDesde('2026-07-11T07:00:00Z', AHORA), 0)
  assert.equal(diasDesde('2026-07-10T07:00:00Z', AHORA), 1)
  assert.equal(diasDesde('2026-07-20T07:00:00Z', AHORA), 0) // futuro → 0, no negativo
})

test('asunto con singular/plural', () => {
  const una: AlertaPendiente[] = [{ titulo: 'Ausencia de Ana', creada_at: '2026-07-05T08:00:00Z' }]
  assert.match(resumenAlertasPendientes('Sique Brilla', una, AHORA).asunto, /1 alerta de limpiezas/)

  const dos: AlertaPendiente[] = [...una, { titulo: 'Queja huésped', creada_at: '2026-07-04T08:00:00Z' }]
  assert.match(resumenAlertasPendientes('Sique Brilla', dos, AHORA).asunto, /2 alertas de limpiezas/)
})

test('cuerpo lista títulos, antigüedad y enlace', () => {
  const alertas: AlertaPendiente[] = [
    { titulo: 'Ausencia de Ana', descripcion: 'baja médica', creada_at: '2026-07-05T08:00:00Z' },
  ]
  const { texto } = resumenAlertasPendientes('Sique Brilla', alertas, AHORA)
  assert.match(texto, /Ausencia de Ana — baja médica \(hace 6 días\)/)
  assert.match(texto, /app\.ialimp\.es/)
  assert.match(texto, /Sique Brilla/)
})

test('trunca a 12 y anuncia el resto', () => {
  const alertas: AlertaPendiente[] = Array.from({ length: 15 }, (_, i) => ({
    titulo: `Alerta ${i + 1}`,
    creada_at: '2026-07-01T08:00:00Z',
  }))
  const { asunto, texto } = resumenAlertasPendientes('Sique Brilla', alertas, AHORA)
  assert.match(asunto, /15 alertas/)          // el total es real
  assert.match(texto, /…y 3 más\./)           // pero solo lista 12
})
