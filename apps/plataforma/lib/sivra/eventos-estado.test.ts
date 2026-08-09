import { test } from 'node:test'
import assert from 'node:assert/strict'
import { efectoDeEvento, combinarEventosDeFecha, normalizarEstado } from './eventos-estado.ts'

test('un confirmado mueve precio y suelo, como siempre', () => {
  const e = efectoDeEvento({ estado: 'confirmado', factor: 2.5 })
  assert.equal(e.factorPrecio, 2.5)
  assert.equal(e.factorSuelo, 2.5)
  assert.equal(e.mereceBarrido, true)
})

test('LA REGLA: un previsto NO toca el precio, solo el suelo', () => {
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.8 })
  assert.equal(e.factorPrecio, 1, 'una noticia de prensa no es demanda comprada')
  assert.ok(e.factorSuelo > 1 && e.factorSuelo < 2.2, `suelo a medio camino, salió ${e.factorSuelo}`)
  assert.equal(e.factorSuelo, 1.6)
})

test('un previsto siempre pide mercado: medirlo es lo que permite confirmarlo', () => {
  assert.equal(efectoDeEvento({ estado: 'previsto', factor: 1.2, confianza: 0.7 }).mereceBarrido, true)
})

test('un previsto con poca confianza no hace nada de nada', () => {
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.5, confianza: 0.3 })
  assert.equal(e.factorPrecio, 1)
  assert.equal(e.factorSuelo, 1)
  assert.equal(e.mereceBarrido, false)
  assert.match(e.motivo, /confianza/)
})

test('un previsto SIN confianza medida tampoco: null no es "seguro"', () => {
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.5, confianza: null })
  assert.equal(e.factorSuelo, 1)
  assert.equal(e.mereceBarrido, false)
})

test('lo descartado a mano no vuelve por la puerta de atrás', () => {
  const e = efectoDeEvento({ estado: 'descartado', factor: 3, confianza: 1 })
  assert.equal(e.factorPrecio, 1)
  assert.equal(e.factorSuelo, 1)
  assert.equal(e.mereceBarrido, false)
})

test('las filas viejas sin estado se leen como confirmadas, no como dudosas', () => {
  // La columna nació después que las filas: todas venían de fuentes que solo publican lo confirmado.
  assert.equal(normalizarEstado(null), 'confirmado')
  assert.equal(normalizarEstado(''), 'confirmado')
  assert.equal(normalizarEstado(undefined), 'confirmado')
  assert.equal(efectoDeEvento({ factor: 1.6 }).factorPrecio, 1.6)
})

test('un factor de 1 o menos nunca hace nada (no bajamos precios por eventos)', () => {
  for (const factor of [1, 0.9, 0, -2]) {
    const e = efectoDeEvento({ estado: 'confirmado', factor })
    assert.equal(e.factorPrecio, 1)
    assert.equal(e.factorSuelo, 1)
  }
})

test('varias fuentes sobre la misma fecha: manda el mayor de cada cosa', () => {
  // Caso real: Karol G está tres veces (ticketmaster 1.6, websearch 1.6, agente 2.5).
  const e = combinarEventosDeFecha([
    { estado: 'confirmado', factor: 1.6 },
    { estado: 'confirmado', factor: 2.5 },
    { estado: 'confirmado', factor: 1.6 },
  ])
  assert.equal(e.factorPrecio, 2.5)
  assert.equal(e.factorSuelo, 2.5)
})

test('un previsto NUNCA rebaja lo que ya aporta un confirmado de la misma fecha', () => {
  const e = combinarEventosDeFecha([
    { estado: 'confirmado', factor: 2.0 },
    { estado: 'previsto', factor: 3.0, confianza: 0.9 },
  ])
  assert.equal(e.factorPrecio, 2.0, 'el precio lo sigue poniendo solo el confirmado')
  assert.equal(e.factorSuelo, 2.0, 'el suelo del previsto (x2) no baja el del confirmado')
})

test('un previsto muy fuerte SÍ puede elevar el suelo por encima de un confirmado flojo', () => {
  const e = combinarEventosDeFecha([
    { estado: 'confirmado', factor: 1.15 },
    { estado: 'previsto', factor: 2.5, confianza: 0.9 },
  ])
  assert.equal(e.factorPrecio, 1.15)
  assert.equal(e.factorSuelo, 1.75, 'el suelo sube: es justo el caso que protege la fecha')
})

// ————— v2 (09/08/2026, decisión de Alberto): el previsto LEJANO sube el precio ponderado —————

test('v2: un previsto LEJANO sube el precio ponderado por confianza, nunca al factor pleno', () => {
  // Final de Copa (x2.2, confianza 0.8) a 120 días: 1 + 1.2×0.8×0.5 = 1.48 — apuesta, no hecho.
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.8 }, { diasVista: 120 })
  assert.equal(Number(e.factorPrecio.toFixed(2)), 1.48)
  assert.ok(e.factorPrecio < 2.2, 'el factor pleno queda reservado a la confirmación')
  assert.equal(e.factorSuelo, 1.6, 'el suelo no cambia con la v2')
})

test('v2: cerca de la fecha el previsto vuelve a solo-suelo (el premio se retira solo)', () => {
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.8 }, { diasVista: 30 })
  assert.equal(e.factorPrecio, 1, 'a 30 días no hay tiempo de deshacer una apuesta fallida')
  assert.equal(e.factorSuelo, 1.6)
})

test('v2: sin días vista (llamador viejo) el previsto no toca el precio — conservador', () => {
  const e = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.8 })
  assert.equal(e.factorPrecio, 1)
})

test('v2: la confianza pondera el premio — dos fechas candidatas no se inflan al 100%', () => {
  const alta = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.9 }, { diasVista: 200 })
  const justa = efectoDeEvento({ estado: 'previsto', factor: 2.2, confianza: 0.6 }, { diasVista: 200 })
  assert.ok(alta.factorPrecio > justa.factorPrecio)
  assert.equal(Number(justa.factorPrecio.toFixed(2)), 1.36)
})

test('v2: un confirmado sigue tarifando al factor pleno a cualquier distancia', () => {
  const e = efectoDeEvento({ estado: 'confirmado', factor: 2.5 }, { diasVista: 10 })
  assert.equal(e.factorPrecio, 2.5)
})

test('v2: al combinar, el confirmado de la misma fecha sigue mandando sobre el previsto ponderado', () => {
  const e = combinarEventosDeFecha(
    [
      { estado: 'confirmado', factor: 2.0 },
      { estado: 'previsto', factor: 2.2, confianza: 0.9 },
    ],
    { diasVista: 200 },
  )
  assert.equal(e.factorPrecio, 2.0, 'previsto ponderado 1.54 < confirmado 2.0 → max')
})

test('una fecha sin eventos sale neutra', () => {
  const e = combinarEventosDeFecha([])
  assert.equal(e.factorPrecio, 1)
  assert.equal(e.factorSuelo, 1)
  assert.equal(e.mereceBarrido, false)
})
