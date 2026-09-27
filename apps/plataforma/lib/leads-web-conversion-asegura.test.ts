// Guardián de la lectura de `/api/operador/leads-web`. Lo que se vigila: que un
// hueco en la respuesta del puerto nunca se pinte como «0 leads» o «0%
// convertido» — eso sería afirmar una tasa que nadie ha medido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarConversionLeadsWeb } from './leads-web-conversion-asegura.ts'

test('sin_configurar y error del puerto se distinguen de un total real', () => {
  assert.deepEqual(interpretarConversionLeadsWeb(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarConversionLeadsWeb(200, { estado: 'error' }), { estado: 'error', motivo: 'asegura_error' })
  assert.deepEqual(interpretarConversionLeadsWeb(401, {}), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarConversionLeadsWeb(500, {}), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarConversionLeadsWeb(200, null), { estado: 'error', motivo: 'respuesta_ilegible' })
})

// 🚨 El cepo: con total=0 la tasa NUNCA puede ser 0 — es "no hay con qué
// calcular un ratio", que es distinto de "0% de los leads convierten".
test('total=0 da tasaConversion null, nunca 0', () => {
  const r = interpretarConversionLeadsWeb(200, {
    estado: 'ok', total: 0, convertidos: 0, tasaConversion: null,
    pendientes: [], primerLeadAt: null, ultimoLeadAt: null,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.total, 0)
    assert.equal(r.tasaConversion, null)
  }
})

test('lee un total real con pendientes bien formados', () => {
  const r = interpretarConversionLeadsWeb(200, {
    estado: 'ok',
    total: 3,
    convertidos: 1,
    tasaConversion: 1 / 3,
    pendientes: [
      { clienteId: 'a', nombre: 'Juan Pérez', createdAt: '2026-09-08T08:21:26Z', diasDesdeAlta: 7, tieneTelefono: true, tieneEmail: false },
      { clienteId: 'b', nombre: 'Ana Ruiz', createdAt: '2026-09-10T10:00:00Z', diasDesdeAlta: 5, tieneTelefono: false, tieneEmail: true },
    ],
    primerLeadAt: '2026-09-08T08:21:26Z',
    ultimoLeadAt: '2026-09-12T09:00:00Z',
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.total, 3)
  assert.equal(r.convertidos, 1)
  assert.ok(Math.abs((r.tasaConversion ?? 0) - 1 / 3) < 1e-9)
  assert.equal(r.pendientes.length, 2)
  assert.equal(r.pendientes[0].nombre, 'Juan Pérez')
})

// 🚨 Una fila sin id, sin nombre, sin fecha o sin días es basura, no un lead:
// se descarta la FILA, no toda la respuesta (que sigue siendo 'ok').
test('una fila de pendiente mal formada se descarta, no tumba la respuesta', () => {
  const r = interpretarConversionLeadsWeb(200, {
    estado: 'ok',
    total: 2,
    convertidos: 0,
    tasaConversion: 0,
    pendientes: [
      { clienteId: '', nombre: 'Sin id', createdAt: '2026-09-08T08:21:26Z', diasDesdeAlta: 1 },
      { clienteId: 'ok1', nombre: 'Bien formado', createdAt: '2026-09-08T08:21:26Z', diasDesdeAlta: 1, tieneTelefono: true, tieneEmail: true },
      'no es un objeto',
      { clienteId: 'ok2' },
    ],
    primerLeadAt: null,
    ultimoLeadAt: null,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].clienteId, 'ok1')
})

test('total o convertidos ausentes hacen la respuesta ilegible, no un 0 silencioso', () => {
  assert.deepEqual(
    interpretarConversionLeadsWeb(200, { estado: 'ok', pendientes: [] }),
    { estado: 'error', motivo: 'respuesta_ilegible' },
  )
})
