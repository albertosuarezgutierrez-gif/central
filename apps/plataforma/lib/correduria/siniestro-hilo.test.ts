import test from 'node:test'
import assert from 'node:assert/strict'
import { cuerpoCaja, estadoPlazo, leerEsperando, leerHilo, leerMensajes, plegarTexto, textoDias } from './siniestro-hilo.ts'

test('mensajes null ≠ []', () => {
  assert.equal(leerMensajes(null), null)
  assert.deepEqual(leerMensajes([]), [])
  assert.deepEqual(leerMensajes([{ id: 'x', autor: 'raro', tipo: 'nota', texto: 'a' }]), [])
})
test('leerHilo tolera error y campos ausentes', () => {
  assert.equal(leerHilo({ estado: 'error' }), null)
  const h = leerHilo({ poliza: { id: 'p' } })!
  assert.equal(h.mensajes, null)
  assert.equal(h.diasEsperandoCompania, null)
  assert.deepEqual(h.poliza?.documentos, [])
})
test('plazo sin fecha base nunca es 0', () => {
  const e = estadoPlazo({ clave: 'a', etiqueta: 'A', fecha: null, diasRestantes: null, baseLegal: null, verificado: true })
  assert.equal(e.texto, 'falta la fecha base')
  assert.equal(e.tono, 'neutral')
})
test('plazo rojo <15 y aviso si no verificado', () => {
  const p = { clave: 'a', etiqueta: 'A', fecha: '2026-11-01', diasRestantes: 14, baseLegal: null, verificado: false }
  assert.equal(estadoPlazo(p).tono, 'malo')
  assert.match(estadoPlazo(p).aviso, /pendiente de verificar/)
  assert.deepEqual({ ...estadoPlazo({ ...p, diasRestantes: 15, verificado: true }) }, { ...estadoPlazo({ ...p, diasRestantes: 15, verificado: true }), ...{ tono: 'neutral', aviso: null } })
  assert.equal(estadoPlazo({ ...p, diasRestantes: -2 }).texto, 'vencido hace 2 días')
})
test('plegado', () => {
  assert.equal(plegarTexto('corto', false).plegado, false)
  const largo = 'x'.repeat(700)
  assert.equal(plegarTexto(largo, false).plegado, true)
  assert.equal(plegarTexto(largo, true).visible.length, 700)
})
test('días y esperando', () => {
  assert.equal(textoDias(1), '1 día')
  assert.equal(textoDias(null), 'sin fecha base')
  assert.equal(leerEsperando({}), null)
  assert.deepEqual(leerEsperando([{ siniestroId: 'a', dias: 3 }, { siniestroId: 'b', dias: 20 }, { dias: 1 }])!.map(x => x.siniestroId), ['b', 'a'])
})
test('caja', () => {
  assert.deepEqual(cuerpoCaja('interna', ' hola ', null), { autor: 'interna', tipo: 'nota', texto: 'hola' })
  assert.deepEqual({ ...cuerpoCaja('enviado', 'x', 'd1') }, { ...cuerpoCaja('enviado', 'x', 'd1'), ...{ autor: 'corredor', tipo: 'enviado', documentoId: 'd1' } })
})
