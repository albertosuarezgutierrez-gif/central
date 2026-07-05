// apps/plataforma/lib/categorias-personales.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBCATEGORIAS_GASTO, SUBCATEGORIAS_INGRESO, TODAS_SUBCATEGORIAS,
  esIngreso, esSubcategoriaValida, subcategoriaFallback, labelCat, EMOJI, DESCRIPCION_GASTO,
} from './categorias-personales.ts'

test('gasto e ingreso no se solapan y suman el total', () => {
  const g = new Set<string>(SUBCATEGORIAS_GASTO)
  for (const i of SUBCATEGORIAS_INGRESO) assert.ok(!g.has(i), `${i} no debe estar en gasto`)
  assert.equal(TODAS_SUBCATEGORIAS.length, SUBCATEGORIAS_GASTO.length + SUBCATEGORIAS_INGRESO.length)
})

test('categorías que la auto-clasificación antes no podía asignar ahora existen', () => {
  assert.ok(esSubcategoriaValida('seguro'))
  assert.ok(esSubcategoriaValida('suministros_piso'))
  assert.ok(esSubcategoriaValida('otros_gasto'))
  // 'otros' (la antigua divergencia) NO es válida: la canónica es otros_gasto.
  assert.ok(!esSubcategoriaValida('otros'))
})

test('esIngreso distingue signos', () => {
  assert.ok(esIngreso('nomina'))
  assert.ok(esIngreso('alquiler_booking'))
  assert.ok(!esIngreso('supermercado'))
})

test('fallback por signo', () => {
  assert.equal(subcategoriaFallback(true), 'otros_gasto')
  assert.equal(subcategoriaFallback(false), 'otros_ingreso')
})

test('toda subcategoría tiene emoji y todo gasto una descripción', () => {
  for (const s of TODAS_SUBCATEGORIAS) assert.ok(EMOJI[s], `falta emoji para ${s}`)
  for (const s of SUBCATEGORIAS_GASTO) assert.ok(DESCRIPCION_GASTO[s], `falta descripción para ${s}`)
})

test('labelCat legible', () => {
  assert.equal(labelCat('restaurante_bar'), 'Restaurante bar')
  assert.equal(labelCat('supermercado'), 'Supermercado')
})
