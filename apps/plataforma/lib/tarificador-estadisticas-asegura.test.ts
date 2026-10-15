// Estadísticas de los bots del tarificador (15/10/2026): lectura del puerto y textos. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ETIQUETA_MADUREZ, interpretarEstadisticas, textoCoste, textoDuracion, textoPorcentaje } from './tarificador-estadisticas-asegura.ts'

const ventana = { total: 10, ok: 6, atascado: 1, requiereHumano: 1, errorDefinitivo: 2, pctOk: 60, pctProblema: 40, tiempoMedioSeg: 95, topAtascos: [{ clave: 'iban', n: 3 }] }

test('lectura: filas válidas, versión null, ventana ausente y fila rara contada', () => {
  const r = interpretarEstadisticas(200, { estado: 'ok', generadoEn: '2026-10-15T10:00:00Z', atascosDisponibles: true, filas: [
    { compania: 'allianz', ramo: 'comunidades', botVersion: null, d7: null, d30: ventana },
    { ramo: 'auto' },
  ] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas.length, 1)
  assert.equal(r.ilegibles, 1)
  assert.equal(r.filas[0]!.botVersion, null)
  assert.equal(r.filas[0]!.d7, null)
  assert.equal(r.filas[0]!.d30!.topAtascos[0]!.clave, 'iban')
})

test('null sigue siendo null (sin datos), no 0', () => {
  const r = interpretarEstadisticas(200, { estado: 'ok', filas: [{ compania: 'a', ramo: 'b', d30: { ...ventana, pctOk: null, tiempoMedioSeg: null } }] })
  if (r.estado !== 'ok') throw new Error('ok')
  assert.equal(r.filas[0]!.d30!.pctOk, null)
  assert.equal(r.filas[0]!.d30!.tiempoMedioSeg, null)
})

test('un fallo del puerto no es «no hay trabajos»', () => {
  assert.deepEqual(interpretarEstadisticas(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarEstadisticas(503, { estado: 'error', causa: 'x' }).estado, 'error')
  assert.equal(interpretarEstadisticas(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarEstadisticas(404, null).estado, 'error')
  assert.equal(interpretarEstadisticas(401, null).estado, 'error')
})

test('textos legibles', () => {
  assert.equal(textoPorcentaje(null), 'sin datos')
  assert.equal(textoPorcentaje(0), '0 %')
  assert.equal(textoPorcentaje(62.5), '62,5 %')
  assert.equal(textoDuracion(null), 'sin datos')
  assert.equal(textoDuracion(45), '45 s')
  assert.equal(textoDuracion(95), '1 min 35 s')
  assert.equal(textoDuracion(120), '2 min')
  assert.equal(textoDuracion(7500), '2 h 5 min')
})

test('parejas: madurez y coste se leen; ausente ≠ vacío; null sigue siendo null; fila rara contada', () => {
  const p = { compania: 'allianz', ramo: 'auto', madurez: 'estable', ok7d: 4, fallos7d: 0, trabajos30d: 10, sinMedir30d: 6, segMedioPorTrabajo: 120, costeMedioEur: 0.0004, costeTotal30dEur: 0.0016 }
  const r = interpretarEstadisticas(200, { estado: 'ok', filas: [], parejas: [p, { ...p, ramo: 'moto', madurez: 'sin_precio', segMedioPorTrabajo: null, costeMedioEur: null, costeTotal30dEur: null }, { ...p, madurez: 'rara' }] })
  if (r.estado !== 'ok') throw new Error('ok')
  assert.equal(r.parejas.length, 2)
  assert.equal(r.ilegibles, 1)
  assert.equal(r.parejasIlegibles, false)
  assert.equal(r.parejas[0]!.madurez, 'estable')
  assert.equal(r.parejas[1]!.costeMedioEur, null)
  const sin = interpretarEstadisticas(200, { estado: 'ok', filas: [] })
  if (sin.estado !== 'ok') throw new Error('ok')
  assert.equal(sin.parejasIlegibles, true, 'asegura sin la versión nueva no se confunde con «sin parejas»')
})

test('coste en formato español con eur(); sub-céntimo no se pinta como 0,00€', () => {
  assert.equal(textoCoste(null), 'sin datos')
  assert.equal(textoCoste(2.5), '2,50€')
  assert.equal(textoCoste(1234.5), '1.234,50€')
  assert.equal(textoCoste(0.0004), '<0,01€')
  assert.equal(textoCoste(0), '0,00€')
  assert.equal(ETIQUETA_MADUREZ.estable.tono, 'positivo')
})
