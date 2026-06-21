import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resumenJornada, detalleJornada, chequearDescansos, horasExtra, costePersonal, isoWeek,
} from '../src/jornada.ts'
import type { TurnoFichaje } from '../src/types.ts'

function turno(p: Partial<TurnoFichaje> & { camarero_id: string | null; fecha: string }): TurnoFichaje {
  return {
    camarero_nombre: p.camarero_id ?? 'X',
    entrada_at: `${p.fecha}T08:00:00Z`,
    salida_at: `${p.fecha}T17:00:00Z`,
    horas_totales: 9,
    tipo: 'normal',
    ...p,
  }
}

test('isoWeek agrupa lunes-domingo en la misma semana', () => {
  const w = isoWeek('2026-06-15') // lunes
  assert.equal(isoWeek('2026-06-19'), w) // viernes misma semana
  assert.match(w, /^2026-W\d{2}$/)
})

test('resumenJornada: horas, días, media, semana y excesos', () => {
  const dias = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19']
  const turnos: TurnoFichaje[] = [
    ...dias.map(f => turno({ camarero_id: 'a', camarero_nombre: 'Ana', fecha: f })), // 5×9 = 45h
    turno({ camarero_id: 'b', camarero_nombre: 'Beto', fecha: '2026-06-15', horas_totales: 10 }), // exceso diario
    // turno abierto → se ignora en el cómputo legal
    { camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-20', entrada_at: '2026-06-20T08:00:00Z', salida_at: null, horas_totales: null, tipo: 'normal' },
  ]
  const r = resumenJornada(turnos)
  assert.equal(r.length, 2)
  const ana = r.find(x => x.camarero_id === 'a')!
  const beto = r.find(x => x.camarero_id === 'b')!
  assert.equal(ana.dias_trabajados, 5)
  assert.equal(ana.horas_totales, 45)
  assert.equal(ana.media_diaria, 9)
  const wk = isoWeek('2026-06-15')
  assert.equal(ana.horas_por_semana[wk], 45)
  assert.ok(ana.excesos.some(e => e.tipo === 'semana')) // 45 > 40
  assert.ok(!ana.excesos.some(e => e.tipo === 'dia'))    // 9 no supera 9 (estricto)
  assert.equal(beto.horas_totales, 10)
  assert.ok(beto.excesos.some(e => e.tipo === 'dia' && e.clave === '2026-06-15')) // 10 > 9
  // ordenado por horas desc
  assert.equal(r[0].camarero_id, 'a')
})

test('detalleJornada: serie por fecha ordenada y agregada', () => {
  const turnos: TurnoFichaje[] = [
    turno({ camarero_id: 'a', fecha: '2026-06-16' }),
    turno({ camarero_id: 'a', fecha: '2026-06-15' }),
    turno({ camarero_id: 'a', fecha: '2026-06-15', horas_totales: 2 }), // mismo día → suma
  ]
  const d = detalleJornada(turnos)
  assert.deepEqual(d['a'].map(p => p.fecha), ['2026-06-15', '2026-06-16'])
  assert.equal(d['a'][0].horas, 11) // 9 + 2
})

test('chequearDescansos: <12h entre jornadas se marca', () => {
  const turnos: TurnoFichaje[] = [
    { camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-20', entrada_at: '2026-06-20T10:00:00Z', salida_at: '2026-06-20T22:00:00Z', horas_totales: 12, tipo: 'normal' },
    { camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-21', entrada_at: '2026-06-21T06:00:00Z', salida_at: '2026-06-21T14:00:00Z', horas_totales: 8, tipo: 'normal' }, // gap 8h < 12
  ]
  const avisos = chequearDescansos(turnos)
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].tipo, 'entre_jornadas')
  assert.equal(avisos[0].horas, 8)
})

test('chequearDescansos: >=12h no se marca', () => {
  const turnos: TurnoFichaje[] = [
    { camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-20', entrada_at: '2026-06-20T08:00:00Z', salida_at: '2026-06-20T16:00:00Z', horas_totales: 8, tipo: 'normal' },
    { camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-21', entrada_at: '2026-06-21T08:00:00Z', salida_at: '2026-06-21T16:00:00Z', horas_totales: 8, tipo: 'normal' }, // gap 16h
  ]
  assert.equal(chequearDescansos(turnos).length, 0)
})

test('costePersonal: coste por empleado, total, % sobre ventas y ventas/hora', () => {
  const turnos: TurnoFichaje[] = [
    turno({ camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-15', horas_totales: 10 }),
    turno({ camarero_id: 'b', camarero_nombre: 'Beto', fecha: '2026-06-15', horas_totales: 5 }),
  ]
  const c = costePersonal(turnos, { a: 12, b: 10 }, 1000)
  assert.equal(c.horas_total, 15)
  assert.equal(c.coste_total, 170)            // 10*12 + 5*10
  assert.equal(c.ventas, 1000)
  assert.equal(c.pct_sobre_ventas, 17)        // 170/1000
  assert.ok(Math.abs(c.ventas_por_hora! - 66.67) < 0.01) // 1000/15
  assert.equal(c.lineas[0].camarero_id, 'a')  // mayor coste primero
  // sin ventas → ratios null
  const c0 = costePersonal(turnos, { a: 12 })
  assert.equal(c0.pct_sobre_ventas, null) // sin ventas no hay %
  assert.equal(c0.ventas_por_hora, 0)     // ventas 0 / horas → 0
  assert.equal(c0.lineas.find(l => l.camarero_id === 'b')!.coste, 0) // sin coste_hora → 0
})

test('horasExtra: suma turnos tipo extra y detecta tope anual', () => {
  const turnos: TurnoFichaje[] = [
    turno({ camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-15', horas_totales: 85, tipo: 'extra' }),
    turno({ camarero_id: 'a', camarero_nombre: 'Ana', fecha: '2026-06-16', horas_totales: 10, tipo: 'normal' }), // no cuenta
    turno({ camarero_id: 'b', camarero_nombre: 'Beto', fecha: '2026-06-15', horas_totales: 5, tipo: 'extra' }),
  ]
  const e = horasExtra(turnos)
  const ana = e.find(x => x.camarero_id === 'a')!
  const beto = e.find(x => x.camarero_id === 'b')!
  assert.equal(ana.horas_extra, 85)
  assert.equal(ana.supera_tope, true)  // 85 > 80
  assert.equal(beto.horas_extra, 5)
  assert.equal(beto.supera_tope, false)
})
