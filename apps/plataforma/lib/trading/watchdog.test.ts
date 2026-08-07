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

test('el aviso de huella VIEJA nombra su tramo, no siempre el NAV', () => {
  // El 07/08/2026 el aviso salió como «Análisis/tesis: el NAV de IBKR lleva 21.0 h sin refrescarse»
  // con el NAV fresco de 10 h: el texto del tramo 1 estaba cableado en el motivo de los tres. Mandaba
  // a mirar IBKR y la rutina cuando el que no se había movido era el análisis.
  const viejo = new Date('2026-07-19T20:16:00Z')
  const r = evaluarWatchdog({ ahora, ultimoRefresco: viejo, etiqueta: 'el análisis de la pasada (/analizar)' })
  assert.equal(r.alerta, true)
  assert.match(r.motivo, /\/analizar/)
  assert.doesNotMatch(r.motivo, /NAV/)
  // Sin `etiqueta` sigue hablando del NAV (tramo 1 intacto).
  assert.match(evaluarWatchdog({ ahora, ultimoRefresco: viejo }).motivo, /NAV de IBKR/)
})

test('el «nunca» nombra la huella que falta, no siempre el NAV', () => {
  // Sin `huella` sigue hablando del NAV (compatibilidad con el tramo 1).
  assert.match(evaluarWatchdog({ ahora, ultimoRefresco: null }).motivo, /NAV de IBKR/)
  // Con `huella`, el aviso manda a mirar la tabla CORRECTA: decirle «broker_saldos vacío» a
  // Alberto cuando lo que falta es el cierre de /puntuar es mandarlo al sitio equivocado.
  const r = evaluarWatchdog({
    ahora, ultimoRefresco: null,
    huella: 'ni una sola pasada buena de /puntuar (agente_latidos.trading_puntuar)',
  })
  assert.equal(r.alerta, true)
  assert.match(r.motivo, /trading_puntuar/)
  assert.doesNotMatch(r.motivo, /broker_saldos/)
})
