import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpretarRiesgo, estadoPresupuestoVariante, textoFaltan } from './riesgo-asegura.ts'

const OP = { id: 'op-1', clienteId: 'cli-1', clienteNombre: 'Manuel', ramo: 'moto', estado: 'competencia' }

function variante(extra: Record<string, unknown>) {
  return { id: 'v', referencia: 'P1', creadoAt: '2026-09-29T08:00:00.000Z', tomador: { clienteId: 'cli-1', nombre: 'Manuel' }, ...extra }
}

test('404 o estado no_encontrado → no_encontrado, nunca un riesgo vacío', () => {
  assert.deepEqual(interpretarRiesgo(404, null), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarRiesgo(200, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
})

test('un fallo del puerto es error con su motivo, no un riesgo sin figuras', () => {
  const r = interpretarRiesgo(500, { estado: 'error', causa: 'credenciales' })
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' && r.motivo, 'credenciales')
  assert.equal(interpretarRiesgo(200, { estado: 'ok' }).estado, 'error')
})

test('cambios: [] (primera o igual) ≠ null (no se puede comparar)', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', cambios: [] }), variante({ id: 'b', cambios: null }), variante({ id: 'c' })],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.deepEqual(r.riesgo.variantes[0].cambios, [])
  assert.equal(r.riesgo.variantes[1].cambios, null)
  assert.equal(r.riesgo.variantes[2].cambios, null, 'sin la clave: no consta, no «igual»')
})

test('nPrecios ausente o raro → null («—»), nunca 0 opciones', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador'], figuras: [], vinculos: [],
    variantes: [variante({ id: 'a', nPrecios: 12 }), variante({ id: 'b' }), variante({ id: 'c', nPrecios: '12' }), variante({ id: 'd', nPrecios: 0 })],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.deepEqual(r.riesgo.variantes.map((v) => v.nPrecios), [12, null, null, 0])
})

test('figura sin faltan legible → null (no se pudo leer), no «nada falta»', () => {
  const r = interpretarRiesgo(200, {
    estado: 'ok', oportunidad: OP, roles: ['tomador', 'propietario'], vinculos: [], variantes: [],
    figuras: [
      { rol: 'tomador', clienteId: 'cli-1', nombre: 'Manuel', porDefecto: true, faltan: [] },
      { rol: 'propietario', clienteId: 'cli-2', nombre: 'Antonio', vinculo: 'Padre/Madre' },
      { rol: 'inventado', clienteId: 'cli-3', nombre: 'X' },
    ],
  })
  if (r.estado !== 'ok') return assert.fail('debía leerse')
  assert.equal(r.riesgo.figuras.length, 2, 'un rol desconocido se descarta')
  assert.deepEqual(r.riesgo.figuras[0].faltan, [])
  assert.equal(r.riesgo.figuras[1].faltan, null)
  assert.equal(textoFaltan(null), 'No se pudo leer su ficha')
  assert.equal(textoFaltan([]), null)
})

test('estado del presupuesto: null = sin preparar; lo más avanzado manda', () => {
  assert.equal(estadoPresupuestoVariante(null), null)
  const base = { id: 'p', enviadoAt: null, vistoAt: null, elegidoAt: null, aceptadoAt: null, emitidoAt: null, retiradoAt: null }
  assert.equal(estadoPresupuestoVariante(base), 'Preparado, sin enviar')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', vistoAt: 'y' }), 'Enviado · visto')
  assert.equal(estadoPresupuestoVariante({ ...base, enviadoAt: 'x', retiradoAt: 'z' }), 'Retirado')
})
