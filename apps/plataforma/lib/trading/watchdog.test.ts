import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarWatchdog, seEsperaRefresco, MAX_HORAS_SIN_REFRESCO } from './watchdog.ts'

const ahora = new Date('2026-07-21T06:30:00Z') // martes por la mañana

test('NAV fresco (~10 h) → sin alerta', () => {
  const ultimoRefresco = new Date('2026-07-20T20:16:00Z') // lunes noche, la pasada de anoche
  const r = evaluarWatchdog({ ahora, ultimoRefresco })
  assert.equal(r.alerta, false)
  assert.ok(r.horas !== null && r.horas < MAX_HORAS_SIN_REFRESCO)
})

test('NAV viejo (noche saltada, ~34 h) → alerta', () => {
  const ultimoRefresco = new Date('2026-07-19T20:16:00Z') // anteanoche → la pasada NO corrió
  const r = evaluarWatchdog({ ahora, ultimoRefresco })
  assert.equal(r.alerta, true)
  assert.ok(r.horas !== null && r.horas > MAX_HORAS_SIN_REFRESCO)
})

test('broker_saldos vacío (nunca refrescado) → alerta', () => {
  const r = evaluarWatchdog({ ahora, ultimoRefresco: null })
  assert.equal(r.alerta, true)
  assert.equal(r.horas, null)
})

test('justo en el umbral no alerta; pasado el umbral sí', () => {
  const justo = new Date(ahora.getTime() - MAX_HORAS_SIN_REFRESCO * 3_600_000)
  assert.equal(evaluarWatchdog({ ahora, ultimoRefresco: justo }).alerta, false)
  const pasado = new Date(justo.getTime() - 60_000)
  assert.equal(evaluarWatchdog({ ahora, ultimoRefresco: pasado }).alerta, true)
})

test('seEsperaRefresco: mar-sáb sí, dom y lun no', () => {
  assert.equal(seEsperaRefresco(new Date('2026-07-21T06:30:00Z')), true)  // martes
  assert.equal(seEsperaRefresco(new Date('2026-07-25T06:30:00Z')), true)  // sábado
  assert.equal(seEsperaRefresco(new Date('2026-07-26T06:30:00Z')), false) // domingo
  assert.equal(seEsperaRefresco(new Date('2026-07-27T06:30:00Z')), false) // lunes
})
