import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ventanasQuePedir, detalleIngesta, ingestaFiable, FUENTES_FIABLES } from './mercado-cobertura.ts'
import { ventanasDelBarrido } from './mercado-ventanas.ts'

const HOY = '2026-08-06'
const AFOROS = new Map<number, string[]>([
  [4, ['prop_duplex_center']],
  [12, ['prop_house_sevillana']],
])

test('serper NO cuenta como cobertura fiable', () => {
  // Es el corazón del cambio: 20 comps de Serper para noviembre no son «noviembre medido».
  assert.deepEqual(FUENTES_FIABLES, ['booking_mcp', 'manual'])
  assert.ok(!FUENTES_FIABLES.includes('serper' as never))
})

test('lo NUNCA medido va antes que lo medido hace mucho', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 2, maxEventos: 0, fechasPorMes: 1 })
  const cobertura = [
    { checkin: plan[0].checkin, aforo: 4, ultimaMedicion: '2026-01-01', comps: 5 }, // 217 días
  ]
  const pedidas = ventanasQuePedir(plan, AFOROS, cobertura, HOY, 4)
  assert.equal(pedidas[0].diasSinMedir, null, 'una virgen manda sobre una de hace 7 meses')
  assert.equal(pedidas.at(-1)!.checkin, plan[0].checkin)
  assert.equal(pedidas.at(-1)!.aforo, 4)
})

test('entre vírgenes manda la RONDA: la línea de temporada antes que el evento', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-09-20', factor: 2.5, nombre: 'Concierto' }],
    { mesesBase: 3, maxEventos: 3 })
  const pedidas = ventanasQuePedir(plan, AFOROS, [], HOY, 30)
  const primerEvento = pedidas.findIndex(p => p.motivo === 'evento')
  const ultimaBase = pedidas.reduce((acc, p, i) => (p.ronda === 0 ? i : acc), -1)
  assert.ok(primerEvento > ultimaBase, 'toda la ronda base entra antes del primer evento')
})

test('entre medidas manda la MÁS VIEJA', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 3, maxEventos: 0, fechasPorMes: 1 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])
  const cobertura = plan.map((v, i) => ({
    checkin: v.checkin, aforo: 4,
    ultimaMedicion: ['2026-08-05', '2026-07-20', '2026-08-01'][i],
    comps: 4,
  }))
  const pedidas = ventanasQuePedir(plan, soloCuatro, cobertura, HOY, 3)
  assert.deepEqual(pedidas.map(p => p.diasSinMedir), [17, 5, 1])
})

test('cada ventana se pide UNA VEZ POR AFORO, con sus pisos', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 1, maxEventos: 0, fechasPorMes: 1 })
  const pedidas = ventanasQuePedir(plan, AFOROS, [], HOY, 10)
  assert.equal(pedidas.length, 2, '1 fecha × 2 aforos')
  assert.deepEqual(pedidas.map(p => p.aforo).sort((a, b) => a - b), [4, 12])
  assert.deepEqual(pedidas.find(p => p.aforo === 12)!.pisos, ['prop_house_sevillana'])
})

test('un aforo sin pisos no gasta ventana', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 1, maxEventos: 0, fechasPorMes: 1 })
  const conHueco = new Map<number, string[]>([[4, ['prop_duplex_center']], [2, []]])
  const pedidas = ventanasQuePedir(plan, conHueco, [], HOY, 10)
  assert.equal(pedidas.length, 1)
})

test('el tope se respeta (cada consulta al conector cuesta contexto)', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0 })
  assert.equal(ventanasQuePedir(plan, AFOROS, [], HOY, 12).length, 12)
  assert.equal(ventanasQuePedir(plan, AFOROS, [], HOY, 0).length, 1, 'nunca 0: pedir nada es un no-op mudo')
})

// ─── parte de la pasada ────────────────────────────────────────────────────────────────────

test('el parte pone PRIMERO lo que no se pudo medir', () => {
  const d = detalleIngesta({ ventanas: 12, comps: 40, sinRespuesta: 3, sinPrecio: 1, errores: [] })
  assert.ok(d.startsWith('40 comps reales en 12 ventanas'))
  assert.ok(d.includes('3 ventanas sin respuesta del conector'))
  assert.ok(d.includes('NO es «no hay mercado»'))
  assert.ok(d.includes('1 sin precio utilizable'))
})

test('una pasada limpia no inventa avisos', () => {
  assert.equal(detalleIngesta({ ventanas: 12, comps: 48, sinRespuesta: 0, sinPrecio: 0, errores: [] }),
    '48 comps reales en 12 ventanas')
})

test('ingestaFiable: cero comps NO es fiable aunque no haya errores', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 0, sinRespuesta: 0, errores: [] }), false)
})

test('ingestaFiable: si la mitad o más no responde, es el conector, no el mercado', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 8, sinRespuesta: 6, errores: [] }), false)
  assert.equal(ingestaFiable({ ventanas: 12, comps: 20, sinRespuesta: 5, errores: [] }), true)
})

test('ingestaFiable: un error técnico invalida la pasada', () => {
  assert.equal(ingestaFiable({ ventanas: 12, comps: 30, sinRespuesta: 0, errores: ['ingest 500'] }), false)
})

test('ingestaFiable: una pasada que no pidió nada no vale como buena', () => {
  assert.equal(ingestaFiable({ ventanas: 0, comps: 0, sinRespuesta: 0, errores: [] }), false)
})
