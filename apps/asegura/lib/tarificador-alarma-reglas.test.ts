// Alarma «sin precio» del tarificador (04/11/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alarmaActiva, calcularAlertas, textoAlarma, type TrabajoReciente } from './tarificador-alarma-reglas.ts'
import type { FilaEstado } from './tarificador-estado-reglas.ts'

const AHORA = new Date('2026-11-04T08:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3600_000)
const fila = (o: Partial<FilaEstado> = {}): FilaEstado => ({
  compania: 'allianz', ramo: 'auto', estadoBot: 'activo',
  ultimoPrecio: { fecha: hace(2).toISOString(), canal: 'rpa', primaEur: 300 },
  d7: { ok: 5, error: 0 }, d30: { ok: 5, error: 0 }, ultimoError: null, causas7d: [], ...o,
})
const tr = (estado: string, h: number, c = 'allianz', r = 'auto'): TrabajoReciente => ({ compania: c, ramo: r, estado, creadoAt: hace(h) })

test('interruptor apagado por defecto', () => {
  assert.equal(alarmaActiva({}), false)
  assert.equal(alarmaActiva({ TARIFICADOR_ALARMA_ACTIVA: 'true' }), false)
  assert.equal(alarmaActiva({ TARIFICADOR_ALARMA_ACTIVA: ' 1 ' }), true)
})

test('sano: precio reciente y trabajos ok -> sin alertas', () => {
  assert.deepEqual(calcularAlertas([fila()], [tr('ok', 2), tr('ok', 5)], AHORA), [])
})

test('sin precio en 3 días habiendo trabajos -> alerta', () => {
  const f = fila({ ultimoPrecio: { fecha: hace(100).toISOString(), canal: 'rpa', primaEur: 1 } })
  const a = calcularAlertas([f], [tr('ok', 10)], AHORA)
  assert.deepEqual(a.map((x) => x.motivos), [['sin_precio']])
})

test('sin precio nunca (null) habiendo trabajos -> alerta', () => {
  assert.equal(calcularAlertas([fila({ ultimoPrecio: null })], [tr('error_definitivo', 1)], AHORA).length, 1)
})

test('sin precio pero SIN trabajos en 3 días -> no alarma (nadie ha pedido)', () => {
  const f = fila({ ultimoPrecio: null })
  assert.deepEqual(calcularAlertas([f], [tr('ok', 200)], AHORA), [])
  assert.deepEqual(calcularAlertas([f], [], AHORA), [])
})

test('3 errores seguidos -> alerta aunque haya precio reciente', () => {
  const a = calcularAlertas([fila()], [tr('error_definitivo', 1), tr('atascado', 2), tr('requiere_humano', 3), tr('ok', 4)], AHORA)
  assert.equal(a.length, 1)
  assert.deepEqual(a[0].motivos, ['errores_seguidos'])
  assert.equal(a[0].erroresSeguidos, 3)
})

test('2 errores seguidos no alarma; un ok en medio corta la racha', () => {
  assert.deepEqual(calcularAlertas([fila()], [tr('error_definitivo', 1), tr('error_definitivo', 2)], AHORA), [])
  assert.deepEqual(calcularAlertas([fila()], [tr('error_definitivo', 1), tr('error_definitivo', 2), tr('ok', 3), tr('error_definitivo', 4)], AHORA), [])
})

test('pendientes/en curso/cancelados no cuentan ni cortan la racha', () => {
  const t = [tr('pendiente', 0.5), tr('error_definitivo', 1), tr('cancelado', 2), tr('error_definitivo', 3), tr('error_definitivo', 4)]
  assert.equal(calcularAlertas([fila()], t, AHORA)[0].erroresSeguidos, 3)
})

test('el orden de entrada no importa (se ordena por fecha)', () => {
  const t = [tr('ok', 4), tr('error_definitivo', 3), tr('error_definitivo', 2), tr('error_definitivo', 1)]
  assert.equal(calcularAlertas([fila()], t, AHORA).length, 1)
})

test('ambos motivos en una sola alerta', () => {
  const f = fila({ ultimoPrecio: null })
  const a = calcularAlertas([f], [tr('error_definitivo', 1), tr('error_definitivo', 2), tr('error_definitivo', 3)], AHORA)
  assert.deepEqual(a[0].motivos, ['sin_precio', 'errores_seguidos'])
})

test('solo bot ACTIVO; pilotaje/exploración/sin bot se ignoran', () => {
  for (const estadoBot of ['pilotaje', 'exploracion', 'sin_bot'] as const)
    assert.deepEqual(calcularAlertas([fila({ estadoBot, ultimoPrecio: null })], [tr('error_definitivo', 1), tr('error_definitivo', 2), tr('error_definitivo', 3)], AHORA), [])
})

test('trabajos de otra pareja no se mezclan', () => {
  assert.deepEqual(calcularAlertas([fila()], [tr('error_definitivo', 1, 'mapfre'), tr('error_definitivo', 2, 'mapfre'), tr('error_definitivo', 3, 'mapfre')], AHORA), [])
})

test('texto: agrupado, motivo redactado, sin mensaje crudo ni querystring', () => {
  const f = fila({ ultimoPrecio: null, ultimoError: { tipo: 'portal', codigo: null, clave: 'hueco_mapa', origen: 'https://www.e-pacallianz.com', ruta: '/epac/cotizar/:dato', fecha: hace(1).toISOString(), modo: 'tarificar' } })
  const a = calcularAlertas([f, fila({ compania: 'mapfre', ultimoPrecio: null })], [tr('ok', 1), tr('ok', 1, 'mapfre')], AHORA)
  const t = textoAlarma(a)!
  assert.match(t, /2 compañías han dejado de dar precio/)
  assert.match(t, /portal · hueco_mapa · https:\/\/www\.e-pacallianz\.com\/epac\/cotizar\/:dato/)
  assert.equal(textoAlarma([]), null)
})

test('texto: escapa HTML y recorta a 15 líneas', () => {
  const filas = Array.from({ length: 20 }, (_, i) => fila({ compania: `c${String(i).padStart(2, '0')}<x>`, ultimoPrecio: null }))
  const trabajos = filas.map((f) => tr('ok', 1, f.compania))
  const t = textoAlarma(calcularAlertas(filas, trabajos, AHORA))!
  assert.match(t, /… y 5 más/)
  assert.ok(!t.includes('<x>'))
  assert.equal(t.split('\n').length, 1 + 15 + 1)
})

test('la alarma dice la causa más repetida en 7 días (código de lista cerrada)', () => {
  const f = fila({ d7: { ok: 0, error: 3 }, causas7d: [{ codigo: 'timeout', n: 3 }], ultimoError: { tipo: 'portal', codigo: 'timeout', clave: null, origen: null, ruta: null, fecha: hace(1).toISOString(), modo: 'tarificar' } })
  const a = calcularAlertas([f], [tr('error_definitivo', 1), tr('error_definitivo', 2), tr('error_definitivo', 3)], AHORA)
  assert.deepEqual(a[0]!.causaDominante, { codigo: 'timeout', n: 3 })
  assert.match(textoAlarma(a)!, /causa más repetida en 7 días: timeout \(3\)/)
  assert.match(textoAlarma(a)!, /\(timeout · portal\)/)
  // Sin causas leídas: sin la coletilla (no se inventa).
  const b = calcularAlertas([fila({ causas7d: null })], [tr('error_definitivo', 1), tr('error_definitivo', 2), tr('error_definitivo', 3)], AHORA)
  assert.equal(b[0]!.causaDominante, null)
  assert.ok(!/causa más repetida/.test(textoAlarma(b)!))
})
