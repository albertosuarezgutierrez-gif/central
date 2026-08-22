import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoActivo, resumenPatrimonio, preguntasIntake, type ActivoPatrimonio } from './patrimonio-resumen.ts'

const base: ActivoPatrimonio = {
  id: 'act_x', nombre: 'X', tipo: 'inmueble', tenencia: 'propiedad', uso: 'turistico',
  m2: 65.46, refCatastral: '5029006TG3452G0019BG', pctTitular: 100, pctConyuge: null,
  valorAdquisicion: 174650.9, hipotecaCapitalPendiente: null, hipotecaCuotaMensual: null,
  licenciaVut: true, licenciaVutNum: null,
  valoracion: { valor: 320000, enfoque: 'vut', fecha: '2026-08-20', fuente: 'alberto', metodo: 'plan de venta' },
}

test('un activo en propiedad con valoración vigente está valorado', () => {
  assert.equal(estadoActivo(base), 'valorado')
})

test('sin valoración NO es 0: es pendiente (regla «NULL = no se sabe»)', () => {
  assert.equal(estadoActivo({ ...base, valoracion: null }), 'pendiente_valoracion')
})

test('un subarrendado no es activo en propiedad: no aplica y no suma', () => {
  const sub = { ...base, id: 'act_sub', tenencia: 'alquilado', valoracion: null }
  assert.equal(estadoActivo(sub), 'no_aplica')
  const r = resumenPatrimonio([base, sub], 30000, 31000)
  assert.equal(r.inmuebles, 320000)
  // El subarrendado sin valorar NO convierte el neto en parcial (no le falta nada).
  assert.equal(r.parcial, false)
})

test('el neto es un MÍNIMO: una valoración pendiente lo marca parcial con su motivo', () => {
  const sinValorar = { ...base, id: 'act_socorro', nombre: 'Socorro', valoracion: null }
  const r = resumenPatrimonio([base, sinValorar], 10000, 0)
  assert.equal(r.inmuebles, 320000) // el pendiente no entra como 0, simplemente no entra
  assert.equal(r.neto, 10000 + 320000)
  assert.equal(r.parcial, true)
  assert.ok(r.faltan.some(f => f.includes('Socorro')))
})

test('hipoteca con cuota conocida y capital desconocido = pasivo sin cuantificar, nunca 0 silencioso', () => {
  const conHipoteca = { ...base, id: 'act_mc', nombre: 'Monte Carmelo', valoracion: null, hipotecaCuotaMensual: 772.86 }
  const r = resumenPatrimonio([conHipoteca], 0, 0)
  assert.equal(r.pasivosConocidos, 0)
  assert.equal(r.pasivoDesconocido, true)
  assert.equal(r.parcial, true)
  assert.ok(r.faltan.some(f => f.toLowerCase().includes('hipoteca')))
})

test('el capital pendiente conocido resta del neto', () => {
  const conHipoteca = { ...base, hipotecaCapitalPendiente: 50000 }
  const r = resumenPatrimonio([conHipoteca], 0, 0)
  assert.equal(r.pasivosConocidos, 50000)
  assert.equal(r.neto, 320000 - 50000)
  assert.equal(r.pasivoDesconocido, false)
})

test('cuentas bancarias sin saldo también hacen el neto parcial', () => {
  const r = resumenPatrimonio([base], 1000, 0, { cuentasSinSaldo: 2 })
  assert.equal(r.parcial, true)
  assert.ok(r.faltan.some(f => f.includes('2 cuenta')))
})

test('el intake pregunta por los NULL que importan y calla en lo que ya está', () => {
  const socorro: ActivoPatrimonio = {
    ...base, id: 'act_socorro', nombre: 'Socorro', m2: null, refCatastral: null,
    valorAdquisicion: 360000, licenciaVutNum: null, valoracion: null,
  }
  const preguntas = preguntasIntake([socorro])
  const texto = preguntas.join(' | ')
  assert.ok(texto.includes('m²'))
  assert.ok(texto.toLowerCase().includes('catastral'))
  assert.ok(texto.toLowerCase().includes('licencia'))
  // Lo que ya está no se pregunta.
  assert.ok(!texto.toLowerCase().includes('valor de compra'))
})

test('a un subarrendado no se le piden datos de propietario', () => {
  const sub: ActivoPatrimonio = { ...base, id: 'act_sub', tenencia: 'alquilado', m2: null, valorAdquisicion: null, pctTitular: null, valoracion: null }
  const preguntas = preguntasIntake([sub])
  assert.equal(preguntas.filter(p => p.includes('act_sub') || p.includes('X')).length, 0)
})
