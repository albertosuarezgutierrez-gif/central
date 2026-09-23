import test from 'node:test'
import assert from 'node:assert/strict'
import { cuandoTarea, lineaEstadoIngesta, sinInvitar } from './hoy-cockpit.ts'

test('una tarea vencida se dice vencida, no «hoy»', () => {
  assert.deepEqual(cuandoTarea('2026-09-23', '2026-09-23'), { texto: 'hoy', vencida: false })
  assert.deepEqual(cuandoTarea('2026-09-22', '2026-09-23'), { texto: 'ayer', vencida: true })
  assert.deepEqual(cuandoTarea('2026-09-18', '2026-09-23'), { texto: 'hace 5 d', vencida: true })
})

test('sin invitar: un «no se sabe» no se resta como si fuera 0', () => {
  const base = { clientes: 80, conEmail: 52, invitados: 5, hanEntrado: 4, activos30: 4 }
  assert.equal(sinInvitar(base), 47)
  assert.equal(sinInvitar({ ...base, invitados: null }), null)
  assert.equal(sinInvitar({ ...base, conEmail: null }), null)
  assert.equal(sinInvitar(null), null)
})

test('la línea de CIMA nunca dice «al día» sin haberlo mirado', () => {
  assert.equal(lineaEstadoIngesta(null).tono, 'cargando')
  assert.equal(lineaEstadoIngesta({ estado: 'error', motivo: 'red' }).tono, 'aviso')
  assert.equal(lineaEstadoIngesta({ estado: 'sin_configurar' }).tono, 'aviso')
})
