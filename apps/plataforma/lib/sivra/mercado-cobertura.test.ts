import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ventanasQuePedir, planDeVentanas, detalleIngesta, ingestaFiable, FUENTES_FIABLES,
} from './mercado-cobertura.ts'
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

// ─── recorte del plan para una pasada concreta ─────────────────────────────────────────────

test('el filtro de RONDAS se aplica ANTES del tope (si no, la profundidad nunca llega)', () => {
  // Es el caso real del 08/08/2026: las rondas de profundidad son las últimas de la cola de
  // urgencia, así que un filtro en cliente sobre las N primeras deja fuera casi todo.
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])

  const enCliente = ventanasQuePedir(plan, soloCuatro, [], HOY, 10).filter(v => v.ronda === 2)
  const enServidor = ventanasQuePedir(plan, soloCuatro, [], HOY, 10, { rondas: [2] })

  // La ronda 0 (8 ventanas) se lleva el grueso del tope: a la ronda 2 solo le llegan las sobras.
  assert.equal(enCliente.length, 2, 'filtrando en cliente solo alcanzan las que el tope no comió')
  assert.equal(enServidor.length, 8, 'filtrando antes del tope se piden las 8 que se querían')
  assert.ok(enServidor.every(v => v.ronda === 2))
})

test('el filtro de FECHAS acota por checkin, inclusive en ambos extremos', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const soloCuatro = new Map<number, string[]>([[4, ['prop_duplex_center']]])
  const v = ventanasQuePedir(plan, soloCuatro, [], HOY, 100, { desde: '2026-09-01', hasta: '2027-01-31' })

  assert.ok(v.length > 0)
  assert.ok(v.every(x => x.checkin >= '2026-09-01' && x.checkin <= '2027-01-31'))

  const unDia = ventanasQuePedir(plan, soloCuatro, [], HOY, 100,
    { desde: v[0].checkin, hasta: v[0].checkin })
  assert.ok(unDia.every(x => x.checkin === v[0].checkin), 'desde=hasta deja pasar ese día')
})

test('rondas y fechas se combinan (es la pasada que se pidió)', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-10-10', factor: 2.5 }], { mesesBase: 8 })
  const v = ventanasQuePedir(plan, AFOROS, [], HOY, 100,
    { rondas: [2, 3], desde: '2026-09-01', hasta: '2027-01-31' })

  assert.ok(v.length > 0)
  assert.ok(v.every(x => (x.ronda === 2 || x.ronda === 3)))
  assert.ok(v.every(x => x.motivo === 'mes'), 'las rondas de profundidad nunca son de evento')
  assert.ok(v.every(x => x.checkin >= '2026-09-01' && x.checkin <= '2027-01-31'))
})

test('sin filtro, el comportamiento es EXACTAMENTE el de antes', () => {
  const plan = ventanasDelBarrido(HOY, [{ fecha: '2026-09-20', factor: 2.5 }], { mesesBase: 3 })
  assert.deepEqual(
    ventanasQuePedir(plan, AFOROS, [], HOY, 12, {}),
    ventanasQuePedir(plan, AFOROS, [], HOY, 12),
  )
  assert.deepEqual(ventanasQuePedir(plan, AFOROS, [], HOY, 12, { rondas: [] }),
    ventanasQuePedir(plan, AFOROS, [], HOY, 12), 'rondas vacío = sin filtro, no «ninguna ronda»')
})

test('un filtro que no casa nada devuelve VACÍO, no el plan entero', () => {
  // El fallo caro sería «filtro imposible ⇒ lo ignoro y mido todo»: la pasada parecería la pedida.
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 3, maxEventos: 0, fechasPorMes: 1 })
  const r = planDeVentanas(plan, AFOROS, [], HOY, 12, { rondas: [9] })
  assert.deepEqual(r.ventanas, [])
  assert.equal(r.candidatas, 0)
})

test('el recorte del tope se DECLARA (un truncado mudo se lee como «esto era todo»)', () => {
  const plan = ventanasDelBarrido(HOY, [], { mesesBase: 8, maxEventos: 0, fechasPorMes: 3 })
  const r = planDeVentanas(plan, AFOROS, [], HOY, 10, { rondas: [2, 3] })

  assert.equal(r.ventanas.length, 10)
  assert.equal(r.candidatas, 32, '8 meses × 2 rondas × 2 aforos')
  assert.equal(r.recortadas, 22)

  const holgado = planDeVentanas(plan, AFOROS, [], HOY, 100, { rondas: [2, 3] })
  assert.equal(holgado.recortadas, 0, 'sin recorte no se inventa aviso')
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
