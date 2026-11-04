// Estado del tarificador (04/11/2026): lectura del puerto, filtro del error redactado y textos. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorSeguro, interpretarEstado, textoMes, textoPct, textoPrima } from './tarificador-estado-asegura.ts'

const fila = (x: Record<string, unknown> = {}) => ({
  compania: 'allianz', ramo: 'auto', estadoBot: 'activo',
  ultimoPrecio: { fecha: '2026-11-02T10:00:00.000Z', canal: 'rpa', primaEur: 309.57 },
  d7: { ok: 3, error: 1 }, d30: { ok: 10, error: 4 },
  ultimoError: { tipo: 'portal', clave: 'hueco_mapa', origen: 'https://www.e-pacallianz.com', ruta: '/epac/cotizar', fecha: '2026-10-27T00:00:00.000Z', modo: 'tarificar' },
  ...x,
})

test('lectura ok: filas, fila rara contada, indicadores y Avant2', () => {
  const r = interpretarEstado(200, {
    estado: 'ok', generadoEn: '2026-11-04T10:00:00Z',
    filas: [fila(), fila({ compania: 'reale', ramo: 'moto', estadoBot: 'sin_bot', d7: { ok: 0, error: 0 }, ultimoError: null }), { ramo: 'auto' }, fila({ estadoBot: 'inventado' })],
    indicadores: { okBot7d: 3, errorBot7d: 1 },
    avant2: { mes: '2026-11', totalEur: 6.5, facturables: 13, porRamo: [{ ramo: 'auto', eur: 3.5, n: 7 }, { ramo: 'x' }] },
    fuentesAusentes: ['tarificador_pilotaje_sesiones'],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas.length, 2)
  assert.equal(r.ilegibles, 2)
  assert.equal(r.indicadores.pctOk7d, 75)
  assert.deepEqual(r.indicadores.bots, { activo: 1, pilotaje: 0, exploracion: 0, sin_bot: 1 })
  assert.equal(r.avant2!.totalEur, 6.5)
  assert.equal(r.avant2!.porRamo.length, 1)
  assert.deepEqual(r.fuentesAusentes, ['tarificador_pilotaje_sesiones'])
})

test('un fallo del puerto NO es «no hay bots»', () => {
  assert.equal(interpretarEstado(404, {}).estado, 'error')
  assert.equal(interpretarEstado(401, {}).estado, 'error')
  assert.equal(interpretarEstado(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  const e = interpretarEstado(503, { estado: 'error', causa: 'bd caída' })
  assert.deepEqual(e, { estado: 'error', causa: 'bd caída' })
  assert.equal(interpretarEstado(200, { estado: 'ok' }).estado, 'error', 'sin `filas` no es una lista vacía')
})

test('null es «sin datos», nunca 0: Avant2 ilegible, prima ausente, ventana ausente', () => {
  const r = interpretarEstado(200, { estado: 'ok', filas: [fila({ d7: null, ultimoPrecio: { fecha: '2026-11-02T10:00:00Z', canal: 'codeoscopic' } })], avant2: null })
  if (r.estado !== 'ok') throw new Error('ok')
  assert.equal(r.avant2, null)
  assert.equal(r.filas[0]!.d7, null)
  assert.equal(r.filas[0]!.ultimoPrecio!.primaEur, null)
  assert.equal(textoPrima(null), '—')
  assert.equal(textoPrima(2162.49), '2.162,49€')
  assert.equal(textoPct(null), 'sin datos')
  assert.equal(textoPct(62.5), '62,5 %')
})

test('errorSeguro: lo que no tiene forma redactada se cae (defensa si asegura manda de más)', () => {
  const bueno = errorSeguro({ tipo: 'portal', clave: 'hueco_mapa', origen: 'https://www.generali.es', ruta: '/mediadores/:dato/tarificar', fecha: '2026-11-01T00:00:00Z', modo: 'tarificar', mensaje: 'Juan Pérez 12345678Z' })
  assert.deepEqual(bueno, { tipo: 'portal', clave: 'hueco_mapa', origen: 'https://www.generali.es', ruta: '/mediadores/:dato/tarificar', fecha: '2026-11-01T00:00:00Z', modo: 'tarificar' })
  assert.ok(!JSON.stringify(bueno).includes('12345678Z'), 'el mensaje nunca pasa')
  const malo = errorSeguro({ tipo: 'portal con 1234ABC', clave: 'Calle Mayor 3', origen: 'https://x.es/ruta?nif=1', ruta: '/poliza/40681298?dni=12345678Z', fecha: '2026-11-01T00:00:00Z' })
  assert.deepEqual(malo, { tipo: 'otro', clave: null, origen: null, ruta: null, fecha: '2026-11-01T00:00:00Z', modo: null })
  assert.equal(errorSeguro({ tipo: 'portal' }), null, 'sin fecha no es un error legible')
  assert.equal(errorSeguro(null), null)
})

test('textoMes', () => {
  assert.equal(textoMes('2026-11'), 'noviembre de 2026')
  assert.equal(textoMes('raro'), 'raro')
})
