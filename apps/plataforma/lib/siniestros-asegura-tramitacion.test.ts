import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerSiniestro } from './siniestros-asegura.ts'

const base = { id: 's1', clienteId: 'c1', polizaId: 'p1', estado: 'abierto', origen: 'cima' }

test('tramitacionCima viaja con su forma; lo mal tipado se anula, no se inventa', () => {
  const s = leerSiniestro({
    ...base,
    tramitacionCima: { situaciones: [{ codigo: 'AP' }], acciones: 'x', pagos: null, reserva: 1000, indemnizacion: '5', totalPagos: 250, posicion: 'CU' },
  })
  assert.deepEqual(s?.tramitacionCima, {
    situaciones: [{ codigo: 'AP' }], acciones: null, pagos: null, reserva: 1000, indemnizacion: null, totalPagos: 250, posicion: 'CU',
  })
})

test('sin tramitacionCima (asegura antigua) → null, nunca un objeto vacío', () => {
  assert.equal(leerSiniestro(base)?.tramitacionCima, null)
})
