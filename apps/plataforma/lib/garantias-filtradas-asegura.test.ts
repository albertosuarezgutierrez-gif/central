import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpretarGarantiasFiltradas } from './garantias-filtradas-asegura.ts'

test('respuesta buena → ok con sus ramos', () => {
  const r = interpretarGarantiasFiltradas(200, {
    estado: 'ok', presupuestosConActividad: 2,
    ramos: [{ ramo: 'auto', presupuestos: 2, garantias: [{ clave: 'robo', etiqueta: 'Robo', presupuestos: 2 }] }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.ramos[0].garantias[0].presupuestos, 2)
})

test('🚨 lo que no se puede leer es error, nunca «nadie filtra nada»', () => {
  assert.equal(interpretarGarantiasFiltradas(401, {}).estado, 'error')
  assert.equal(interpretarGarantiasFiltradas(200, null).estado, 'error')
  assert.equal(interpretarGarantiasFiltradas(200, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarGarantiasFiltradas(200, { estado: 'ok', presupuestosConActividad: 1 }).estado, 'error')
  assert.equal(interpretarGarantiasFiltradas(200, { estado: 'ok', presupuestosConActividad: 1, ramos: [{ ramo: 'auto', presupuestos: '1', garantias: [] }] }).estado, 'error')
  assert.equal(interpretarGarantiasFiltradas(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})
