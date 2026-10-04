// Buscar un presupuesto por su referencia (AS-26-0042). Puro: sin red ni BD.
// Lo que se vigila: «no se ha podido mirar» nunca se pinta como «no existe», un caducado no ofrece
// emitir, y el documento enviado no pierde opciones en silencio.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { enlaceEmision, interpretarReferencia, lineaOpcion } from './referencia-presupuesto-asegura.ts'

const P = {
  id: '6e082872-0252-494e-bf01-414cc367945e',
  referencia: 'AS-26-0042',
  clienteId: 'c1',
  cliente: 'Antonio Cruz Sánchez',
  ramo: 'auto',
  polizaId: null,
  tarificacionId: '7e8b04be-0000-0000-0000-000000000000',
  oportunidadId: '5ca953b0-0000-0000-0000-000000000000',
  estado: 'descargado',
  emitible: true,
  venceEl: '2026-10-14T00:00:00.000Z',
  polizaEmitidaId: null,
  opciones: [{ id: 'o1', compania: 'Reale', producto: 'Autos', modalidad: 'Reale Terceros Ampliado', categoria: 'Terceros ampliado', primaEur: 358.36 }],
}

test('lo que no tiene forma de referencia ni se pregunta', () => {
  assert.deepEqual(interpretarReferencia('Antonio Cruz', 200, { estado: 'ok', presupuesto: P }), { estado: 'no_aplica' })
})

test('camino feliz, tolerante a lo tecleado', () => {
  const r = interpretarReferencia(' as 26 42 ', 200, { estado: 'ok', presupuesto: P })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.presupuesto.referencia, 'AS-26-0042')
  assert.equal(r.presupuesto.emitible, true)
  assert.equal(r.presupuesto.rotuloEstado, 'PDF descargado · no consta que saliera')
  assert.equal(lineaOpcion(r.presupuesto.opciones[0]), 'Reale · Reale Terceros Ampliado')
})

test('no se ha podido mirar ≠ no existe', () => {
  assert.equal(interpretarReferencia('AS-26-0042', 200, { estado: 'no_encontrado' }).estado, 'no_encontrado')
  for (const [status, json] of [[null, null], [401, null], [200, { estado: 'error', causa: 'conexion' }], [200, 'x'], [500, null], [200, { estado: 'sin_configurar' }]] as const) {
    assert.equal(interpretarReferencia('AS-26-0042', status, json).estado, 'error', JSON.stringify([status, json]))
  }
})

test('caducado: NO se ofrece emitir aunque asegura se equivocara', () => {
  const r = interpretarReferencia('AS-26-0042', 200, { estado: 'ok', presupuesto: { ...P, estado: 'caducado', emitible: true } })
  assert.equal(r.estado === 'ok' && r.presupuesto.emitible, false)
  assert.equal(r.estado === 'ok' && r.presupuesto.rotuloEstado, 'Caducado: hay que re-tarificar')
})

test('una opción ilegible no se descarta en silencio', () => {
  const r = interpretarReferencia('AS-26-0042', 200, { estado: 'ok', presupuesto: { ...P, opciones: [...P.opciones, { id: 'x' }] } })
  assert.equal(r.estado, 'error')
})

test('emitir abre la pantalla EXISTENTE que recupera la cotización guardada (sin pagar otra)', () => {
  assert.deepEqual(enlaceEmision(P), {
    tipo: 'emitir',
    href: '/correduria/cliente/c1/auto-nuevo?oportunidad=5ca953b0-0000-0000-0000-000000000000&tarificacion=7e8b04be-0000-0000-0000-000000000000',
    texto: 'Verificar datos y emitir',
  })
  assert.equal(enlaceEmision({ ...P, ramo: 'hogar' }).tipo, 'riesgo')
  // Regla 9: sin oportunidad enlazada no hay pantalla que la emita; nunca se manda a re-tarificar.
  const f = enlaceEmision({ ...P, oportunidadId: null })
  assert.equal(f.tipo, 'ficha')
  assert.doesNotMatch(f.href, /retarificar/)
})
