import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirMigracion, explicarMigracion } from './migracion-decision.ts'

// Regresión del 01/09/2026. `estadoMigracion` contaba TABLAS, y el volcado dejó
// 53 tablas con cero filas: «migrado» pasó a true, el ámbito saltó de
// `pendiente` a `sin-asignar`, y la pantalla afirmaba «tu cuenta no está
// vinculada a ninguna correduría» —una ausencia COMPROBADA— sobre una cartera
// de 32.600 fichas que existe y está viva.

test('🚨 tablas sin datos NO es estar migrado: es tener el sitio, no el dato', () => {
  const r = decidirMigracion({ tablas: 53, corredurias: 0, error: false })
  assert.equal(r.migrado, false)
  assert.equal(r.tablas, 53, 'el número de tablas se conserva, para poder explicarlo')
})

test('y lo dice sin afirmar que no haya cartera', () => {
  const texto = explicarMigracion(decidirMigracion({ tablas: 53, corredurias: 0, error: false }))
  assert.match(texto, /53 tablas/)
  assert.match(texto, /NO significa que la correduría no tenga cartera/)
})

test('con una correduría dentro sí está migrado, y no hay nada que explicar', () => {
  const r = decidirMigracion({ tablas: 53, corredurias: 1, error: false })
  assert.equal(r.migrado, true)
  assert.equal(explicarMigracion(r), '')
})

test('sin tablas tampoco está migrado, y eso NO es un error', () => {
  const r = decidirMigracion({ tablas: 0, corredurias: 0, error: false })
  assert.equal(r.migrado, false)
  assert.equal(r.error, false)
  assert.match(explicarMigracion(r), /todavía no se ha traído/)
})

test('un fallo de lectura NO se degrada a «no hay»: se marca como error', () => {
  const r = decidirMigracion({ tablas: 53, corredurias: 0, error: true })
  assert.equal(r.migrado, false)
  assert.equal(r.error, true)
  assert.match(explicarMigracion(r), /No lo leas como que no hay/)
})

test('el error manda aunque llegue un recuento: el de una consulta fallida no vale', () => {
  const r = decidirMigracion({ tablas: 53, corredurias: 999, error: true })
  assert.equal(r.migrado, false)
  assert.equal(r.corredurias, 0)
})
