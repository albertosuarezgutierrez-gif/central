import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aMaterial, disponibleTrasEditarTotal } from '../lib/materiales-repo.ts'

test('aMaterial mapea fila Prisma a Material del modulo', () => {
  const fila = {
    id: 'm1', cuentaId: 'c1', negocioId: 'n1', familiaId: 'f1',
    nombre: 'Plato llano', categoria: 'vajilla', tipo: 'activo', estado: 'operativo',
    cantidadTotal: 100, cantidadDisponible: 80, unidadesPorBandeja: 12,
    stockMinimo: 10, costeReposicion: '2.50', precioCompra: '1.20',
    codigo: 'PLL', imagenUrl: null, activo: true,
  }
  const m = aMaterial(fila as any)
  assert.equal(m.id, 'm1')
  assert.equal(m.negocioId, 'n1')
  assert.equal(m.nombre, 'Plato llano')
  assert.equal(m.tipo, 'activo')
  assert.equal(m.cantidadTotal, 100)
  assert.equal(m.cantidadDisponible, 80)
  assert.equal(m.costeReposicion, 2.5)
})

test('disponibleTrasEditarTotal ajusta por delta sin perder lo que esta fuera', () => {
  // 100 total, 80 disponible (20 fuera). Subir total a 120 => disponible 100 (20 siguen fuera).
  assert.equal(disponibleTrasEditarTotal(100, 80, 120), 100)
  // Bajar total a 90 => disponible 70.
  assert.equal(disponibleTrasEditarTotal(100, 80, 90), 70)
  // Nunca negativo.
  assert.equal(disponibleTrasEditarTotal(100, 80, 10), 0)
})
