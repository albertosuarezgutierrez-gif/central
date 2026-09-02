// Tests del clasificador de salud de agentes. Runner: `node --test` (type-stripping).
//
// Fija el fallo que motivó todo esto (02/09/2026): el vigía evaluaba 27 agentes cada mañana y
// tiraba el resultado, así que /operador/agentes pintaba ⚪ «sin telemetría» sobre 23 agentes
// cuyo estado real sí se conocía. Al persistirlo aparece un riesgo NUEVO y peor —que un vigía
// muerto congele la pantalla en su último verde—, y eso es lo que más se prueba aquí.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarSalud, type FilaSalud } from './agentes-salud-clasificar.ts'

const AHORA = Date.parse('2026-09-02T12:00:00Z')
const hace = (h: number) => new Date(AHORA - h * 3_600_000)

const fila = (over: Partial<FilaSalud> = {}): FilaSalud => ({
  agente: 'pricing',
  evaluado_at: hace(2),
  alerta: false,
  horas: 5,
  motivo: 'activo (5.0 h)',
  max_horas: 192,
  etiqueta: '🏷️ Agente de pricing',
  nota: 'Revisar la rutina semanal',
  sonda_error: null,
  ...over,
})

test('veredicto fresco y sin alerta → verde', () => {
  assert.equal(clasificarSalud(fila(), AHORA).estado, 'verde')
})

test('🚨 un vigía que lleva días sin pasar NO deja su último verde en pantalla', () => {
  // El fallo más caro del repo: un semáforo verde porque nadie ha mirado, no porque esté bien.
  const r = clasificarSalud(fila({ evaluado_at: hace(72), alerta: false }), AHORA)
  assert.equal(r.estado, 'gris')
  assert.match(r.detalle, /el vigía no ha pasado/)
})

test('la caducidad se mide sobre el vigía, no sobre el agente: 36h aún vale, 37h ya no', () => {
  assert.equal(clasificarSalud(fila({ evaluado_at: hace(36) }), AHORA).estado, 'verde')
  assert.equal(clasificarSalud(fila({ evaluado_at: hace(37) }), AHORA).estado, 'gris')
})

test('una sonda rota es ROJO, no verde: «no se ha podido comprobar» ≠ «está bien»', () => {
  const r = clasificarSalud(fila({ alerta: true, sonda_error: 'relation "x" does not exist' }), AHORA)
  assert.equal(r.estado, 'rojo')
  assert.match(r.detalle, /no se ha podido comprobar/)
})

test('la sonda rota gana a la alerta normal aunque haya horas', () => {
  const r = clasificarSalud(fila({ alerta: true, horas: 10, sonda_error: 'timeout' }), AHORA)
  assert.equal(r.detalle, 'no se ha podido comprobar: la sonda falló')
  assert.equal(r.horas, null)
})

test('alerta con horas dentro del doble del umbral → ámbar (retraso, no parada)', () => {
  const r = clasificarSalud(fila({ alerta: true, horas: 40, max_horas: 30, motivo: '40.0 h sin pasada buena' }), AHORA)
  assert.equal(r.estado, 'ambar')
})

test('alerta pasado el doble del umbral → rojo', () => {
  assert.equal(clasificarSalud(fila({ alerta: true, horas: 61, max_horas: 30 }), AHORA).estado, 'rojo')
})

test('🚨 horas NULL con alerta es ROJO: «sin huella» no es «0 horas»', () => {
  // Colapsar NULL a 0 lo pondría en verde: 0 h ≤ cualquier umbral. Es la regla fundacional
  // del repo (dato que NO hay ≠ dato que NO se ha mirado) sobre un semáforo.
  const r = clasificarSalud(fila({ alerta: true, horas: null, motivo: 'sin ninguna señal registrada' }), AHORA)
  assert.equal(r.estado, 'rojo')
  assert.equal(r.horas, null)
})

test('el motivo del vigía viaja intacto a la pantalla (distingue no-dispara de no-termina)', () => {
  const motivo = 'se ejecuta pero NUNCA completa una pasada buena (último intento hace 2.0 h)'
  assert.equal(clasificarSalud(fila({ alerta: true, horas: null, motivo }), AHORA).detalle, motivo)
})

test('la antigüedad del veredicto se expone para poder decir de cuándo es', () => {
  const r = clasificarSalud(fila({ evaluado_at: hace(5) }), AHORA)
  assert.equal(Math.round(r.antiguedadH), 5)
  assert.equal(r.evaluadoAt, hace(5).toISOString())
})
