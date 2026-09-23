import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarCambios, esFugaSinExplicar, type Foto, type HuellaPoliza } from './detector-cartera.ts'

const pol = (id: string, o: Partial<HuellaPoliza> = {}): HuellaPoliza => ({
  id, clienteId: 'c-' + id, estado: 'en_vigor', vencimiento: '2027-01-10', sustituida: false, fusionada: false, ...o,
})
const foto = (polizas: HuellaPoliza[], extra: Partial<Foto> = {}): Foto => ({
  polizas: Object.fromEntries(polizas.map((p) => [p.id, p])), recibos: {}, siniestros: {}, ...extra,
})
const tipos = (f: Foto | null, g: Foto) => {
  const d = detectarCambios(f, g)
  return d.eventos.map((e) => e.tipo)
}

test('sin foto anterior solo ancla: no se inventa «todo es nuevo»', () => {
  const d = detectarCambios(null, foto([pol('a'), pol('b')]))
  assert.equal(d.primeraVez, true)
  assert.equal(d.eventos.length, 0)
  assert.equal(detectarCambios(foto([]), foto([pol('a')])).primeraVez, true)
})

test('alta, renovación y ninguna novedad', () => {
  const antes = foto([pol('a')])
  assert.deepEqual(tipos(antes, foto([pol('a'), pol('b')])), ['POLIZA_CREADA'])
  assert.deepEqual(tipos(antes, foto([pol('a', { vencimiento: '2028-01-10' })])), ['POLIZA_RENOVADA'])
  assert.deepEqual(tipos(antes, foto([pol('a')])), [])
})

test('vigente → anula al vencimiento es el preaviso de fuga; vigente → cancelada es baja', () => {
  const antes = foto([pol('a'), pol('b')])
  const d = detectarCambios(antes, foto([pol('a', { estado: 'anula_al_vencimiento' }), pol('b', { estado: 'cancelada' })]))
  assert.deepEqual(d.eventos.map((e) => e.tipo), ['POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_BAJA'])
  assert.deepEqual(d.eventos[1].datos, { antes: 'en_vigor', despues: 'cancelada', vencimiento: '2027-01-10', sustituida: false })
  // una que ya estaba de baja y cambia de estado no-vigente a otro no-vigente no es una baja nueva
  assert.deepEqual(tipos(foto([pol('c', { estado: 'cancelada' })]), foto([pol('c', { estado: 'fin_riesgo' })])), [])
})

test('desaparecida solo si era vigente y no es una lápida de fusión', () => {
  assert.deepEqual(tipos(foto([pol('a'), pol('x')]), foto([pol('x')])), ['POLIZA_DESAPARECIDA'])
  assert.deepEqual(tipos(foto([pol('a', { fusionada: true }), pol('x')]), foto([pol('x')])), [])
  assert.deepEqual(tipos(foto([pol('a', { estado: 'cancelada' }), pol('x')]), foto([pol('x')])), [])
})

test('recibos: devuelto siempre avisa; cobrado solo si venía de otra situación', () => {
  const r = (situacion: string | null) => ({ r1: { id: 'r1', polizaId: 'a', clienteId: 'c', situacion } })
  const base = [pol('a')]
  assert.deepEqual(tipos(foto(base, { recibos: r('pendiente') }), foto(base, { recibos: r('devuelto') })), ['RECIBO_DEVUELTO'])
  assert.deepEqual(tipos(foto(base, { recibos: r('devuelto') }), foto(base, { recibos: r('cobrado') })), ['RECIBO_COBRADO'])
  assert.deepEqual(tipos(foto(base), foto(base, { recibos: r('cobrado') })), [], 'un recibo nuevo ya cobrado es lo normal')
  assert.deepEqual(tipos(foto(base), foto(base, { recibos: r('devuelto') })), ['RECIBO_DEVUELTO'])
})

test('siniestros: nuevo y cierre', () => {
  const s = (estado: string) => ({ s1: { id: 's1', clienteId: 'c', polizaId: 'a', estado } })
  const base = [pol('a')]
  assert.deepEqual(tipos(foto(base), foto(base, { siniestros: s('abierto') })), ['SINIESTRO_ABIERTO'])
  assert.deepEqual(tipos(foto(base, { siniestros: s('abierto') }), foto(base, { siniestros: s('rechazado') })), ['SINIESTRO_CERRADO'])
  assert.deepEqual(tipos(foto(base, { siniestros: s('cerrado') }), foto(base, { siniestros: s('rechazado') })), [])
})

test('la clave de idempotencia es estable para la misma transición y distinta entre transiciones', () => {
  const antes = foto([pol('a')])
  const k1 = detectarCambios(antes, foto([pol('a', { estado: 'cancelada' })])).eventos[0].clave
  const k2 = detectarCambios(antes, foto([pol('a', { estado: 'cancelada' })])).eventos[0].clave
  const k3 = detectarCambios(antes, foto([pol('a', { estado: 'fin_riesgo' })])).eventos[0].clave
  assert.equal(k1, k2)
  assert.notEqual(k1, k3)
})

test('una baja con sustitución registrada no es una pérdida sin explicar', () => {
  assert.equal(esFugaSinExplicar({ tipo: 'POLIZA_BAJA', datos: { sustituida: false } }), true)
  assert.equal(esFugaSinExplicar({ tipo: 'POLIZA_BAJA', datos: { sustituida: true } }), false)
  assert.equal(esFugaSinExplicar({ tipo: 'RECIBO_DEVUELTO', datos: {} }), false)
})
