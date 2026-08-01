import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ventanasDelBarrido, picosDeEvento, findeDelMes } from './mercado-ventanas.ts'

const HOY = '2026-08-01' // sábado

test('la base mensual sigue siendo el primer viernes de cada mes', () => {
  assert.equal(findeDelMes(HOY, 1), '2026-09-04')
  assert.equal(findeDelMes(HOY, 2), '2026-10-02')
  // Diciembre de 2026 empieza en martes: su primer viernes es el 4.
  assert.equal(findeDelMes(HOY, 4), '2026-12-04')
})

test('sin eventos se comporta como el barrido de siempre', () => {
  const v = ventanasDelBarrido(HOY, [], { mesesBase: 8 })
  assert.equal(v.length, 8)
  assert.ok(v.every(x => x.motivo === 'mes'))
  assert.equal(v[0].checkin, '2026-09-04')
  assert.equal(v[0].checkout, '2026-09-06')
})

test('la Feria entera gasta UNA ventana, la de mayor factor', () => {
  const feria = [
    { fecha: '2027-04-12', factor: 2.5 }, { fecha: '2027-04-13', factor: 2.6 },
    { fecha: '2027-04-14', factor: 2.8 }, { fecha: '2027-04-15', factor: 3.0 },
    { fecha: '2027-04-16', factor: 3.2 }, { fecha: '2027-04-17', factor: 3.2 },
    { fecha: '2027-04-18', factor: 2.6 },
  ]
  const picos = picosDeEvento(feria)
  assert.equal(picos.length, 1)
  assert.equal(picos[0].fecha, '2027-04-16', 'empate a 3.2 → gana la primera')
})

test('dos eventos separados son dos bloques', () => {
  const picos = picosDeEvento([
    { fecha: '2026-10-09', factor: 1.35 }, { fecha: '2026-10-10', factor: 1.40 },
    { fecha: '2026-10-30', factor: 1.35 }, { fecha: '2026-10-31', factor: 1.45 },
  ])
  assert.deepEqual(picos.map(p => p.fecha), ['2026-10-10', '2026-10-31'])
})

test('la misma fecha por dos fuentes no abre dos bloques', () => {
  // Karol G está en pricing_eventos_auto por ticketmaster, websearch Y agente.
  const picos = picosDeEvento([
    { fecha: '2027-06-11', factor: 1.6, nombre: 'ticketmaster' },
    { fecha: '2027-06-11', factor: 2.5, nombre: 'agente' },
    { fecha: '2027-06-12', factor: 1.6, nombre: 'ticketmaster' },
  ])
  assert.equal(picos.length, 1)
  assert.equal(picos[0].nombre, 'agente', 'gana el factor mayor')
})

test('lo que NO llega al umbral no gasta ventana', () => {
  assert.equal(picosDeEvento([{ fecha: '2026-09-11', factor: 1.05 }]).length, 0)
})

test('las fechas de evento se añaden a la base y se marcan como tales', () => {
  const v = ventanasDelBarrido(HOY, [
    { fecha: '2026-09-12', factor: 1.4, nombre: 'Bienal' },
    { fecha: '2027-04-16', factor: 3.2, nombre: 'Feria 2027' },
  ], { mesesBase: 2, maxEventos: 6 })

  assert.equal(v.filter(x => x.motivo === 'mes').length, 2)
  const ev = v.filter(x => x.motivo === 'evento')
  assert.deepEqual(ev.map(x => x.checkin), ['2026-09-12', '2027-04-16'])
  assert.equal(ev[0].etiqueta, 'Bienal')
})

test('prioriza lo CERCANO: lo que ya se está vendiendo', () => {
  const eventos = [
    { fecha: '2027-04-16', factor: 3.2, nombre: 'Feria' },   // lejos, factor enorme
    { fecha: '2026-08-16', factor: 1.6, nombre: 'fútbol' },  // dentro de dos semanas
  ]
  const v = ventanasDelBarrido(HOY, eventos, { mesesBase: 1, maxEventos: 1 })
  const ev = v.filter(x => x.motivo === 'evento')
  assert.equal(ev.length, 1)
  assert.equal(ev[0].checkin, '2026-08-16', 'el cercano gana al de factor mayor pero lejano')
})

test('el tope de eventos se respeta (cada ventana cuesta dinero)', () => {
  const eventos = Array.from({ length: 20 }, (_, i) => ({
    fecha: `2026-1${i < 5 ? '0' : '1'}-${String((i % 5) * 6 + 2).padStart(2, '0')}`,
    factor: 1.5,
  }))
  const v = ventanasDelBarrido(HOY, eventos, { mesesBase: 8, maxEventos: 3 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 3)
})

test('no se barre dos veces la misma fecha si la base ya la cubre', () => {
  // El 04/09 es el primer viernes de septiembre Y lo marcamos como evento.
  const v = ventanasDelBarrido(HOY, [{ fecha: '2026-09-04', factor: 2 }], { mesesBase: 1, maxEventos: 6 })
  assert.equal(v.length, 1)
  assert.equal(v[0].motivo, 'mes')
})

test('fuera del horizonte no se barre: el motor tampoco tarifica ahí', () => {
  const v = ventanasDelBarrido(HOY, [{ fecha: '2028-04-16', factor: 3.2 }], { mesesBase: 1, horizonteDias: 365 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 0)
})

test('una fecha de evento ya pasada no gasta ventana', () => {
  const v = ventanasDelBarrido(HOY, [{ fecha: '2026-04-24', factor: 3.5 }], { mesesBase: 1 })
  assert.equal(v.filter(x => x.motivo === 'evento').length, 0)
})
