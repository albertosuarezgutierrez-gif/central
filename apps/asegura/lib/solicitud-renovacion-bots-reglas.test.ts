// Cepos de los BOTS AUTOMÁTICOS tras la respuesta del cliente a la solicitud de la renovación (07/11/2026). Datos sintéticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CALLBACK_REINTENTAR_BOTS, algunaEnMarcha, botonesBotsRenovacion, decidirLanzamientoBots, resultadoDeEncolar, textoBotsRenovacion,
} from './solicitud-renovacion-bots-reglas.ts'

const S = '44444444-4444-4444-8444-444444444444'

test('datos completos + bot encendido + compañías → encola (ordenadas, sin repetidas)', () => {
  assert.deepEqual(decidirLanzamientoBots({ faltas: 0, rpaActivo: true, companias: ['Mapfre', 'allianz', 'allianz'] }), { accion: 'encolar', companias: ['allianz', 'mapfre'] })
})

test('NO encola: datos aún incompletos, riesgo ilegible, bot apagado, sin bots activos (en ese orden de prioridad)', () => {
  assert.deepEqual(decidirLanzamientoBots({ faltas: 2, rpaActivo: true, companias: ['allianz'] }), { accion: 'no_encolar', motivo: 'datos_incompletos' })
  assert.deepEqual(decidirLanzamientoBots({ faltas: null, rpaActivo: true, companias: ['allianz'] }), { accion: 'no_encolar', motivo: 'riesgo_no_leido' })
  assert.deepEqual(decidirLanzamientoBots({ faltas: 0, rpaActivo: false, companias: ['allianz'] }), { accion: 'no_encolar', motivo: 'bot_apagado' })
  assert.deepEqual(decidirLanzamientoBots({ faltas: 0, rpaActivo: true, companias: [] }), { accion: 'no_encolar', motivo: 'sin_bots_activos' })
})

test('idempotencia: un trabajo vivo NO es «lanzado» (se dice «ya había»), un precio reciente tampoco', () => {
  assert.equal(resultadoDeEncolar('allianz', { estado: 'encolado', duplicado: false }).tipo, 'encolado')
  assert.equal(resultadoDeEncolar('allianz', { estado: 'encolado', duplicado: true, estadoPrevio: 'en_curso' }).tipo, 'ya_en_marcha')
  assert.equal(resultadoDeEncolar('allianz', { estado: 'encolado', duplicado: true, estadoPrevio: 'pendiente' }).tipo, 'ya_en_marcha')
  assert.equal(resultadoDeEncolar('allianz', { estado: 'encolado', duplicado: true, estadoPrevio: 'ok' }).tipo, 'ya_con_precio')
  const r = resultadoDeEncolar('mapfre', { estado: 'rechazado', motivo: 'falta_datos_tomador: falta el nacimiento en la ficha' })
  assert.deepEqual(r, { compania: 'mapfre', tipo: 'rechazado', motivo: 'falta_datos_tomador' }, 'solo el código del motivo')
})

test('Telegram: bots en marcha, conserva reintento; si no se lanzó dice «bots no lanzados: motivo» y deja «Probar»', () => {
  const dec = { accion: 'encolar', companias: ['allianz'] } as const
  const ok = textoBotsRenovacion({ decision: dec, resultados: [{ compania: 'allianz', tipo: 'encolado' }] })
  assert.match(ok, /ya están en marcha/)
  assert.match(ok, /Avant2 no se ha tocado/)
  const todoRechazado = textoBotsRenovacion({ decision: dec, resultados: [{ compania: 'allianz', tipo: 'rechazado', motivo: 'bot_pausado' }] })
  assert.match(todoRechazado, /bots no lanzados: allianz: bot_pausado/)
  assert.doesNotMatch(todoRechazado, /en marcha/)
  assert.equal(algunaEnMarcha([{ compania: 'a', tipo: 'rechazado', motivo: 'x' }]), false)
  const apagado = textoBotsRenovacion({ decision: { accion: 'no_encolar', motivo: 'bot_apagado' }, resultados: [] })
  assert.match(apagado, /bots no lanzados: el tarificador RPA está apagado/)
  assert.match(apagado, /Probar/)
  assert.match(textoBotsRenovacion({ decision: dec, resultados: [], fallo: 'fallo inesperado al encolar' }), /bots no lanzados: fallo inesperado/)
})

test('el botón de reintento cabe en callback_data (≤64 bytes) y usa el prefijo cdr', () => {
  const [[b]] = botonesBotsRenovacion(S)
  assert.equal(b.callback, `${CALLBACK_REINTENTAR_BOTS}:${S}`)
  assert.ok(Buffer.byteLength(b.callback ?? '') <= 64)
  assert.ok(CALLBACK_REINTENTAR_BOTS.startsWith('cdr_'))
})

test('guardián de código: tras contestar se lanzan los bots; nunca Avant2, emisión ni envío; fallo no pierde la respuesta', () => {
  const ren = readFileSync(new URL('./solicitud-renovacion.ts', import.meta.url), 'utf8')
  assert.match(ren, /alTerminar: async \(\) => \{ await lanzarYAvisarBots\(/)
  const bots = readFileSync(new URL('./solicitud-renovacion-bots.ts', import.meta.url), 'utf8')
  const sinComentarios = bots.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
  for (const prohibido of [/codeoscopic/i, /emitir/i, /avant2/i, /tgSend/, /sendMail|enviarCorreo|whatsapp/i]) assert.doesNotMatch(sinComentarios, prohibido)
  assert.match(sinComentarios, /encolarTrabajo\(/)
  assert.match(sinComentarios, /decidirRiesgoProbar\(/, 'mismo camino y guardas que «Probar»')
  assert.match(sinComentarios, /rpaActivo\(env\)/, 'respeta el interruptor TARIFICADOR_RPA_ACTIVO')
  assert.match(sinComentarios, /catch \(x\)/, 'nunca lanza')
  assert.match(ren, /async function lanzarYAvisarBots[\s\S]*catch \(x\)[\s\S]*registrarErrorCartera\('solicitud-renovacion\/bots-aviso'/)
})
